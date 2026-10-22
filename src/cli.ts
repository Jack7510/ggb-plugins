/** @fileoverview Owns CLI dispatch, structural preflight and process signals. */
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { build, openPreview, openDetachedPreview, readJson } from './delivery.js';
import { ToolError, parseRequest } from './schema.js';
import {checkRequest} from './check.js';
import {inspectGgb} from './inspect.js';
import { root } from './server.js';
import { doctor } from './doctor.js';

const emit = (data: unknown) => console.log(JSON.stringify({ protocolVersion: 1, ok: true, data }));
const cancellation = new AbortController();
const stop = () => cancellation.abort(new Error('Cancelled'));
process.once('SIGINT', stop); process.once('SIGTERM', stop);
const usage = 'doctor | inspect --ggb <file> | check --request <file> | build --request <file> | preview --delivery <dir> [--headless [--once]] | demo [--output <dir>]';
let command: string | undefined, ready = false;
try {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: {
    request: { type: 'string' }, delivery: { type: 'string' }, output: { type: 'string' },
    ggb: { type: 'string' },
    headless: { type: 'boolean' },
    once: { type: 'boolean' },
  } });
  if (positionals.length !== 1) throw new Error(usage);
  command = positionals[0];
  if (values.headless && command !== 'preview') throw new Error(usage);
  if (values.ggb && command !== 'inspect') throw new Error(usage);
  if (values.once && (command !== 'preview' || !values.headless)) {
    throw new Error('--once requires preview --headless');
  }
  if (command === 'doctor' && !values.request && !values.delivery && !values.output) {
    emit(await doctor(cancellation.signal));
  } else if (command === 'inspect' && values.ggb && !values.request &&
    !values.delivery && !values.output) {
    emit(await inspectGgb(resolve(values.ggb), cancellation.signal));
  } else if (command === 'check' && values.request &&
    !values.delivery && !values.output) {
    const request = parseRequest(await readJson(resolve(values.request)));
    emit(await checkRequest(request));
  } else if (command === 'build' && values.request && !values.delivery && !values.output) {
    emit(await build(await readJson(resolve(values.request)), cancellation.signal));
  } else if (command === 'demo' && !values.request && !values.delivery) {
    const input = await readJson(resolve(root, 'examples/v2-cases/triangle.json')) as Record<string, unknown>;
    input.outputDir = values.output ?? 'output/ggb';
    emit(await build(input, cancellation.signal));
  } else if (command === 'preview' && values.delivery && !values.request && !values.output) {
    if (!values.headless) {
      // The visible window outlives this process once the applet has loaded.
      emit(await openDetachedPreview(values.delivery, cancellation.signal));
      ready = true;
    } else {
      const session = await openPreview(values.delivery, false, cancellation.signal);
      try {
        const closed = new Promise<void>(done => {
          const finish = () => {
            session.page.off('close', finish); session.browser.off('disconnected', finish); done();
          };
          session.page.once('close', finish); session.browser.once('disconnected', finish);
          if (session.page.isClosed() || !session.browser.isConnected()) finish();
        });
        emit({ url: session.url, delivery: session.delivery }); ready = true;
        if (!values.once) await closed;
      } finally { await session.close(); }
    }
    if (cancellation.signal.aborted) process.exitCode = 130;
  } else throw new Error(usage);
} catch (error) {
  const message = cancellation.signal.aborted ? 'Cancelled' : error instanceof Error ? error.message : String(error);
  const code = cancellation.signal.aborted ? 'cancelled' : error instanceof ToolError ? error.code : command === 'preview' && ready ? 'preview_failed' : 'invalid_input';
  const report = JSON.stringify({ protocolVersion: 1, ok: false, error: { code, message, ...(error instanceof ToolError && error.details ? { details: error.details } : {}) } });
  if (ready) console.error(report); else console.log(report);
  process.exitCode = cancellation.signal.aborted ? 130 : 1;
} finally {
  process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
}
