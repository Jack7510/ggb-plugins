import { parseArgs } from 'node:util';
import { createDemo, openPreview } from './delivery.js';

const emit = (data: unknown) => console.log(JSON.stringify({ protocolVersion: 1, ok: true, data }));

try {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { output: { type: 'string', default: 'output/m1' }, delivery: { type: 'string' } },
  });
  if (positionals.length !== 1) throw new Error('Usage: demo [--output <dir>] | preview --delivery <dir>');
  if (positionals[0] === 'demo') {
    if (values.delivery) throw new Error('demo does not accept --delivery');
    emit(await createDemo(values.output));
  } else if (positionals[0] === 'preview' && values.delivery) {
    const session = await openPreview(values.delivery);
    try {
      const closed = new Promise<void>(done => session.browser.once('disconnected', () => done()));
      emit({ url: session.url, delivery: session.delivery });
      await closed;
    } finally {
      await session.close();
    }
  } else {
    throw new Error('Usage: demo [--output <dir>] | preview --delivery <dir>');
  }
} catch (error) {
  console.log(JSON.stringify({ protocolVersion: 1, ok: false, error: { message: error instanceof Error ? error.message : String(error) } }));
  process.exitCode = 1;
}
