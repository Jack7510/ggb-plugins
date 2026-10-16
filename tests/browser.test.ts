import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadGgb } from '../src/browser.js';
import { openPreview, sha256 } from '../src/delivery.js';
import { root } from '../src/server.js';
import { verifyInteraction, verifyTriangle } from '../src/triangle.js';

test('a completed build process produces a reloadable, draggable GGB', { timeout: 90_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'ggb-browser-'));
  try {
    // The builder must exit before a separate preview session loads its artifact.
    const { stdout } = await promisify(execFile)(process.execPath, [
      join(root, 'dist/src/cli.js'), 'demo', '--output', directory,
    ], { timeout: 60_000 });
    const result = JSON.parse(stdout);
    assert.equal(result.ok, true, stdout);
    const { delivery, file } = result.data;
    const reportPath = join(delivery, 'verification.json');
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    for (const check of ['construction', 'reload', 'interaction']) assert.equal(report[check].status, 'passed');
    const bytes = await readFile(file);
    const before = sha256(bytes);
    const signals = { int: process.listeners('SIGINT'), term: process.listeners('SIGTERM'), exitCode: process.exitCode };
    const session = await openPreview(delivery, process.env.GGB_HEADED === '1');
    try {
      assert.deepEqual(process.listeners('SIGINT'), signals.int);
      assert.deepEqual(process.listeners('SIGTERM'), signals.term);
      assert.equal(process.exitCode, signals.exitCode);
      assert.equal((await verifyTriangle(session.page)).status, 'passed');

      await t.test('presentation regressions are rejected', async () => {
        const reset = () => loadGgb(session.page, bytes.toString('base64'));
        for (const name of ['M', 'median']) {
          await session.page.evaluate(name => window.ggb.setVisible(name, false), name);
          await assert.rejects(verifyTriangle(session.page), new RegExp(`${name} must be visible`));
          await reset();
        }
        await session.page.evaluate(() => window.ggb.setLabelVisible('M', false));
        await assert.rejects(verifyTriangle(session.page), /M label must be visible/);
        await reset();
        await session.page.evaluate(() => window.ggb.setLineThickness('median', 1));
        await assert.rejects(verifyTriangle(session.page), /median line thickness/);
        await reset();
        await session.page.evaluate(() => window.ggb.setColor('M', 0, 0, 255));
        await assert.rejects(verifyTriangle(session.page), /M color must be red/);
        await reset();
      });

      assert.equal((await verifyInteraction(session.page)).status, 'passed');
      // Correct static coordinates are insufficient when M has no dependency.
      await session.page.evaluate(() => {
        const api = window.ggb;
        const x = api.getXcoord('M'), y = api.getYcoord('M');
        api.evalCommand('Delete(M)');
        api.evalCommand(`M=(${x},${y})`);
        api.evalCommand('median=Segment(C,M)');
        api.setLabelVisible('M', true);
        api.setColor('M', 215, 72, 48);
        api.setColor('median', 215, 72, 48);
        api.setLineThickness('median', 5);
      });
      await assert.rejects(verifyTriangle(session.page, false), /M must depend/);
    } finally {
      await session.close();
      await session.close(); // Cleanup also tolerates browser-disconnected handlers.
    }
    await assert.rejects(fetch(session.url));
    assert.equal(sha256(await readFile(file)), before, 'Preview must not overwrite the file');
    assert.deepEqual(process.listeners('SIGINT'), signals.int);
    assert.deepEqual(process.listeners('SIGTERM'), signals.term);
    assert.equal(process.exitCode, signals.exitCode);

    await t.test('incomplete or invalid delivery evidence is rejected', async () => {
      for (const name of ['verification.json', 'preview.png']) {
        const path = join(delivery, name);
        const contents = await readFile(path);
        try {
          await rm(path);
          await assert.rejects(openPreview(delivery, false), /ENOENT/);
          await writeFile(path, '');
          await assert.rejects(openPreview(delivery, false), /must be a nonempty file/);
        } finally { await writeFile(path, contents); }
      }
      const contents = await readFile(reportPath);
      try {
        await writeFile(reportPath, '{');
        await assert.rejects(openPreview(delivery, false), SyntaxError);
        await writeFile(reportPath, JSON.stringify({ ...report, interaction: undefined }));
        await assert.rejects(openPreview(delivery, false), /interaction verification must pass/);
        for (const status of ['failed', 'unverified']) {
          await writeFile(reportPath, JSON.stringify({ ...report, interaction: { ...report.interaction, status } }));
          await assert.rejects(openPreview(delivery, false), /interaction verification must pass/);
        }
        for (const moved of [[], [null], [{}]]) {
          await writeFile(reportPath, JSON.stringify({ ...report, interaction: { ...report.interaction, moved } }));
          await assert.rejects(openPreview(delivery, false), /interaction verification evidence/);
        }
      } finally { await writeFile(reportPath, contents); }
    });

    await t.test('CLI cancellation closes the preview and releases its port', async () => {
      const child = spawn(process.execPath, [join(root, 'dist/src/cli.js'), 'preview', '--delivery', delivery], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const lines = createInterface({ input: child.stdout });
      const timer = setTimeout(() => child.kill('SIGKILL'), 20_000);
      try {
        const [line] = await Promise.race([
          once(lines, 'line'),
          once(child, 'exit').then(() => { throw new Error('Preview exited before ready'); }),
        ]);
        const ready = JSON.parse(line);
        assert.equal(ready.ok, true, line);
        assert.equal((await fetch(ready.data.url)).status, 200);
        const exited = once(child, 'exit');
        child.kill('SIGTERM');
        const [code] = await exited;
        assert.equal(code, 130);
        await assert.rejects(fetch(ready.data.url));
      } finally {
        clearTimeout(timer);
        lines.close();
        if (child.exitCode === null) child.kill('SIGKILL');
      }
    });

    await writeFile(file, 'corrupted');
    await assert.rejects(openPreview(delivery, false), /checksum mismatch/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
