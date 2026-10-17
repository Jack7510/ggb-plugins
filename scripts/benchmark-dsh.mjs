/**
 * @fileoverview Runs fresh DSH conversations against the installed bundle.
 * Archives raw host events separately from public benchmark summaries.
 */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { basename, resolve, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

const profile = 'ggb-plugins-validation';
const root = resolve(import.meta.dirname, '..');
const fixtures = resolve(root, 'examples/geometry-benchmark');
const output = resolve(process.argv[2] ?? 'output/dsh-primary-validation');
const installed = process.argv[3];
assert(installed, 'Pass the installed DSH bundle directory');
const mode = process.argv[4] ?? 'smoke';
const selected = process.argv[6]?.split(',');
assert(['smoke', 'full', 'list'].includes(mode));
const json = value => JSON.stringify(value, null, 2) + '\n';
const hash = value => createHash('sha256').update(value).digest('hex');
const cases = await loadCases();
const provenance = await describePlugin(cases);
await mkdir(output, { recursive: true });
await writeFile(join(output, 'provenance.json'), json(provenance));
if (mode === 'list') {
  for (const { id, file, promptSha256, question } of cases) {
    console.log(JSON.stringify({ id, file, promptSha256,
      chars: question.length, question }));
  }
  console.log(JSON.stringify({ mode, cases: cases.length,
    pluginVersion: provenance.plugin.version }));
  process.exit(0);
}
const checkpoint = join(output, `dsh-${mode}-results.json`);
const rows = await readFile(checkpoint, 'utf8').then(JSON.parse, () => []);
const workRoot = process.argv[5] ??
  join('/private/tmp', 'ggb-dsh-' + basename(output));
const { openPreview } = await import(pathToFileURL(
  join(installed, 'dist/src/delivery.js'),
));

/** Loads only the question text; each plan stays the answer key. */
async function loadCases() {
  const files = (await readdir(fixtures))
    .filter(name => name.endsWith('.json')).sort();
  const loaded = [];
  for (const file of files) {
    const fixture = JSON.parse(await readFile(join(fixtures, file), 'utf8'));
    assert.equal(fixture.protocolVersion, 2, `Unsupported protocol: ${file}`);
    assert(fixture.prompt?.trim(), `Missing prompt: ${file}`);
    loaded.push({ id: file.slice(0, 2), file, question: fixture.prompt,
      promptSha256: hash(fixture.prompt) });
  }
  assert(loaded.length, 'No benchmark fixtures found');
  return loaded;
}

/** Returns the current commit, or null outside a Git work tree. */
function tryGitCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'],
      { encoding: 'utf8', cwd: root }).trim();
  } catch {
    return null;
  }
}

/** Records which plugin revision and question text a run measures. */
async function describePlugin(loaded) {
  const digest = async path => {
    try {
      return hash(await readFile(path));
    } catch {
      return null;
    }
  };
  const files = {};
  for (const name of ['package.json', 'capabilities.json', 'dist/src/delivery.js',
    'skills/ggb-construction/SKILL.md', 'skills/ggb-construction/worker.md',
    'skills/ggb-construction/references/capabilities.md']) {
    files[name] = { installed: await digest(join(installed, name)),
      workspace: await digest(join(root, name)) };
  }
  const version = JSON.parse(
    await readFile(join(installed, 'package.json'), 'utf8'),
  ).version;
  return {
    recordedAt: new Date().toISOString(),
    mode, profile, installed,
    commit: tryGitCommit(),
    node: process.version,
    plugin: { version },
    files,
    prompts: loaded.map(({ id, file, promptSha256 }) =>
      ({ id, file, promptSha256 })),
    inputContract: 'Only the fixture prompt field is sent to the host; the '
      + 'plan and past deliveries stay the answer key and are never read.',
  };
}

function promptFor(question) {
  return question + '\n\n' + [
    '请使用本 profile 已安装的 GeoGebra 能力，在当前目录完成构图验收。',
    '只读取安装包内 Skill 和引用；不读取开发仓库、examples/geometry-benchmark、其他案例或既有请求。',
    '全过程 headless，不打开可见浏览器；最终由外层调用方展示。',
    '先做请求 check，再 build；build 最多三次，保留全部失败和修复证据。',
    '至少三个相关交互样本；参数会自动往返，不放宽容差或删条件。',
    '核验与交付保留原始要求；只分析与作图，不额外提供题目解答。',
    '不要修改插件、源码、个人配置或凭据；复用既有模型认证。',
    '优先使用包内已知用法；只在语法不确定时查官方文档。',
    '这是工程验收，不追加无关美化，不写长报告；满足要求即完成。',
    '成功后执行 preview --delivery <dir> --headless --once，最后仅列交付路径。',
  ].join('\n');
}

/** Adds receive timestamps without modifying the original event payload. */
function eventCollector(directory) {
  const events = [];
  const raw = createWriteStream(join(directory, 'events.jsonl'));
  const timeline = createWriteStream(join(directory, 'timeline.jsonl'));
  let buffer = '';
  const accept = chunk => {
    raw.write(chunk);
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      try {
        const event = JSON.parse(line);
        const receivedAt = new Date().toISOString();
        timeline.write(JSON.stringify({ receivedAt, event }) + '\n');
        events.push(event);
      } catch {
        // Non-JSON diagnostics remain in the original stdout stream.
      }
    }
  };
  return { events, accept, close: () => { raw.end(); timeline.end(); } };
}

/** A missing session id option requests a fresh host conversation. */
async function invokeDsh(directory, work, prompt) {
  const collector = eventCollector(directory);
  const errors = createWriteStream(join(directory, 'stderr.log'));
  const start = performance.now();
  const result = await new Promise((done, reject) => {
    const child = spawn('dsh', ['--profile', profile, '--json', prompt], {
      cwd: work, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timeout = setTimeout(() => child.kill('SIGTERM'), 15 * 60_000);
    child.stdout.on('data', collector.accept);
    child.stderr.pipe(errors);
    child.once('error', reject);
    child.once('close', (code, signal) => {
      clearTimeout(timeout);
      done({ code, signal, wallMs: performance.now() - start });
    });
  });
  collector.close();
  return { ...result, events: collector.events };
}

/** Finds actual run journals; never treats model text as a delivery receipt. */
async function journals(directory, depth = 0) {
  if (depth > 5) return [];
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isFile() && entry.name === 'run.json') {
      const saved = await stat(join(directory, 'request.json'));
      found.push({ path, startedAtMs: saved.mtimeMs,
        state: JSON.parse(await readFile(path, 'utf8')) });
    } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
      found.push(...await journals(path, depth + 1));
    }
  }
  return found;
}

function hostMetrics(events) {
  const usage = { inputTokens: 0, outputTokens: 0,
    cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0 };
  const steps = events.filter(e => e.type === 'status' && e.phase === 'step_end');
  for (const step of steps) {
    for (const key of Object.keys(usage)) usage[key] += step.usage?.[key] ?? 0;
  }
  const calls = events.filter(e => e.type === 'tool_call');
  const commands = calls.filter(e => e.tool === 'bash')
    .map(e => e.input?.command ?? '');
  const checkIds = new Set(calls.filter(e => e.tool === 'bash' &&
    /\bcheck\s+--request\b/.test(e.input?.command ?? ''))
    .map(e => e.callId));
  const preflightFailures = events.filter(e => e.type === 'tool_result' &&
    checkIds.has(e.callId) && /"ok"\s*:\s*false/.test(
      typeof e.result === 'string' ? e.result : JSON.stringify(e.result),
    )).length;
  return { usage, usageObserved: steps.some(s => s.usage), steps: steps.length,
    preflightFailures,
    sessionId: events.find(e => e.type === 'session')?.sessionId,
    skillLoaded: calls.some(e => /skill/i.test(e.tool)),
    buildCommandCount: commands.filter(c => /\bbuild\s+--request\b/.test(c)).length,
    preflightCommandCount: commands.filter(c => /\bcheck\s+--request\b/.test(c)).length,
    doctorCommandCount: commands.filter(c => /\bdoctor\b/.test(c)).length };
}

async function auditDelivery(delivery, directory) {
  const start = performance.now();
  const session = await openPreview(delivery, false);
  try {
    await session.page.screenshot({ path: join(directory, 'audit.png') });
    const report = JSON.parse(await readFile(join(delivery, 'verification.json')));
    assert(report.interaction.samples.length >= 3,
      'Benchmark requires at least three related interaction samples');
    const checks = session.request.plan.requirements.flatMap(r => r.checks);
    assert(checks.some(c => c.scope === 'sampled' &&
      !['exists', 'type', 'style', 'dependsOn'].includes(c.kind)),
    'Missing sampled mathematical checks');
    return { status: 'passed', ms: performance.now() - start,
      samples: report.interaction.samples.length,
      roundTrips: report.interaction.samples.filter(s => s.roundTrip).length,
      checks: report.construction.results.length,
      sha256: createHash('sha256').update(session.bytes).digest('hex') };
  } finally {
    await session.close();
  }
}

async function runCase(id, question, repeat) {
  const directory = join(output, mode, id, `repeat-${repeat}`);
  const work = join(workRoot, mode, id, `repeat-${repeat}`);
  await mkdir(directory, { recursive: true });
  await mkdir(work, { recursive: true });
  assert.equal((await readdir(work)).length, 0, 'Workspace must start empty');
  const prompt = promptFor(question);
  await writeFile(join(directory, 'prompt.txt'), prompt);
  const startedAt = new Date().toISOString();
  const { events, ...host } = await invokeDsh(directory, work, prompt);
  const runs = (await journals(work))
    .sort((a, b) => a.startedAtMs - b.startedAtMs);
  const success = runs.filter(r => r.state.state === 'delivered').at(-1);
  let audit;
  if (success) {
    try {
      audit = await auditDelivery(join(success.path, '../delivery'), directory);
    } catch (error) {
      audit = { status: 'failed', error: String(error) };
    }
  }
  await cp(work, join(directory, 'artifacts'), { recursive: true });
  const metrics = hostMetrics(events);
  const ended = events.findLast(e =>
    e.type === 'status' && e.phase === 'turn_end');
  const hostCompleted = host.code === 0 && ended?.reason?.kind === 'completed';
  assert(!rows.some(r => r.sessionId && r.sessionId === metrics.sessionId),
    'Host reused a session id');
  const row = { id, repeat, startedAt, work, directory, host, ...metrics,
    runs, audit, hostCompleted, delivered: audit?.status === 'passed',
    completed: hostCompleted && audit?.status === 'passed',
    firstBuildPassed: runs[0]?.state.state === 'delivered',
    firstPreflightAndBuildPassed: runs[0]?.state.state === 'delivered' &&
      metrics.preflightCommandCount > 0 && metrics.preflightFailures === 0,
    repairCount: runs.slice(0, -1).filter(r => r.state.state !== 'delivered').length,
    unjournaledBuildCommands: Math.max(0, metrics.buildCommandCount - runs.length),
    buildsAfterFirstSuccess: success ? Math.max(0,
      runs.length - 1 - runs.findIndex(r => r.state.state === 'delivered')) : 0,
   };
  rows.push(row);
  await writeFile(checkpoint, json(rows));
  console.log(JSON.stringify({ id, repeat, delivered: row.delivered,
    wallMs: Math.round(host.wallMs), runs: runs.length, usage: metrics.usage }));
}

for (const { id, question } of cases) {
  if (selected && !selected.includes(id)) continue;
  if (mode === 'smoke' && !['01', '05', '08', '10'].includes(id)) continue;
  for (let repeat = 1; repeat <= (mode === 'full' ? 3 : 1); repeat++) {
    if (rows.some(r => r.id === id && r.repeat === repeat)) continue;
    await runCase(id, question, repeat);
    const last = rows.at(-1);
    if (!last.steps && !last.buildCommandCount) {
      throw new Error('DSH host failed before a model/tool round; inspect logs');
    }
  }
}
