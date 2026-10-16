import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { exportGgb, loadGgb, openBrowser, runtimeVersion, snapshot } from './browser.js';
import { constructTriangle, verifyInteraction, verifyTriangle } from './triangle.js';

export const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';

export async function createDemo(outputDir: string) {
  await mkdir(outputDir, { recursive: true });
  const run = await mkdtemp(join(resolve(outputDir), 'm1-'));
  const temp = join(run, 'delivery.tmp');
  await mkdir(temp);
  let session: Awaited<ReturnType<typeof openBrowser>> | undefined;
  try {
    session = await openBrowser();
    const original = await session.page();
    await constructTriangle(original);
    const construction = await verifyTriangle(original);
    const bytes = Buffer.from(await exportGgb(original), 'base64');
    assert.equal(bytes.subarray(0, 2).toString(), 'PK', 'Expected a GGB ZIP archive');
    await writeFile(join(temp, 'result.ggb'), bytes);
    // Reload bytes read back from disk in a new applet, never replay commands.
    const reloaded = await session.page();
    await loadGgb(reloaded, (await readFile(join(temp, 'result.ggb'))).toString('base64'));
    const reload = await verifyTriangle(reloaded);
    assert.deepEqual(reload.objects, construction.objects, 'Reload changed the construction');
    await reloaded.screenshot({ path: join(temp, 'preview.png') });
    const interaction = await verifyInteraction(reloaded);
    assert.deepEqual(await snapshot(original), construction.objects, 'Interaction modified the export canvas');
    const version = await runtimeVersion(original);
    const report = { milestone: 'M1', construction, reload, interaction };
    await writeFile(join(temp, 'verification.json'), json(report));
    await writeFile(join(temp, 'manifest.json'), json({
      protocolVersion: 1, milestone: 'M1', runtimeVersion: version,
      file: 'result.ggb', sha256: sha256(bytes), objects: construction.objects,
    }));
    const delivery = join(run, 'delivery');
    await rename(temp, delivery);
    return { delivery, file: join(delivery, 'result.ggb'), report: join(delivery, 'verification.json') };
  } catch (error) {
    await writeFile(join(run, 'error.json'), json({ message: error instanceof Error ? error.message : String(error) }));
    throw error;
  } finally {
    await session?.close();
  }
}

export async function openPreview(deliveryDir: string, headed = true) {
  const delivery = resolve(deliveryDir);
  const manifest = JSON.parse(await readFile(join(delivery, 'manifest.json'), 'utf8'));
  assert.equal(manifest.protocolVersion, 1);
  assert.equal(manifest.milestone, 'M1', 'Only M1 deliveries are supported');
  assert.equal(manifest.file, 'result.ggb');
  assert.match(manifest.sha256, /^[a-f0-9]{64}$/);
  assert((await stat(join(delivery, 'result.ggb'))).size <= 10 * 1024 * 1024, 'GGB exceeds M1 size limit');
  const bytes = await readFile(join(delivery, 'result.ggb'));
  assert.equal(sha256(bytes), manifest.sha256, 'GGB file checksum mismatch');
  const session = await openBrowser(headed);
  try {
    const page = await session.page();
    await loadGgb(page, bytes.toString('base64'));
    const report = await verifyTriangle(page);
    assert.deepEqual(report.objects, manifest.objects, 'Delivery objects changed');
    assert.equal(await runtimeVersion(page), manifest.runtimeVersion);
    return { ...session, page, delivery };
  } catch (error) {
    await session.close();
    throw error;
  }
}
