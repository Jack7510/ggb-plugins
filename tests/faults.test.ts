import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { mock } from 'node:test';
import { promisify } from 'node:util';
import { limits } from '../src/schema.js';
import { compareSnapshots } from '../src/verify.js';

// Fault injection stays in tests. Every successful launch still uses real GeoGebra.
let fault = '', output = '', cancellation: AbortController | undefined;
const sessions: Awaited<ReturnType<typeof browser.openBrowser>>[] = [];
const exports = Object.fromEntries(Object.entries(fs).filter(([name]) => name !== 'default'));
mock.module('node:fs/promises', { namedExports: { ...exports,
  async readFile(...args: Parameters<typeof fs.readFile>) {
    const value = await fs.readFile(...args);
    if (!fault.startsWith('native-wait-') || String(args[0]) !== join(root, 'viewer/index.html')) return value;
    const html = String(value).replace('window.ggb = api;', 'api.asyncEvalCommandGetLabels = () => new Promise(() => {}); window.ggb = api;');
    return typeof value === 'string' ? html : Buffer.from(html);
  },
  async mkdir(...args: Parameters<typeof fs.mkdir>) {
    if (fault === 'mkdir' && String(args[0]) === output) throw new Error('ENOSPC: output unavailable');
    return fs.mkdir(...args);
  },
  async writeFile(...args: Parameters<typeof fs.writeFile>) {
    const path = String(args[0]), data = String(args[1]);
    if ((fault === 'request-write' && path.endsWith('/request.json'))
      || (fault === 'manifest-write' && path.endsWith('/manifest.json'))
      || (fault === 'journal-after' && path.endsWith('/run.json') && data.includes('"delivered"'))
      || (fault === 'failure-journal' && path.endsWith('/run.json') && data.includes('"failed"'))) throw new Error('EACCES: injected write failure');
    return fs.writeFile(...args);
  },
  async rename(...args: Parameters<typeof fs.rename>) {
    if (String(args[1]).endsWith('/delivery')) {
      assert(sessions.every(s => !s.browser.isConnected()), 'Browser must close before commit');
      if (fault === 'rename') throw new Error('EIO: injected rename failure');
    }
    return fs.rename(...args);
  },
} });
// Load the server after the file mock so startup faults reach the real viewer.
const { root } = await import('../src/server.js');
const browser = await import('../src/browser.js');
mock.module('../src/browser.js', { namedExports: { ...browser,
  async openDefaultBrowser() { throw new Error('Injected system URL opener failure'); },
  async exportGgb(page: Parameters<typeof browser.exportGgb>[0]) {
    if (!fault.startsWith('export-equation:')) return browser.exportGgb(page);
    const [original, changed] = fault.slice('export-equation:'.length).split('|');
    await page.evaluate(source => { if (!window.ggb.evalCommand(source!)) throw new Error('Cannot inject equation'); }, changed);
    try { return await browser.exportGgb(page); }
    finally { await page.evaluate(source => { if (!window.ggb.evalCommand(source!)) throw new Error('Cannot restore equation'); }, original); }
  },
  async openBrowser(headed = false, signal?: AbortSignal) {
    const session = await browser.openBrowser(headed, signal); sessions.push(session);
    let count = 0;
    return { ...session,
      async close() {
        await session.close();
        if (fault === 'cleanup-cancel') cancellation!.abort(new Error('Cancelled during cleanup'));
        if (fault === 'cleanup-deadline' && !signal!.aborted) await new Promise<void>(done => signal!.addEventListener('abort', () => done(), { once: true }));
        if (fault === 'cleanup' || fault === 'export-cleanup') throw new Error('Injected cleanup failure');
      },
      async page() {
        const page = await session.page(); count++;
        if (fault === 'algebra-without-cas') {
          await page.evaluate(() => { window.ggb.evalCommandCAS = () => { throw new Error('CAS is unavailable'); }; });
        }
        if (count === 1 && ['cas-ready', 'cas-cancel'].includes(fault)) {
          await page.evaluate(() => { window.ggb.evalCommandCAS = () => '?'; });
          limits.operationMs = 150;
          if (fault === 'cas-cancel') setTimeout(() => cancellation!.abort(new Error('Cancelled during CAS startup')), 40);
        }
        if (count === 1 && fault === 'probe-mutation') {
          await page.evaluate(() => {
            const evaluate = window.ggb.asyncEvalCommandGetLabels.bind(window.ggb);
            window.ggb.asyncEvalCommandGetLabels = command => {
              if (command.startsWith('GgbProbe')) window.ggb.setCoords('A', -1, 1);
              return evaluate(command);
            };
          });
        }
        if (count === 1 && fault === 'native-wait-cancel') setTimeout(() => cancellation!.abort(new Error('Cancelled during native evaluation')), 40);
        if (count === 1 && ['export', 'export-cleanup', 'export-timeout', 'cancel', 'deadline', 'failure-journal'].includes(fault)) {
          await page.evaluate(invalid => { window.ggb.getBase64 = callback => { if (invalid) callback('invalid'); }; }, ['export', 'export-cleanup', 'failure-journal'].includes(fault));
          limits.operationMs = fault === 'deadline' ? 30_000 : 150;
          if (fault === 'cancel') setTimeout(() => cancellation!.abort(new Error('Test cancellation')), 40);
        }
        if ((count === 2 && fault.startsWith('reload')) || fault === 'preview-load') {
          await page.evaluate(mode => {
            const load = window.ggb.setBase64.bind(window.ggb);
            window.ggb.setBase64 = (data, done) => {
              if (mode === 'reload-timeout') return;
              if (mode === 'reload-change') return load(data, () => { window.ggb.setVisible('median', false); done(); });
              throw new Error('Injected load failure');
            };
          }, fault);
          limits.operationMs = 150;
        }
        if (fault === 'browser-close') await session.browser.close();
        if (count === 4 && fault.startsWith('interaction-')) {
          const close = page.close.bind(page);
          page.close = async () => { await close(); throw new Error('Injected interaction close failure'); };
        }
        return page;
      },
    };
  },
  async dragPoint(...args: Parameters<typeof browser.dragPoint>) {
    if (fault === 'drag-paint') {
      await args[0].evaluate(() => { window.requestAnimationFrame = () => 0; });
      const timeout = limits.operationMs; limits.operationMs = 50;
      try { await browser.dragPoint(...args); }
      finally { limits.operationMs = timeout; }
      return;
    }
    await browser.dragPoint(...args);
    if (fault === 'interaction-unverified-close' && args[1].point === 'C') {
      await args[0].evaluate(() => window.ggb.setCoords('C', 3, 2e-8));
    }
  },
} });
const { build, openPreview, openDefaultPreview } = await import('../src/delivery.js');
const { doctor } = await import('../src/doctor.js');
const fixture = JSON.parse(await fs.readFile(join(root, 'examples/v2-cases/triangle.json'), 'utf8'));
const defaults = { ...limits };
async function released() {
  for (const session of sessions.splice(0)) {
    assert.equal(session.browser.isConnected(), false);
    await assert.rejects(fetch(session.url));
  }
}

test('native asynchronous module waits are bounded and cancellation releases resources', { timeout: 20_000 }, async t => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'ggb-native-wait-'));
  try {
    for (const [name, code] of [['timeout', 'execution_failed'], ['cancel', 'cancelled'], ['deadline', 'limit_exceeded']]) await t.test(name!, async () => {
      fault = `native-wait-${name}`; cancellation = new AbortController(); limits.operationMs = 1500;
      if (name === 'deadline') limits.buildMs = 1000;
      const input = JSON.parse(await fs.readFile(join(root, 'tests/fixtures/functions.json'), 'utf8')); input.outputDir = directory;
      await assert.rejects(build(input, cancellation.signal), (error: any) => {
        assert.equal(error.code, code); if (name === 'timeout') assert.match(error.message, /Native command timed out/); return true;
      });
      await released(); Object.assign(limits, defaults);
    });
    for (const run of await fs.readdir(directory)) assert(!(await fs.readdir(join(directory, run))).includes('delivery'));
  } finally { fault = ''; cancellation = undefined; Object.assign(limits, defaults); await fs.rm(directory, { recursive: true, force: true }); }
});

test('independent equations survive delivery and changed exports cannot commit', { timeout: 60_000 }, async t => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'ggb-equation-fault-'));
  try {
    for (const [original, changed, objectType] of [
      ['p:y^2=4x', 'p:y^2=8x', 'parabola'],
      ['p:x^2/9+y^2/4=1', 'p:x^2/16+y^2/4=1', 'ellipse'],
    ]) await t.test(objectType!, async () => {
      const input = { protocolVersion: 2, prompt: '绘制圆锥曲线', locale: 'zh-CN', outputDir: join(directory, objectType!), plan: {
        program: [{ id: 'p', op: 'native', mode: 'algebra', source: original }],
        requirements: [{ id: 'conic', source: '绘制圆锥曲线', checks: [{ kind: 'type', subjects: ['p'], objectType, scope: 'initial' }] }],
        interactions: [],
      } };
      const result = await build(input);
      const preview = await openPreview(result.delivery, false); await preview.close(); await released();
      const report = JSON.parse(await fs.readFile(result.report, 'utf8'));
      const facts = report.construction.objects;
      assert(facts[0].independent && facts[0].expression);
      const missing = structuredClone(facts); missing[0].expression = null; missing[0].nativeDefinition = null; missing[0].command = '';
      assert.throws(() => compareSnapshots(missing, missing), (error: any) => error.code === 'verification_unverified');
      fault = `export-equation:${original}|${changed}`;
      input.outputDir = join(directory, `${objectType}-changed`);
      await assert.rejects(build(input), /Construction facts changed/);
      await released();
      for (const run of await fs.readdir(input.outputDir)) {
        const runDirectory = join(input.outputDir, run);
        assert(!(await fs.readdir(runDirectory)).includes('delivery'));
        const differences = JSON.parse(await fs.readFile(join(runDirectory, 'snapshot-differences.json'), 'utf8'));
        assert(differences.some((d: any) => d.object === 'p' && d.field === 'definition'));
        const evidence = JSON.parse(await fs.readFile(join(runDirectory, 'verification.json'), 'utf8'));
        assert.equal(evidence.construction.status, 'passed'); assert.equal(evidence.reload.status, 'passed');
      }
      fault = '';
    });
  } finally { fault = ''; await fs.rm(directory, { recursive: true, force: true }); }
});

test('Algebra execution and conditional probes do not require CAS', { timeout: 30_000 }, async () => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'ggb-algebra-no-cas-'));
  fault = 'algebra-without-cas';
  const input = { protocolVersion: 2, prompt: '计算条件表达式，正数时返回 1', locale: 'zh-CN', outputDir: directory, plan: {
    program: [{ id: 'a', op: 'native', mode: 'algebra', source: 'a=1' }, { id: 'A', op: 'native', mode: 'algebra', source: 'A=(0,0)' }],
    requirements: [{ id: 'condition', source: '正数时返回 1', checks: [{ kind: 'expression', subjects: ['a'], expression: 'If(a>0,1,?)', mode: 'algebra', expected: 1, scope: 'initial' }] }],
    interactions: [],
  } };
  try {
    const result = await build(input);
    const preview = await openPreview(result.delivery, false); await preview.close(); await released();
    const report = JSON.parse(await fs.readFile(result.report, 'utf8'));
    assert.equal(report.reload.observations[0].defined, true);
    assert.equal(report.reload.observations[0].value, 1);
    input.plan.program[0]!.source = 'a=-1';
    await assert.rejects(build(input), (error: any) => error.code === 'verification_unverified'); await released();
  } finally { fault = ''; await fs.rm(directory, { recursive: true, force: true }); }
});

test('native CAS waits and verification mutation obey the same cleanup gates', { timeout: 30_000 }, async t => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'ggb-native-fault-'));
  try {
    for (const [name, code] of [['cas-ready', 'execution_failed'], ['cas-cancel', 'cancelled'], ['probe-mutation', 'execution_failed']]) await t.test(name!, async () => {
      fault = name!; cancellation = new AbortController();
      const input = JSON.parse(await fs.readFile(join(root, fault === 'probe-mutation'
        ? 'examples/v2-cases/parabola.json' : 'tests/fixtures/algebra.json'), 'utf8'));
      input.outputDir = join(directory, fault);
      await assert.rejects(build(input, cancellation.signal), (e: any) => e.code === code);
      await released();
      for (const run of await fs.readdir(input.outputDir)) assert(!(await fs.readdir(join(input.outputDir, run))).includes('delivery'));
      Object.assign(limits, defaults);
    });
  } finally { fault = ''; cancellation = undefined; Object.assign(limits, defaults); await fs.rm(directory, { recursive: true, force: true }); }
});

test('doctor reports real readiness and cleans up without producing deliveries', { timeout: 30_000 }, async t => {
  const result = await doctor();
  assert.equal(result.smoke, 'passed'); assert.equal(result.runtime.version, '5.4.932.1');
  assert.equal(result.limits.buildMs, 120_000); assert(result.commands.Circle && result.predicates.midpoint);
  assert.match(result.browser.version, /^\d/); await released();
  for (const [name, code] of [['cancel', 'cancelled'], ['deadline', 'limit_exceeded'], ['cleanup', 'runtime_unavailable'], ['cleanup-cancel', 'cancelled'], ['cleanup-deadline', 'limit_exceeded']]) await t.test(name!, async () => {
    fault = name!; cancellation = new AbortController();
    if (fault === 'deadline') limits.doctorMs = 1000;
    if (fault === 'cleanup-deadline') limits.doctorMs = 1500;
    try {
      await assert.rejects(doctor(cancellation.signal), (error: any) => error.code === code);
      await released();
    } finally { fault = ''; Object.assign(limits, defaults); }
  });
});

test('build failures preserve diagnostics, release resources and never commit', { timeout: 120_000 }, async t => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'ggb-faults-'));
  try {
    for (const [name, code] of [
      ['mkdir', 'export_failed'], ['request-write', 'export_failed'],
      ['export', 'export_failed'], ['export-timeout', 'export_failed'],
      ['reload', 'reload_failed'], ['reload-timeout', 'reload_failed'], ['reload-change', 'verification_failed'],
      ['browser-close', 'execution_failed'], ['cancel', 'cancelled'], ['deadline', 'limit_exceeded'],
      ['manifest-write', 'export_failed'], ['rename', 'export_failed'], ['cleanup', 'export_failed'],
      ['failure-journal', 'export_failed'],
      ['export-cleanup', 'export_failed'],
      ['ggb-limit', 'limit_exceeded'], ['report-limit', 'limit_exceeded'],
      ['interaction-unverified-close', 'verification_unverified'], ['interaction-close', 'verification_failed'],
      ['drag-paint', 'verification_failed'],
    ]) await t.test(name!, async () => {
      fault = name!; output = join(directory, fault); cancellation = new AbortController();
      if (fault === 'deadline') limits.buildMs = 1000;
      if (fault === 'ggb-limit') limits.ggbBytes = 10;
      if (fault === 'report-limit') limits.reportBytes = 100;
      const input = structuredClone(fixture); input.outputDir = output;
      if (fault.startsWith('interaction-')) input.plan.interactions.push({ point: 'C', dx: 40, dy: -30 });
      try {
        await assert.rejects(build(input, cancellation.signal), (error: any) => {
          assert.equal(error.code, code);
          if (fault === 'failure-journal') assert(error.details.diagnostics.some((s: string) => s.includes('Cannot save run.json')));
          if (fault === 'export-cleanup') {
            assert.match(error.message, /Expected a GGB ZIP/);
            assert(error.details.diagnostics.some((s: string) => s.includes('Cleanup failed')));
          }
          if (fault === 'interaction-unverified-close') {
            assert(error.details.diagnostics.some((s: string) => s.includes('Interaction cleanup failed')));
            assert(error.details.cause.some((r: any) => r.status === 'unverified'));
          }
          if (fault === 'interaction-close') assert.match(error.message, /Injected interaction close failure/);
          return true;
        });
        await released();
        for (const run of await fs.readdir(output).catch(() => [])) {
          await assert.rejects(fs.stat(join(output, run, 'delivery')), /ENOENT/);
          const state = JSON.parse(await fs.readFile(join(output, run, 'run.json'), 'utf8'));
          assert.equal(state.state, fault === 'failure-journal' ? 'running' : 'failed');
          if (state.state === 'failed') {
            assert.equal(state.error.code, code);
            assert(state.totalMs > 0 && Array.isArray(state.timings));
            if (fault === 'reload-change') {
              const evidence = JSON.parse(await fs.readFile(join(output, run, 'verification.json'), 'utf8'));
              assert.equal(evidence.construction.status, 'passed');
              assert.equal(evidence.reload.status, 'failed');
            }
            if (fault === 'interaction-unverified-close') {
              assert(state.error.details.cause.some((r: any) => r.status === 'unverified'));
              assert(state.diagnostics.some((s: string) => s.includes('Interaction cleanup failed')));
            }
          }
        }
      } finally { fault = ''; Object.assign(limits, defaults); }
    });
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('doctor CLI reports SIGTERM during cleanup as cancelled, not successful', { timeout: 15_000 }, async () => {
  const script = `
    import { mock } from 'node:test';
    import { once } from 'node:events';
    import * as browser from ${JSON.stringify(join(root, 'dist/src/browser.js'))};
    mock.module(${JSON.stringify(join(root, 'dist/src/browser.js'))}, { namedExports: { ...browser, async openBrowser(...args) {
      const session = await browser.openBrowser(...args);
      return { ...session, async close() {
        await session.close();
        const keeper = setTimeout(() => {}, 5000);
        try { const interrupted = once(process, 'SIGTERM'); process.kill(process.pid, 'SIGTERM'); await interrupted; }
        finally { clearTimeout(keeper); }
      } };
    } }});
    await import(${JSON.stringify(join(root, 'dist/src/cli.js'))});
  `;
  await assert.rejects(promisify(execFile)(process.execPath, ['--experimental-test-module-mocks', '--input-type=module', '-e', script, 'doctor'], { timeout: 10_000 }), (error: any) => {
    assert.equal(error.code, 130);
    const result = JSON.parse(error.stdout); assert.equal(result.ok, false); assert.equal(result.error.code, 'cancelled'); return true;
  });
});

test('committed files survive journal and preview errors; repeated calls remain independent', { timeout: 30_000 }, async t => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'ggb-committed-'));
  const input = structuredClone(fixture); input.outputDir = directory;
  try {
    fault = 'journal-after';
    const first = await build(input); assert.equal(first.warnings?.length, 1); await released();
    assert.equal(JSON.parse(await fs.readFile(join(first.delivery, '../run.json'), 'utf8')).state, 'running');
    fault = '';
    const preview = await openPreview(first.delivery, false); await preview.close(); await released();
    const before = await fs.readFile(first.file);
    await assert.rejects(openDefaultPreview(first.delivery), (error: any) => error.code === 'preview_failed' && /URL opener/.test(error.message));
    await released(); assert.deepEqual(await fs.readFile(first.file), before);
    fault = 'preview-load';
    await assert.rejects(openPreview(first.delivery, false), (error: any) => error.code === 'preview_failed');
    await released(); assert.deepEqual(await fs.readFile(first.file), before);
    fault = ''; Object.assign(limits, defaults);
    const second = await build(input); await released();
    assert.notEqual(first.delivery, second.delivery); assert.deepEqual(await fs.readFile(first.file), before);
    const script = `
      import { mock } from 'node:test';
      import * as browser from ${JSON.stringify(join(root, 'dist/src/browser.js'))};
      let session;
      mock.module(${JSON.stringify(join(root, 'dist/src/browser.js'))}, { namedExports: { ...browser, async openBrowser(...args) {
        session = await browser.openBrowser(...args);
        return { ...session, async close() {
          await session.close();
          await (await import('node:fs/promises')).writeFile(${JSON.stringify(join(directory, 'preview-closed.json'))}, JSON.stringify({ connected: session.browser.isConnected() }));
          if (process.env.GGB_TEST_LATE_ERROR) throw new Error('Injected preview cleanup error');
        } };
      } }});
      const log = console.log;
      console.log = value => {
        log(value);
        if (JSON.parse(value).data?.url) {
          if (process.env.GGB_TEST_CLOSE_PAGE) void session.browser.contexts()[0].pages()[0].close();
          else void session.browser.close();
        }
      };
      await import(${JSON.stringify(join(root, 'dist/src/cli.js'))});
    `;
    const { stdout } = await promisify(execFile)(process.execPath, ['--experimental-test-module-mocks', '--input-type=module', '-e', script, 'preview', '--delivery', first.delivery, '--headless'], { timeout: 15_000 });
    const ready = JSON.parse(stdout); assert.equal(ready.ok, true); await assert.rejects(fetch(ready.data.url));
    assert.deepEqual(await fs.readFile(first.file), before);
    await t.test('closing the preview page exits CLI and releases browser and port', async () => {
      const { stdout } = await promisify(execFile)(process.execPath, ['--experimental-test-module-mocks', '--input-type=module', '-e', script, 'preview', '--delivery', first.delivery, '--headless'], {
        timeout: 10_000, env: { ...process.env, GGB_TEST_CLOSE_PAGE: '1' },
      });
      const ready = JSON.parse(stdout); assert.equal(ready.ok, true);
      assert.equal(JSON.parse(await fs.readFile(join(directory, 'preview-closed.json'), 'utf8')).connected, false);
      await assert.rejects(fetch(ready.data.url));
      assert.deepEqual(await fs.readFile(first.file), before);
    });
    await assert.rejects(promisify(execFile)(process.execPath, ['--experimental-test-module-mocks', '--input-type=module', '-e', script, 'preview', '--delivery', first.delivery, '--headless'], {
      timeout: 15_000, env: { ...process.env, GGB_TEST_LATE_ERROR: '1' },
    }), (error: any) => {
      assert.equal(error.code, 1); assert.equal(JSON.parse(error.stdout).ok, true);
      const diagnostic = error.stderr.trim().split('\n').findLast((line: string) => line.startsWith('{'));
      assert.equal(JSON.parse(diagnostic).error.code, 'preview_failed'); return true;
    });
    assert.deepEqual(await fs.readFile(first.file), before);
  } finally { fault = ''; Object.assign(limits, defaults); await fs.rm(directory, { recursive: true, force: true }); }
});

test('forced exits on either side of rename respect the delivery commit marker', { timeout: 30_000 }, async t => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'ggb-interrupted-'));
  try {
    for (const mode of ['before', 'after']) await t.test(mode, async () => {
      const destination = join(directory, mode), input = structuredClone(fixture); input.outputDir = destination;
      const request = join(directory, mode + '.json'); await fs.writeFile(request, JSON.stringify(input));
      const record = join(directory, mode + '-browser.json');
      const script = `
        import { mock } from 'node:test';
        import * as fs from 'node:fs/promises';
        import * as browser from ${JSON.stringify(join(root, 'dist/src/browser.js'))};
        const exports = Object.fromEntries(Object.entries(fs).filter(([key]) => key !== 'default'));
        mock.module('node:fs/promises', { namedExports: { ...exports,
          async rename(...args) {
            if (${JSON.stringify(mode)} === 'before' && String(args[1]).endsWith('/delivery')) process.kill(process.pid, 'SIGKILL');
            return fs.rename(...args);
          },
          async writeFile(...args) {
            if (${JSON.stringify(mode)} === 'after' && String(args[0]).endsWith('/run.json') && String(args[1]).includes('"delivered"')) process.kill(process.pid, 'SIGKILL');
            return fs.writeFile(...args);
          }
        }});
        mock.module(${JSON.stringify(join(root, 'dist/src/browser.js'))}, { namedExports: { ...browser, async openBrowser(...args) {
          const session = await browser.openBrowser(...args);
          return { ...session, async close() { await session.close(); await fs.writeFile(${JSON.stringify(record)}, JSON.stringify({ url: session.url, connected: session.browser.isConnected() })); } };
        } }});
        const { build } = await import(${JSON.stringify(join(root, 'dist/src/delivery.js'))});
        await build(JSON.parse(await fs.readFile(${JSON.stringify(request)}, 'utf8')));
      `;
      await assert.rejects(promisify(execFile)(process.execPath, ['--experimental-test-module-mocks', '--input-type=module', '-e', script], { timeout: 15_000 }), (error: any) => error.signal === 'SIGKILL');
      const closed = JSON.parse(await fs.readFile(record, 'utf8'));
      assert.equal(closed.connected, false); await assert.rejects(fetch(closed.url));
      const runs = await fs.readdir(destination); assert.equal(runs.length, 1);
      const run = join(destination, runs[0]!);
      assert.equal(JSON.parse(await fs.readFile(join(run, 'run.json'), 'utf8')).state, 'running');
      if (mode === 'before') {
        await assert.rejects(fs.stat(join(run, 'delivery')), /ENOENT/);
        await assert.rejects(openPreview(join(run, 'delivery'), false), (error: any) => error.code === 'preview_failed');
      } else {
        const preview = await openPreview(join(run, 'delivery'), false); await preview.close(); await released();
      }
      assert.equal((await fs.readdir(destination)).length, 1, 'No automatic retry or recovery');
    });
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('doctor CLI rejects missing runtime, version mismatch and missing Chromium', { timeout: 30_000 }, async t => {
  for (const mode of ['missing', 'mismatch', 'browser']) await t.test(mode, async () => {
    const script = `
      import { mock } from 'node:test';
      import * as fs from 'node:fs/promises';
      const exports = Object.fromEntries(Object.entries(fs).filter(([key]) => key !== 'default'));
      mock.module('node:fs/promises', { namedExports: { ...exports, async readFile(...args) {
        if (String(args[0]).endsWith('/.runtime/runtime.json')) {
          if (${JSON.stringify(mode)} === 'missing') throw new Error('ENOENT: missing runtime');
          if (${JSON.stringify(mode)} === 'mismatch') return JSON.stringify({ version: 'wrong', sha256: 'wrong' });
        }
        return fs.readFile(...args);
      } }});
      await import(${JSON.stringify(join(root, 'dist/src/cli.js'))});
    `;
    await assert.rejects(promisify(execFile)(process.execPath, ['--experimental-test-module-mocks', '--input-type=module', '-e', script, 'doctor'], {
      timeout: 15_000, env: { ...process.env, ...(mode === 'browser' ? { PLAYWRIGHT_BROWSERS_PATH: join(tmpdir(), 'ggb-no-browser') } : {}) },
    }), (error: any) => {
      assert.equal(error.code, 1); assert.equal(JSON.parse(error.stdout).error.code, 'runtime_unavailable', error.stdout); return true;
    });
  });
});
