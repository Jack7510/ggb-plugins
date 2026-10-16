import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const root = fileURLToPath(new URL('../', import.meta.url));
const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  baseline: { type: 'string' }, output: { type: 'string' }, repeats: { type: 'string' },
} });
if (!values.baseline || !positionals.length) {
  throw new Error('Usage: node scripts/benchmark.mjs --baseline REF [--output DIR] [--repeats 5] name=request.json ...');
}
const baseline = execFileSync('git', ['rev-parse', values.baseline], { cwd: root, encoding: 'utf8' }).trim();
const output = resolve(values.output ?? 'output/performance-benchmark');
const repeats = Number(values.repeats ?? 5);
if (!Number.isInteger(repeats) || repeats < 1 || repeats > 20) throw new Error('Expected 1-20 repetitions');
const cases = positionals.map(argument => {
  const split = argument.indexOf('=');
  if (split < 1) throw new Error('Each case must be name=request.json');
  const name = argument.slice(0, split);
  if (!/^[A-Za-z0-9_-]+$/.test(name) || name === 'doctor') throw new Error('Invalid case name');
  return [name, resolve(argument.slice(split + 1))];
});
assert.equal(new Set(cases.map(([name]) => name)).size, cases.length, 'Duplicate case name');
await mkdir(output, { recursive: true });
const inputs = [];
for (const [name, path] of cases) {
  inputs.push({ name, path, sha256: createHash('sha256').update(await readFile(path)).digest('hex') });
}

// Load the original modules in memory; reuse unchanged package assets and dependencies.
// This experiment requires a baseline with compatible schema, compiler and runtime.
const moduleUrls = {};
for (const name of ['verify', 'browser', 'delivery', 'doctor']) {
  const source = execFileSync('git', ['show', `${baseline}:src/${name}.ts`], { cwd: root, encoding: 'utf8' });
  let js = stripTypeScriptTypes(source, { mode: 'strip' });
  js = js.replace(/from '(.\/[^']+\.js)'/g, (_, relative) => {
    const target = relative.slice(2, -3);
    return `from '${moduleUrls[target] ?? pathToFileURL(root + '/dist/src/' + target + '.js').href}'`;
  });
  js = js.replaceAll("'playwright'", "'" + import.meta.resolve('playwright') + "'");
  moduleUrls[name] = 'data:text/javascript;base64,' + Buffer.from(js).toString('base64');
}
const implementations = {
  before: await import(moduleUrls.delivery),
  after: await import(pathToFileURL(root + '/dist/src/delivery.js').href),
};
const doctors = {
  before: await import(moduleUrls.doctor),
  after: await import(pathToFileURL(root + '/dist/src/doctor.js').href),
};
const { compareSnapshots } = await import(pathToFileURL(root + '/dist/src/verify.js').href);
const rows = [], references = new Map();
for (let repeat = 0; repeat < repeats; repeat++) {
  const order = repeat % 2 ? ['after', 'before'] : ['before', 'after'];
  for (const [name, path] of cases) {
    for (const side of order) {
      const request = JSON.parse(await readFile(path, 'utf8'));
      request.outputDir = output + '/runs/' + side + '/' + name;
      const start = performance.now();
      const result = await implementations[side].build(request);
      const ms = performance.now() - start;
      const report = JSON.parse(await readFile(result.report, 'utf8'));
      const run = JSON.parse(await readFile(result.delivery + '/../run.json', 'utf8'));
      const reference = references.get(name);
      if (reference) {
        compareSnapshots(report.construction.objects, reference.construction.objects);
        assert.equal(report.construction.results.length, reference.construction.results.length);
        assert.equal(report.interaction.samples.length, reference.interaction.samples.length);
      } else references.set(name, report);
      const passed = [report.construction.status, report.reload.status, report.interaction.status].every(s => s === 'passed');
      assert(passed, 'Benchmark delivery did not pass');
      rows.push({ name, side, repeat, ms, delivery: result.delivery, passed,
        checks: report.construction.results.length, samples: report.interaction.samples.length,
        observationTimings: run.observationTimings });
      console.log(JSON.stringify({ name, side, repeat, ms: Math.round(ms) }));
    }
  }
  if (repeat < 3) {
    for (const side of order) {
      const start = performance.now();
      await doctors[side].doctor();
      rows.push({ name: 'doctor', side, repeat, ms: performance.now() - start });
    }
  }
}
const median = values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
const summary = {};
for (const name of [...cases.map(([name]) => name), 'doctor']) {
  const old = median(rows.filter(r => r.name === name && r.side === 'before').map(r => r.ms));
  const fresh = median(rows.filter(r => r.name === name && r.side === 'after').map(r => r.ms));
  summary[name] = { beforeMs: Math.round(old), afterMs: Math.round(fresh), reductionPercent: +((old - fresh) / old * 100).toFixed(1) };
}
await writeFile(output + '/comparison.json', JSON.stringify({ baseline, inputs, repeats,
  method: 'Serial alternating before/after; up to three full doctors per side; same installed assets; model and OS browser excluded.',
  summary, rows }, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
