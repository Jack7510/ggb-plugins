import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { browserTarget } from './browser-target.js';
import { exportGgb, loadGgb, openBrowser, runtimeVersion, snapshot, waitForCAS } from './browser.js';
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
    await waitForCAS(page);
    assert(await page.evaluate(() => window.ggb.evalCommand('DoctorCAS=Factor(x^2-1)') && window.ggb.isDefined('DoctorCAS')), 'CAS object failed');
    const bytes = await exportGgb(page);
    assert(Buffer.from(bytes, 'base64').subarray(0, 2).toString() === 'PK', 'GGB export failed');
    const reloaded = await session.page(); await loadGgb(reloaded, bytes);
    const objects = await snapshot(reloaded);
    const point = objects.find(o => o.name === 'DoctorPoint');
    assert(objects.length === 2 && point?.defined && point.x === 0 && point.y === 0, 'GGB reload failed');
    await waitForCAS(reloaded);
    assert(await reloaded.evaluate(() => window.ggb.isDefined('DoctorCAS') && window.ggb.evalCommandCAS('Simplify(DoctorCAS(x)-(x^2-1))') === '0'), 'CAS reload failed');
    const target = browserTarget();
    const result = { toolVersion: pkg.version, nodeVersion: process.version,
      browser: { version: session.browser.version(), label: target.label,
        ...(target.executablePath === undefined ? { channel: target.channel } : { executablePath: target.executablePath }) },
      runtime: { version: await runtimeVersion(reloaded), url: lock.url, sha256: lock.sha256 },
      smoke: 'passed', casSmoke: 'passed', native: { channels: ['algebra', 'cas'], mathematicalCommandWhitelist: false, casMaterialization: 'named native result' }, limits, tolerance, commands, predicates };
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
