import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { limits } from '../src/schema.js';
import * as server from '../src/server.js';

const services: Awaited<ReturnType<typeof server.serve>>[] = [];
mock.module('../src/server.js', { namedExports: { ...server, async serve() {
  const service = await server.serve(); services.push(service); return service;
} } });
const { openBrowser } = await import('../src/browser.js');
const { doctor } = await import('../src/doctor.js');
const originalLaunch = chromium.launch.bind(chromium);
const defaults = { ...limits };
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

test('startup stops waiting on abort and owns late native resources', { timeout: 30_000 }, async t => {
  for (const phase of ['launch-deadline', 'launch-cancel', 'context-deadline', 'context-cancel']) await t.test(phase, async t => {
    const gate = deferred(), observed = deferred(), cancellation = new AbortController();
    const browsers: Browser[] = [], pending: Promise<unknown>[] = [];
    let gateReleased = false;
    const release = () => { gateReleased = true; gate.resolve(); };
    // A watchdog keeps the test finite on the old implementation. The new one
    // must reject while this gate is still closed, without waiting for launch.
    const watchdog = setTimeout(release, 5000);
    if (phase === 'launch-deadline') limits.doctorMs = 100;
    if (phase === 'context-deadline') limits.operationMs = 1500;
    t.mock.method(chromium, 'launch', (options: Parameters<typeof chromium.launch>[0]) => {
      assert.equal(options!.timeout, limits.operationMs);
      assert.equal(options!.headless, true);
      assert.equal(options!.channel, undefined);
      const task = (async () => {
        const browser = await originalLaunch(options); browsers.push(browser);
        if (phase.startsWith('launch')) { observed.resolve(); await gate.promise; }
        else {
          const create = browser.newContext.bind(browser);
          t.mock.method(browser, 'newContext', (options: Parameters<typeof create>[0]) => {
            const task = (async () => { const context = await create(options); observed.resolve(); await gate.promise; return context; })();
            pending.push(task); return task;
          });
        }
        return browser;
      })();
      pending.push(task); return task;
    });
    const operation = phase === 'launch-deadline' ? doctor() : openBrowser(false, cancellation.signal);
    // Observe rejection immediately, including a deadline before launch resolves.
    const outcome = operation.then(() => null, error => error);
    try {
      await observed.promise;
      if (phase.endsWith('cancel')) cancellation.abort(new Error('Cancelled during startup'));
      const error = await outcome;
      assert.equal(error?.code, phase.endsWith('cancel') ? 'cancelled' : 'limit_exceeded');
      assert.equal(gateReleased, false, 'Abort must not wait for the delayed launch/context result');
      for (const service of services) await assert.rejects(fetch(service.url));
      if (phase.startsWith('context')) assert(browsers.every(b => !b.isConnected()));
      release();
      await Promise.allSettled(pending);
      for (const browser of browsers) {
        if (browser.isConnected()) await new Promise<void>((done, reject) => {
          const timer = setTimeout(() => reject(new Error('Late browser was not closed')), 2000);
          browser.once('disconnected', () => { clearTimeout(timer); done(); });
        });
        assert.equal(browser.isConnected(), false, 'Late Chromium must be closed by its owner');
      }
    } finally {
      clearTimeout(watchdog); release(); await Promise.allSettled(pending);
      for (const browser of browsers) await browser.close();
      services.splice(0); Object.assign(limits, defaults);
    }
  });
});
