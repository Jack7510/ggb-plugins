import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
// Inventory hints only: never parse mathematics or decide execution permission here.
export function commandCalls(source, catalog) {
  const text = source.replace(/"(?:\\.|[^"\\])*"/g, '');
  return [...new Set([...text.matchAll(/\b([A-Z][A-Za-z0-9]*)\s*[([]/g)]
    .map(match => match[1]).filter(name => catalog.includes(name)))].sort();
}

export function inventory(catalog, cases) {
  return catalog.map(command => ({ command, status: cases.some(item => item.calls.includes(command)) ? 'delivered_examples' : 'not_tested',
    evidence: cases.filter(item => item.calls.includes(command)).map(item => item.name) }));
}

export async function runCoverage(destination) {
  const { build, openPreview, sha256 } = await import('../dist/src/delivery.js');
  const catalog = JSON.parse(await readFile(join(root, 'docs/command-catalog.json'), 'utf8'));
  const runtime = JSON.parse(await readFile(join(root, 'runtime.lock.json'), 'utf8'));
  await mkdir(destination, { recursive: true });
  const directory = await mkdtemp(join(destination, 'coverage-'));
  const cases = [];
  for (const name of ['triangle', 'parabola', 'algebra', 'functions', 'statistics', 'client-ellipse']) {
    const sourceDirectory = ['triangle', 'parabola'].includes(name)
      ? 'examples' : 'tests/fixtures';
    const input = JSON.parse(await readFile(
      join(root, sourceDirectory, `${name}.json`), 'utf8'));
    input.outputDir = join(directory, name);
    const result = await build(input);
    const preview = await openPreview(result.delivery, false);
    try { await preview.page.screenshot({ path: join(result.delivery, 'coverage-preview.png') }); }
    finally { await preview.close(); }
    assert.equal(preview.browser.isConnected(), false);
    await assert.rejects(fetch(preview.url));
    const manifest = JSON.parse(await readFile(join(result.delivery, 'manifest.json'), 'utf8'));
    assert.equal(manifest.runtimeVersion, runtime.version);
    assert.equal(sha256(await readFile(result.file)), manifest.sha256);
    const report = JSON.parse(await readFile(result.report, 'utf8'));
    const uses = [];
    for (const step of input.plan.program) {
      if (step.op === 'native') uses.push({ mode: step.mode, role: 'program', source: step.source });
      else if (step.op === 'command') uses.push({ mode: 'algebra', role: 'program', source: `${step.name}(...)` });
    }
    for (const requirement of input.plan.requirements) for (const check of requirement.checks) {
      if (check.kind === 'expression') {
        uses.push({ mode: check.mode, role: 'check', source: check.expression });
        if (check.assumptions?.length) uses.push({ mode: 'cas', role: 'check', source: `Assume(${check.assumptions.join(',')},${check.expression})` });
      }
    }
    for (const use of uses) use.commands = commandCalls(use.source, catalog.commands);
    cases.push({ name, ...result, ggbSha256: manifest.sha256,
      requestSha256: manifest.requestSha256, construction: report.construction.status,
      reload: report.reload.status, samples: report.interaction.samples.length,
      uses, calls: [...new Set(uses.flatMap(use => use.commands))].sort() });
  }
  const record = { protocolVersion: 1, runtime, catalog,
    catalogSha256: createHash('sha256').update(await readFile(join(root, 'docs/command-catalog.json'))).digest('hex'),
    created: new Date().toISOString(), cases, commands: inventory(catalog.commands, cases) };
  await writeFile(join(directory, 'coverage.json'), JSON.stringify(record, null, 2) + '\n');
  return { directory, total: record.commands.length, delivered: record.commands.filter(item => item.status === 'delivered_examples').length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(await runCoverage(resolve(process.argv[2] ?? join(root, 'output/command-coverage')))));
}
