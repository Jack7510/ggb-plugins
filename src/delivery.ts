import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { dragPoint, execute, exportGgb, loadGgb, openBrowser, runtimeVersion, snapshot, zoom, type Snapshot } from './browser.js';
import { compile } from './compile.js';
import { limits, parseRequest, ToolError, type Request } from './schema.js';
import { compareSnapshots, equivalent, verify, type Verification } from './verify.js';

export const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const save = (path: string, value: unknown) => writeFile(path, json(value));
export async function readJson(path: string, max = limits.requestBytes): Promise<unknown> {
  const info = await stat(path);
  assert(info.isFile() && info.size > 0 && info.size <= max, 'Expected a nonempty JSON file within the size limit');
  return JSON.parse(await readFile(path, 'utf8'));
}
function requirePassed(result: Verification) {
  if (result.status !== 'passed') throw new ToolError(result.status === 'failed' ? 'verification_failed' : 'verification_unverified', 'Required checks did not pass', result.results.filter(r => r.status !== 'passed'));
}

/** All problems use this one pipeline. Problem understanding belongs to the calling Codex. */
export async function build(input: unknown, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const request = parseRequest(input), compiled = compile(request);
  const requestBytes = Buffer.from(json(request));
  assert(requestBytes.length <= limits.requestBytes, 'Request exceeds the size limit');
  const running = AbortSignal.any([AbortSignal.timeout(120_000), ...(signal ? [signal] : [])]);
  await mkdir(request.outputDir, { recursive: true });
  const run = await mkdtemp(join(resolve(request.outputDir), 'ggb-'));
  const temp = join(run, 'delivery.tmp'); await mkdir(temp);
  const requestSha256 = sha256(requestBytes);
  await writeFile(join(run, 'request.json'), requestBytes);
  await save(join(run, 'run.json'), { state: 'running', requestSha256 });
  let session: Awaited<ReturnType<typeof openBrowser>> | undefined;
  let stage = 'runtime_unavailable';
  try {
    session = await openBrowser(false, running);
    const original = await session.page();
    stage = 'execution_failed'; await execute(original, compiled, request.prompt);
    const construction = verify(request, await snapshot(original), 'initial');
    await save(join(run, 'verification.json'), construction); requirePassed(construction);
    stage = 'export_failed';
    const bytes = Buffer.from(await exportGgb(original), 'base64');
    assert(bytes.length <= limits.ggbBytes && bytes.subarray(0, 2).toString() === 'PK', 'Expected a bounded GGB ZIP archive');
    await writeFile(join(temp, 'result.ggb'), bytes);
    stage = 'reload_failed';
    const reloaded = await session.page();
    const data = (await readFile(join(temp, 'result.ggb'))).toString('base64');
    await loadGgb(reloaded, data, request.prompt);
    const reload = verify(request, await snapshot(reloaded), 'initial'); requirePassed(reload);
    compareSnapshots(reload.objects, construction.objects);
    await reloaded.screenshot({ path: join(temp, 'preview.png') });
    stage = 'verification_failed';
    const samples = [];
    for (const sample of request.plan.interactions) {
      const candidate = await session.page();
      try {
        await loadGgb(candidate, data, request.prompt);
        const before = await snapshot(candidate);
        await dragPoint(candidate, sample);
        const after = verify(request, await snapshot(candidate), 'sampled');
        samples.push({ point: sample.point, before, after });
        await save(join(run, 'verification.json'), { construction, reload, samples });
        requirePassed(after);
      } finally { await candidate.close(); }
    }
    const zoomResult = await zoom(reloaded);
    compareSnapshots(await snapshot(original), construction.objects);
    const report = { milestone: 'M2', requestSha256, construction, reload, interaction: { status: 'passed', samples, zoom: zoomResult } };
    assert(Buffer.byteLength(json(report)) <= limits.reportBytes, 'Verification report exceeds the size limit');
    await save(join(temp, 'verification.json'), report);
    await writeFile(join(temp, 'request.json'), requestBytes);
    await save(join(temp, 'manifest.json'), {
      protocolVersion: 1, milestone: 'M2', runtimeVersion: await runtimeVersion(original), file: 'result.ggb',
      sha256: sha256(bytes), requestSha256, objects: construction.objects,
    });
    stage = 'export_failed'; running.throwIfAborted();
    const delivery = join(run, 'delivery'); await rename(temp, delivery);
    await save(join(run, 'run.json'), { state: 'delivered', requestSha256, delivery: 'delivery' });
    return { delivery, file: join(delivery, 'result.ggb'), report: join(delivery, 'verification.json') };
  } catch (error) {
    const failure = error instanceof ToolError ? error : new ToolError(running.aborted ? (signal?.aborted ? 'cancelled' : 'limit_exceeded') : stage, error instanceof Error ? error.message : String(error));
    await save(join(run, 'run.json'), { state: 'failed', requestSha256, error: { code: failure.code, message: failure.message, details: failure.details } });
    throw failure;
  } finally { await session?.close(); }
}

function validatePhase(request: Request, input: any, phase: 'initial' | 'sampled') {
  assert(input?.status === 'passed' && Array.isArray(input.objects) && input.objects.length > 0, 'Missing or failed verification evidence');
  const actual = verify(request, input.objects as Snapshot, phase); requirePassed(actual);
  assert(equivalent(actual.results, input.results), 'Verification results do not match their observations');
}

export async function openPreview(deliveryDir: string, headed = true, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const delivery = resolve(deliveryDir);
  const manifest = await readJson(join(delivery, 'manifest.json'), 2 * 1024 * 1024) as any;
  assert(manifest?.protocolVersion === 1 && manifest.milestone === 'M2' && manifest.file === 'result.ggb', 'Unsupported delivery format; regenerate with build');
  assert.match(manifest.sha256, /^[a-f0-9]{64}$/); assert.match(manifest.requestSha256, /^[a-f0-9]{64}$/);
  const request = parseRequest(await readJson(join(delivery, 'request.json'))); compile(request);
  assert.equal(sha256(await readFile(join(delivery, 'request.json'))), manifest.requestSha256, 'Request checksum mismatch');
  const picture = await stat(join(delivery, 'preview.png'));
  assert(picture.isFile() && picture.size > 0 && picture.size <= limits.ggbBytes, 'preview.png must be a bounded nonempty file');
  const report = await readJson(join(delivery, 'verification.json'), limits.reportBytes) as any;
  assert.equal(report?.milestone, 'M2'); assert.equal(report.requestSha256, manifest.requestSha256);
  validatePhase(request, report.construction, 'initial'); validatePhase(request, report.reload, 'initial');
  compareSnapshots(report.construction.objects, manifest.objects); compareSnapshots(report.reload.objects, manifest.objects);
  assert(report.interaction?.status === 'passed' && Array.isArray(report.interaction.samples), 'Missing or failed interaction evidence');
  assert.equal(report.interaction.samples.length, request.plan.interactions.length, 'Incomplete interaction coverage');
  for (const [index, sample] of report.interaction.samples.entries()) {
    const expected = request.plan.interactions[index]!;
    assert.equal(sample.point, expected.point, 'Interaction point changed');
    compareSnapshots(sample.before, report.reload.objects); validatePhase(request, sample.after, 'sampled');
    const before = sample.before.find((f: Snapshot[number]) => f.name === sample.point);
    const after = sample.after.objects.find((f: Snapshot[number]) => f.name === sample.point);
    assert(before && after && Math.hypot(after.x - before.x, after.y - before.y) > 1e-8, 'No observed drag movement');
  }
  const z = report.interaction.zoom;
  assert(z?.method === 'button' && Number.isFinite(z.before) && Number.isFinite(z.after) && z.before > 0 && z.after > 0 && z.before !== z.after, 'Missing zoom evidence');
  const info = await stat(join(delivery, 'result.ggb'));
  assert(info.isFile() && info.size > 0 && info.size <= limits.ggbBytes, 'Invalid GGB file size');
  const bytes = await readFile(join(delivery, 'result.ggb')); assert.equal(sha256(bytes), manifest.sha256, 'GGB checksum mismatch');
  const session = await openBrowser(headed, signal);
  try {
    const page = await session.page(); await loadGgb(page, bytes.toString('base64'), request.prompt);
    const actual = verify(request, await snapshot(page), 'initial'); requirePassed(actual);
    compareSnapshots(actual.objects, manifest.objects);
    assert.equal(await runtimeVersion(page), manifest.runtimeVersion);
    return { ...session, page, delivery, request };
  } catch (error) { await session.close(); throw error; }
}
