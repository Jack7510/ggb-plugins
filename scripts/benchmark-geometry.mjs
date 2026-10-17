/**
 * @fileoverview Measures serial geometry CLI runs and retains all attempts.
 * Stops on failure so the agent can inspect and repair the authored input.
 */
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { performance } from 'node:perf_hooks';
import { openPreview } from '../dist/src/delivery.js';

const root = resolve(import.meta.dirname, '..');
const output = resolve(process.argv[2] ?? 'output/geometry-benchmark-20261016');
const fixtures = resolve(process.argv[3] ?? 'examples/geometry-benchmark');
const repeats = Number(process.argv[4] ?? 3);
if (!Number.isInteger(repeats) || repeats < 1 || repeats > 20) {
  throw new Error('Expected 1-20 repetitions');
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
await mkdir(output, { recursive: true });
const checkpoint = join(output, 'attempts.json');
const rows = await readFile(checkpoint, 'utf8').then(JSON.parse, () => []);

/** Runs the actual CLI; execution errors remain measurable results. */
async function invoke(args) {
  const started = performance.now();
  return await new Promise((done, reject) => {
    const child = spawn(process.execPath, ['dist/src/cli.js', ...args], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.on('error', reject);
    child.on('close', code => {
      const ms = performance.now() - started;
      let envelope;
      try {
        envelope = JSON.parse(stdout.trim());
      } catch {
        envelope = { ok: false, error: { message: stdout || stderr } };
      }
      done({ code, ms, stdout, stderr, envelope });
    });
  });
}

/** Reuses the production preview gates and closes its headless resources. */
async function checkPreview(delivery, directory) {
  const started = performance.now();
  let session;
  try {
    session = await openPreview(delivery, false);
    const readyMs = performance.now() - started;
    await session.page.screenshot({
      path: join(directory, 'preview-check.png'),
    });
    await session.close();
    session = undefined;
    return { status: 'passed', readyMs, totalMs: performance.now() - started };
  } catch (error) {
    return { status: 'failed', ms: performance.now() - started,
      error: String(error) };
  } finally {
    if (session) await session.close();
  }
}

/** Archives immutable inputs, CLI output and native timing evidence. */
async function runAttempt(name, repeat, attempt, input) {
  const directory = join(
    output, name, `repeat-${repeat}`, `attempt-${attempt}`,
  );
  await mkdir(directory, { recursive: true });
  const request = JSON.parse(input);
  request.outputDir = join(directory, 'runs');
  const requestPath = join(directory, 'request.json');
  await writeFile(requestPath, json(request));
  const startedAt = new Date().toISOString();
  const result = await invoke(['build', '--request', requestPath]);
  await writeFile(join(directory, 'cli.json'), json(result));
  const runs = await readdir(request.outputDir).catch(() => []);
  const runPath = runs.length ?
    join(request.outputDir, runs[0], 'run.json') : null;
  const run = runPath ? JSON.parse(await readFile(runPath, 'utf8')) : null;
  const delivery = result.envelope.data?.delivery;
  const preview = delivery ? await checkPreview(delivery, directory) : null;
  const row = { name, repeat, attempt, startedAt, inputSha256: hash(input),
    directory: relative(root, directory), cliMs: result.ms,
    ok: result.envelope.ok && preview?.status === 'passed',
    error: result.envelope.error ?? preview?.error ?? null,
    delivery: delivery ? relative(root, delivery) : null, run, preview };
  if (delivery) {
    const report = JSON.parse(await readFile(
      join(delivery, 'verification.json'),
    ));
    row.coverage = { checks: report.construction.results.length,
      objects: report.construction.objects.length,
      samples: report.interaction.samples.length,
      statuses: [report.construction.status, report.reload.status,
        report.interaction.status] };
    row.fileSha256 = hash(await readFile(join(delivery, 'result.ggb')));
  }
  rows.push(row);
  await writeFile(checkpoint, json(rows));
  console.log(json({ name, repeat, attempt, ok: row.ok,
    cliMs: Math.round(row.cliMs), error: row.error }).trim());
  return row;
}

/** Resuming skips completed repetitions and preserves failed attempts. */
async function runSuite() {
  const names = (await readdir(fixtures))
    .filter(n => n.endsWith('.json'))
    .sort();
  for (const file of names) {
    const name = file.slice(0, -5);
    for (let repeat = 1; repeat <= repeats; repeat++) {
      const previous = rows.filter(r => r.name === name && r.repeat === repeat);
      if (previous.some(r => r.ok)) continue;
      if (previous.length >= 3) {
        console.log(`${name} repetition ${repeat}: exhausted three attempts`);
        process.exitCode = 1;
        continue;
      }
      const input = await readFile(join(fixtures, file), 'utf8');
      if (previous.length && previous.at(-1).inputSha256 === hash(input)) {
        throw new Error(`Inspect failure and revise ${file} before resuming`);
      }
      const row = await runAttempt(name, repeat, previous.length + 1, input);
      if (!row.ok) {
        process.exitCode = 1;
        return;
      }
    }
  }
}

const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
await writeFile(join(output, 'environment.json'), json({
  commit,
  node: process.version,
  platform: process.platform,
  architecture: process.arch,
  runtime: JSON.parse(await readFile(join(root, 'runtime.lock.json'))),
  repeats,
  method: 'Serial CLI builds; full production gates; headless preview per run.',
}));
await runSuite();
