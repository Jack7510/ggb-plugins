import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { openPreview, sha256 } from '../src/delivery.js';
import { root } from '../src/server.js';
import { verifyInteraction, verifyTriangle } from '../src/triangle.js';

test('a completed build process produces a reloadable, draggable GGB', { timeout: 90_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ggb-browser-'));
  try {
    // The builder must exit before a separate preview session loads its artifact.
    const { stdout } = await promisify(execFile)(process.execPath, [
      join(root, 'dist/src/cli.js'), 'demo', '--output', directory,
    ], { timeout: 60_000 });
    const result = JSON.parse(stdout);
    assert.equal(result.ok, true, stdout);
    const { delivery, file } = result.data;
    const report = JSON.parse(await readFile(join(delivery, 'verification.json'), 'utf8'));
    for (const check of ['construction', 'reload', 'interaction']) assert.equal(report[check].status, 'passed');
    const before = sha256(await readFile(file));
    const session = await openPreview(delivery, process.env.GGB_HEADED === '1');
    try {
      assert.equal((await verifyTriangle(session.page)).status, 'passed');
      assert.equal((await verifyInteraction(session.page)).status, 'passed');
      // Correct static coordinates are insufficient when M has no dependency.
      await session.page.evaluate(() => {
        const api = window.ggb;
        const x = api.getXcoord('M'), y = api.getYcoord('M');
        api.evalCommand('Delete(M)');
        api.evalCommand(`M=(${x},${y})`);
        api.evalCommand('median=Segment(C,M)');
      });
      await assert.rejects(verifyTriangle(session.page, false), /M must depend/);
    } finally {
      await session.close();
      await session.close(); // Cleanup also tolerates browser-disconnected handlers.
    }
    await assert.rejects(fetch(session.url));
    assert.equal(sha256(await readFile(file)), before, 'Preview must not overwrite the file');
    await writeFile(file, 'corrupted');
    await assert.rejects(openPreview(delivery, false), /checksum mismatch/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
