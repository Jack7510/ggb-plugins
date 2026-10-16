import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { build, openPreview, readJson } from './delivery.js';
import { ToolError } from './schema.js';
import { root } from './server.js';
import { doctor } from './doctor.js';

const emit = (data: unknown) => console.log(JSON.stringify({ protocolVersion: 1, ok: true, data }));
const cancellation = new AbortController();
const stop = () => cancellation.abort(new Error('Cancelled'));
process.once('SIGINT', stop); process.once('SIGTERM', stop);
const usage = 'doctor | build --request <file> | preview --delivery <dir> | demo [--output <dir>]';
let command: string | undefined, ready = false;
try {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: {
    request: { type: 'string' }, delivery: { type: 'string' }, output: { type: 'string' },
  } });
  if (positionals.length !== 1) throw new Error(usage);
  command = positionals[0];
  if (command === 'doctor' && !values.request && !values.delivery && !values.output) {
    emit(await doctor(cancellation.signal));
  } else if (command === 'build' && values.request && !values.delivery && !values.output) {
    emit(await build(await readJson(resolve(values.request)), cancellation.signal));
  } else if (command === 'demo' && !values.request && !values.delivery) {
    const input = await readJson(resolve(root, 'examples/triangle.json')) as Record<string, unknown>;
    input.outputDir = values.output ?? 'output/ggb';
    emit(await build(input, cancellation.signal));
  } else if (command === 'preview' && values.delivery && !values.request && !values.output) {
    const session = await openPreview(values.delivery, true, cancellation.signal);
    try {
      const closed = session.browser.isConnected() ? new Promise<void>(done => session.browser.once('disconnected', () => done())) : Promise.resolve();
      emit({ url: session.url, delivery: session.delivery }); ready = true; await closed;
      if (cancellation.signal.aborted) process.exitCode = 130;
    } finally { await session.close(); }
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
