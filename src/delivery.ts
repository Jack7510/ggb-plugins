import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { dragPoint, interact, execute, exportGgb, loadGgb, openBrowser, runtimeVersion, snapshot, observe, zoom, type Snapshot } from './browser.js';
import { compile } from './compile.js';
import { limits, parseRequest, ToolError, toolError, type Request } from './schema.js';
import { compareSnapshots, equivalent, verify, type Verification } from './verify.js';

export const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const save = (path: string, value: unknown) => writeFile(path, json(value));
export async function readJson(path: string, max = limits.requestBytes): Promise<unknown> {
  const info = await stat(path);
  if (info.size > max) throw new ToolError('limit_exceeded', 'JSON file exceeds the size limit');
  assert(info.isFile() && info.size > 0, 'Expected a nonempty JSON file');
  return JSON.parse(await readFile(path, 'utf8'));
}
function requirePassed(result: Verification) {
  if (result.status !== 'passed') throw new ToolError(result.status === 'failed' ? 'verification_failed' : 'verification_unverified', 'Required checks did not pass', result.results.filter(r => r.status !== 'passed'));
}

/** All problems use this one pipeline. Problem understanding belongs to the calling Codex. */
export async function build(input: unknown, signal?: AbortSignal) {
  let request: Request, compiled: ReturnType<typeof compile>;
  try { signal?.throwIfAborted(); request = parseRequest(input); compiled = compile(request); }
  catch (error) { throw toolError(error, 'invalid_input', signal); }
  const requestBytes = Buffer.from(json(request));
  if (requestBytes.length > limits.requestBytes) throw new ToolError('limit_exceeded', 'Request exceeds the size limit');
  const running = AbortSignal.any([AbortSignal.timeout(limits.buildMs), ...(signal ? [signal] : [])]);
  const requestSha256 = sha256(requestBytes);
  let run: string | undefined;
  let session: Awaited<ReturnType<typeof openBrowser>> | undefined;
  let stage = 'export_failed';
  const diagnostics: string[] = [];
  try {
    await mkdir(request.outputDir, { recursive: true });
    run = await mkdtemp(join(resolve(request.outputDir), 'ggb-'));
    const temp = join(run, 'delivery.tmp'); await mkdir(temp);
    await writeFile(join(run, 'request.json'), requestBytes);
    await save(join(run, 'run.json'), { state: 'running', requestSha256 });
    stage = 'runtime_unavailable';
    session = await openBrowser(false, running);
    const original = await session.page();
    stage = 'execution_failed'; await execute(original, compiled, request.prompt);
    const initialFacts = await observe(original, request, 'initial');
    const construction = verify(request, initialFacts.objects, 'initial', initialFacts.observations);
    await save(join(run, 'verification.json'), construction); requirePassed(construction);
    stage = 'export_failed';
    const bytes = Buffer.from(await exportGgb(original), 'base64');
    if (bytes.length > limits.ggbBytes) throw new ToolError('limit_exceeded', 'GGB file exceeds the size limit');
    assert(bytes.subarray(0, 2).toString() === 'PK', 'Expected a GGB ZIP archive');
    await writeFile(join(temp, 'result.ggb'), bytes);
    stage = 'reload_failed';
    const reloaded = await session.page();
    const data = (await readFile(join(temp, 'result.ggb'))).toString('base64');
    await loadGgb(reloaded, data, request.prompt, request.plan.display);
    const reloadFacts = await observe(reloaded, request, 'initial');
    const reload = verify(request, reloadFacts.objects, 'initial', reloadFacts.observations); requirePassed(reload);
    compareSnapshots(reload.objects, construction.objects);
    stage = 'export_failed'; await reloaded.screenshot({ path: join(temp, 'preview.png') });
    stage = 'verification_failed';
    const samples = [];
    for (const sample of request.plan.interactions) {
      const candidate = await session.page();
      let interactionFailed = false;
      try {
        await loadGgb(candidate, data, request.prompt, request.plan.display);
        const before = await snapshot(candidate);
        const method = 'point' in sample ? (await dragPoint(candidate, sample), 'mouse' as const) : await interact(candidate, sample);
        const sampleFacts = await observe(candidate, request, 'sampled');
        const after = verify(request, sampleFacts.objects, 'sampled', sampleFacts.observations);
        samples.push({ ...sample, method, before, after });
        await save(join(run, 'verification.json'), { construction, reload, samples });
        requirePassed(after);
      } catch (error) { interactionFailed = true; throw error; }
      finally {
        try { await candidate.close(); }
        catch (cleanup) {
          if (!interactionFailed) throw cleanup;
          diagnostics.push(`Interaction cleanup failed: ${cleanup instanceof Error ? cleanup.message : String(cleanup)}`);
        }
      }
    }
    const zoomResult = request.plan.display === 'algebra' ? { method: 'not_applicable' as const, reason: 'algebra-only view' } : await zoom(reloaded);
    compareSnapshots(await snapshot(original), construction.objects);
    const report = { milestone: 'M6', requestSha256, construction, reload, interaction: { status: 'passed', samples, zoom: zoomResult } };
    stage = 'export_failed';
    if (Buffer.byteLength(json(report)) > limits.reportBytes) throw new ToolError('limit_exceeded', 'Verification report exceeds the size limit');
    await save(join(temp, 'verification.json'), report);
    await writeFile(join(temp, 'request.json'), requestBytes);
    await save(join(temp, 'manifest.json'), {
      protocolVersion: 2, milestone: 'M6', runtimeVersion: await runtimeVersion(original), file: 'result.ggb',
      sha256: sha256(bytes), requestSha256, objects: construction.objects,
    });
    // Close resources before the commit point. No fallible cleanup follows rename.
    stage = 'export_failed'; await session.close(); session = undefined;
    running.throwIfAborted();
    const delivery = join(run, 'delivery'); await rename(temp, delivery);
    const warnings: string[] = [];
    try { await save(join(run, 'run.json'), { state: 'delivered', requestSha256, delivery: 'delivery' }); }
    catch (error) { warnings.push(`Delivery committed; run.json update failed: ${error instanceof Error ? error.message : String(error)}`); }
    return { delivery, file: join(delivery, 'result.ggb'), report: join(delivery, 'verification.json'), ...(warnings.length ? { warnings } : {}) };
  } catch (error) {
    const failure = toolError(error, stage, running);
    try { await session?.close(); }
    catch (cleanup) { diagnostics.push(`Cleanup failed: ${cleanup instanceof Error ? cleanup.message : String(cleanup)}`); }
    failure.details = { run, stage, cause: failure.details, diagnostics };
    if (run) try { await save(join(run, 'run.json'), { state: 'failed', requestSha256, error: { code: failure.code, message: failure.message, details: failure.details }, diagnostics }); }
    catch (write) { diagnostics.push(`Cannot save run.json: ${write instanceof Error ? write.message : String(write)}`); }
    throw failure;
  }
}

function validatePhase(request: Request, input: any, phase: 'initial' | 'sampled') {
  assert(input?.status === 'passed' && Array.isArray(input.objects) && input.objects.length > 0, 'Missing or failed verification evidence');
  const actual = verify(request, input.objects as Snapshot, phase, input.observations); requirePassed(actual);
  assert(equivalent(actual.results, input.results), 'Verification results do not match their observations');
}

export async function openPreview(deliveryDir: string, headed = true, signal?: AbortSignal) {
  try { return await preview(deliveryDir, headed, signal); }
  catch (error) { throw toolError(error, 'preview_failed', signal); }
}

async function preview(deliveryDir: string, headed: boolean, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const delivery = resolve(deliveryDir);
  const manifest = await readJson(join(delivery, 'manifest.json'), 2 * 1024 * 1024) as any;
  assert(manifest?.protocolVersion === 2 && manifest.milestone === 'M6' && manifest.file === 'result.ggb', 'Unsupported delivery format; regenerate with build');
  assert.match(manifest.sha256, /^[a-f0-9]{64}$/); assert.match(manifest.requestSha256, /^[a-f0-9]{64}$/);
  const request = parseRequest(await readJson(join(delivery, 'request.json'))); compile(request);
  assert.equal(sha256(await readFile(join(delivery, 'request.json'))), manifest.requestSha256, 'Request checksum mismatch');
  const picture = await stat(join(delivery, 'preview.png'));
  assert(picture.isFile() && picture.size > 0 && picture.size <= limits.ggbBytes, 'preview.png must be a bounded nonempty file');
  const report = await readJson(join(delivery, 'verification.json'), limits.reportBytes) as any;
  assert.equal(report?.milestone, 'M6'); assert.equal(report.requestSha256, manifest.requestSha256);
  validatePhase(request, report.construction, 'initial'); validatePhase(request, report.reload, 'initial');
  compareSnapshots(report.construction.objects, manifest.objects); compareSnapshots(report.reload.objects, manifest.objects);
  assert(report.interaction?.status === 'passed' && Array.isArray(report.interaction.samples), 'Missing or failed interaction evidence');
  assert.equal(report.interaction.samples.length, request.plan.interactions.length, 'Incomplete interaction coverage');
  for (const [index, sample] of report.interaction.samples.entries()) {
    const expected = request.plan.interactions[index]!;
    const { before: _, after: __, method, ...input } = sample;
    assert(equivalent(input, expected), 'Interaction sample changed');
    compareSnapshots(sample.before, report.reload.objects); validatePhase(request, sample.after, 'sampled');
    const id = 'point' in expected ? expected.point : expected.parameter;
    const before = sample.before.find((f: Snapshot[number]) => f.name === id);
    const after = sample.after.objects.find((f: Snapshot[number]) => f.name === id);
    assert(before && after, 'Missing interaction facts');
    if ('point' in expected) assert(method === 'mouse' && Math.hypot(after.x - before.x, after.y - before.y) > 1e-8, 'No observed drag movement');
    else assert(method === 'native_value' && before.type === 'numeric' && before.independent && before.moveable && before.slider
      && after.value !== null && before.value !== null && Math.abs(after.value - before.value) > 1e-8
      && equivalent(after.value, expected.value) && expected.value >= before.slider.min && expected.value <= before.slider.max, 'Invalid parameter evidence');
  }
  const z = report.interaction.zoom;
  if (request.plan.display === 'algebra') assert(z?.method === 'not_applicable' && z.reason === 'algebra-only view', 'Invalid algebra view evidence');
  else assert(z?.method === 'button' && Number.isFinite(z.before) && Number.isFinite(z.after) && z.before > 0 && z.after > 0 && z.before !== z.after, 'Missing zoom evidence');
  const info = await stat(join(delivery, 'result.ggb'));
  assert(info.isFile() && info.size > 0 && info.size <= limits.ggbBytes, 'Invalid GGB file size');
  const bytes = await readFile(join(delivery, 'result.ggb')); assert.equal(sha256(bytes), manifest.sha256, 'GGB checksum mismatch');
  const session = await openBrowser(headed, signal);
  try {
    const page = await session.page(); await loadGgb(page, bytes.toString('base64'), request.prompt, request.plan.display);
    const actualFacts = await observe(page, request, 'initial');
    const actual = verify(request, actualFacts.objects, 'initial', actualFacts.observations); requirePassed(actual);
    compareSnapshots(actual.objects, manifest.objects);
    assert.equal(await runtimeVersion(page), manifest.runtimeVersion);
    return { ...session, page, delivery, request };
  } catch (error) {
    const failure = toolError(error, 'preview_failed', signal);
    try { await session.close(); }
    catch (cleanup) { failure.details = { cause: failure.details, cleanup: String(cleanup) }; }
    throw failure;
  }
}
