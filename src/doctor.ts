import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { exportGgb, loadGgb, openBrowser, runtimeVersion, snapshot } from './browser.js';
import { commands, limits, predicates, toolError } from './schema.js';
import { root } from './server.js';
import { tolerance } from './verify.js';

/** Readiness uses the same local runtime, browser and GGB loading path as build. */
export async function doctor(signal?: AbortSignal) {
  const running = AbortSignal.any([AbortSignal.timeout(limits.doctorMs), ...(signal ? [signal] : [])]);
  let session: Awaited<ReturnType<typeof openBrowser>> | undefined;
  let failure: ReturnType<typeof toolError> | undefined;
  try {
    running.throwIfAborted();
    const lock = JSON.parse(await readFile(join(root, 'runtime.lock.json'), 'utf8'));
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    assert(Number(process.versions.node.split('.')[0]) >= 22, 'Node.js 22+ is required');
    session = await openBrowser(false, running);
    const page = await session.page();
    assert(await page.evaluate(() => window.ggb.evalCommand('DoctorPoint=(0,0)')), 'Applet command failed');
    const bytes = await exportGgb(page);
    assert(Buffer.from(bytes, 'base64').subarray(0, 2).toString() === 'PK', 'GGB export failed');
    const reloaded = await session.page(); await loadGgb(reloaded, bytes);
    const objects = await snapshot(reloaded);
    assert(objects.length === 1 && objects[0]!.name === 'DoctorPoint' && objects[0]!.defined && objects[0]!.x === 0 && objects[0]!.y === 0, 'GGB reload failed');
    const result = { toolVersion: pkg.version, nodeVersion: process.version,
      browser: { version: session.browser.version(), executablePath: chromium.executablePath() },
      runtime: { version: await runtimeVersion(reloaded), url: lock.url, sha256: lock.sha256 },
      smoke: 'passed', limits, tolerance, commands, predicates };
    await session.close(); session = undefined;
    running.throwIfAborted();
    return result;
  } catch (error) { failure = toolError(error, 'runtime_unavailable', running); throw failure; }
  finally {
    try { await session?.close(); }
    catch (error) {
      if (!failure) throw toolError(error, 'runtime_unavailable', running);
      failure.details = { cause: failure.details, cleanup: String(error) };
    }
  }
}
