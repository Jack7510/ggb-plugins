/**
 * @fileoverview Orchestrates verified file delivery, diagnostics and previews.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { dragPoint, interact, execute, exportGgb, loadGgb, openBrowser, openDefaultBrowser, runtimeVersion, snapshot, observe, zoom, applyEdits, applyStyles, applyUpdates, type Snapshot } from './browser.js';
import { unsupportedType, type GgbSummary } from './ggbfile.js';
import { loadBase } from './inspect.js';
import {
  commandTokens, diffViolations, editFields, requireEffects, validateTargets,
} from './edit.js';
import { compile, type BaseFacts } from './compile.js';
import { tautologies } from './tautology.js';
import {
  modifyViolations, requireUpdateEffects, updateFields, valueMatches,
  validateModifyStyles, validateUpdates, type BaseFact,
} from './modify.js';
import { limits, parseRequest, ToolError, toolError, type Request, type Style } from './schema.js';
import { compareSnapshots, snapshotDifferences, equivalent, verify, type Verification } from './verify.js';

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

/** Zoom evidence is not applicable to an algebra-only view. */
async function zoomEvidence(context: BuildContext, page: Page) {
  return context.request.plan.display === 'algebra'
    ? { method: 'not_applicable', reason: 'algebra-only view' }
    : await zoom(page);
}

interface PhaseTiming { phase: string; startMs: number; durationMs: number; }
interface FactTiming {
  phase: string;
  casMs: number;
  probesMs: number;
  valuesMs: number;
  snapshotMs: number;
}
type Engine = Awaited<ReturnType<typeof openBrowser>>;
type Page = Awaited<ReturnType<Engine['page']>>;
type Interaction = Request['plan']['interactions'][number];
type SampleEvidence = Interaction & {
  method: 'mouse' | 'native_value';
  before: Snapshot;
  after: Verification;
  roundTrip?: { value: number; after: Verification };
};
interface DeliveryResult {
  delivery: string; file: string; report: string; warnings?: string[];
}
interface BuildContext {
  started: number;
  request: Request;
  compiled: ReturnType<typeof compile>;
  requestBytes: Buffer;
  requestSha256: string;
  running: AbortSignal;
  run: string;
  temp: string;
  stage: string;
  session?: Engine;
  timings: PhaseTiming[];
  observationTimings: FactTiming[];
  diagnostics: string[];
  timed<T>(phase: string, operation: () => Promise<T>): Promise<T>;
}

/** Validates before any filesystem or browser side effect. */
function buildContext(input: unknown, signal?: AbortSignal): BuildContext {
  const started = performance.now();
  let request: Request;
  let compiled: ReturnType<typeof compile>;
  try {
    signal?.throwIfAborted();
    request = parseRequest(input);
    compiled = compile(request);
  } catch (error) {
    throw toolError(error, 'invalid_input', signal);
  }
  const requestBytes = Buffer.from(json(request));
  if (requestBytes.length > limits.requestBytes) {
    throw new ToolError('limit_exceeded', 'Request exceeds the size limit');
  }
  const timings: PhaseTiming[] = [];
  return {
    started, request, compiled, requestBytes,
    requestSha256: sha256(requestBytes),
    running: AbortSignal.any([
      AbortSignal.timeout(limits.buildMs), ...(signal ? [signal] : []),
    ]),
    run: '', temp: '', stage: 'export_failed',
    timings, observationTimings: [], diagnostics: [],
    async timed<T>(phase: string, operation: () => Promise<T>): Promise<T> {
      const start = performance.now();
      try {
        return await operation();
      } finally {
        timings.push({
          phase, startMs: start - started,
          durationMs: performance.now() - start,
        });
      }
    },
  };
}

async function collect(
  context: BuildContext, page: Page, phase: string,
  scope: 'initial' | 'sampled',
): Promise<Verification> {
  const timingPhase = phase.startsWith('sample.') ? 'sample.observe' :
    phase.startsWith('return.') ? 'sample.restore.observe' : phase + '.observe';
  const facts = await context.timed(timingPhase,
    () => observe(page, context.request, scope));
  context.observationTimings.push({ phase, ...facts.durations });
  return verify(context.request, facts.objects, scope, facts.observations);
}

/** Writes the original material; failure cannot commit a delivery. */
async function construct(context: BuildContext): Promise<{
  original: Page; construction: Verification; bytes: Buffer;
}> {
  const { request } = context;
  await mkdir(request.outputDir, { recursive: true });
  context.run = await mkdtemp(join(resolve(request.outputDir), 'ggb-'));
  context.temp = join(context.run, 'delivery.tmp');
  await mkdir(context.temp);
  await writeFile(join(context.run, 'request.json'), context.requestBytes);
  await save(join(context.run, 'run.json'), {
    state: 'running', requestSha256: context.requestSha256,
  });
  context.stage = 'runtime_unavailable';
  const session = await context.timed('browser.start',
    () => openBrowser(false, context.running));
  context.session = session;
  const original = await context.timed('construction.applet',
    () => session.page());
  context.stage = 'execution_failed';
  await context.timed('construction.execute',
    () => execute(original, context.compiled, request.prompt));
  const construction = await collect(
    context, original, 'construction', 'initial',
  );
  await acceptConstruction(context, construction);
  const bytes = await exportArtifact(context, original);
  return { original, construction, bytes };
}

async function reload(
  context: BuildContext, construction: Verification,
): Promise<{ reloaded: Page; reload: Verification; data: string }> {
  const session = context.session;
  assert(session);
  context.stage = 'reload_failed';
  const reloaded = await context.timed('reload.applet', () => session.page());
  const bytes = await readFile(join(context.temp, 'result.ggb'));
  const data = bytes.toString('base64');
  await context.timed('reload.load', () => loadGgb(
    reloaded, data, context.request.prompt, context.request.plan.display,
  ));
  const result = await collect(context, reloaded, 'reload', 'initial');
  await save(join(context.run, 'verification.json'), {
    construction, reload: result,
  });
  requirePassed(result);
  const differences = snapshotDifferences(result.objects, construction.objects);
  if (differences.length) {
    try {
      await save(join(context.run, 'snapshot-differences.json'), differences);
    } catch (error) {
      context.diagnostics.push(
        'Cannot save snapshot differences: ' + String(error));
    }
  }
  compareSnapshots(result.objects, construction.objects);
  return { reloaded, reload: result, data };
}

/** Restores a parameter on the same sample page, preserving history. */
async function roundTrip(
  context: BuildContext, page: Page, parameter: string,
  before: Snapshot, index: number,
): Promise<NonNullable<SampleEvidence['roundTrip']>> {
  const value = before.find(fact => fact.name === parameter)?.value;
  assert(typeof value === 'number' && Number.isFinite(value));
  await context.timed('sample.restore',
    () => interact(page, { parameter, value }));
  const after = await collect(context, page, `return.${index}`, 'initial');
  return { value, after };
}

/** Each sample owns a fresh applet; at most one next page is preloaded. */
async function sampleInteractions(
  context: BuildContext, artifact: Awaited<ReturnType<typeof reload>>,
  construction: Verification,
): Promise<SampleEvidence[]> {
  const session = context.session;
  assert(session);
  const prepare = () => {
    const page = context.timed('sample.applet', () => session.page());
    void page.catch(() => {});
    return page;
  };
  const inputs = context.request.plan.interactions;
  let pending = inputs.length ? prepare() : undefined;
  context.stage = 'export_failed';
  await context.timed('screenshot', () => artifact.reloaded.screenshot({
    path: join(context.temp, 'preview.png'),
  }));
  context.stage = 'verification_failed';
  const samples: SampleEvidence[] = [];
  const persist = () => save(join(context.run, 'verification.json'), {
    construction, reload: artifact.reload, samples,
  });
  for (const [index, sample] of inputs.entries()) {
    assert(pending);
    const page = await pending;
    pending = index + 1 < inputs.length ? prepare() : undefined;
    let failed = false;
    try {
      await sampleOne(
        context, artifact.data, page, sample, index, samples, persist);
    } catch (error) {
      failed = true;
      await captureInteractionFailure(context, page, index);
      throw error;
    } finally {
      try {
        await page.close();
      } catch (cleanup) {
        if (!failed) throw cleanup;
        context.diagnostics.push(
          'Interaction cleanup failed: ' + String(cleanup));
      }
    }
  }
  return samples;
}

/** Screenshot diagnostics never replace the original interaction failure. */
async function captureInteractionFailure(
  context: BuildContext, page: Page, index: number,
): Promise<void> {
  try {
    await page.screenshot({
      path: join(context.run, `interaction-failure-${index}.png`),
      timeout: limits.operationMs,
    });
  } catch (error) {
    context.diagnostics.push(
      'Cannot save interaction screenshot: ' + String(error));
  }
}

async function sampleOne(
  context: BuildContext, data: string, page: Page, sample: Interaction,
  index: number, samples: SampleEvidence[], persist: () => Promise<void>,
): Promise<void> {
  const { request } = context;
  await context.timed('sample.load',
    () => loadGgb(page, data, request.prompt, request.plan.display));
  const before = await snapshot(page);
  const method = await context.timed(
    'point' in sample ? 'sample.drag' : 'sample.parameter',
    async () => {
      if ('point' in sample) {
        await dragPoint(page, sample);
        return 'mouse' as const;
      }
      return await interact(page, sample);
    },
  );
  const after = await collect(context, page, `sample.${index}`, 'sampled');
  const evidence: SampleEvidence = { ...sample, method, before, after };
  samples.push(evidence);
  await persist();
  requirePassed(after);
  if ('parameter' in sample) {
    evidence.roundTrip = await roundTrip(
      context, page, sample.parameter, before, index,
    );
    await persist();
    requirePassed(evidence.roundTrip.after);
    compareSnapshots(evidence.roundTrip.after.objects, before);
  }
}

/** Prepares the edit run directory and binds the archive to the request. */
async function editArchive(context: BuildContext) {
  const { archive, summary } = await loadBase(context.request.base!);
  const { request } = context;
  await mkdir(request.outputDir, { recursive: true });
  context.run = await mkdtemp(join(resolve(request.outputDir), 'ggb-'));
  context.temp = join(context.run, 'delivery.tmp');
  await mkdir(context.temp);
  await writeFile(join(context.run, 'request.json'), context.requestBytes);
  await save(join(context.run, 'run.json'), {
    state: 'running', requestSha256: context.requestSha256,
  });
  await writeFile(join(context.run, 'base.ggb'), archive.bytes);
  return { archive, summary };
}

/** The archive must describe exactly the objects the applet loaded. */
function checkBaseline(baseline: Snapshot, summary: GgbSummary): void {
  const names = new Set(baseline.map(fact => fact.name));
  const missing = summary.objects.filter(object => !names.has(object.name));
  if (missing.length) {
    throw new ToolError('base_unsupported',
      'Base objects were dropped on load', missing);
  }
  const opaque = baseline.filter(fact => unsupportedType(fact.type));
  if (opaque.length) {
    throw new ToolError('base_unsupported', 'Unsupported base object',
      opaque.map(fact => ({ name: fact.name, type: fact.type })));
  }
}

/** Dependency links for edit propagation: recorded inputs plus definitions. */
function editLinks(facts: Snapshot) {
  return facts.map(fact => ({
    name: fact.name,
    inputs: [...new Set([...fact.inputs, ...commandTokens(fact.command)])]
      .filter(input => input !== fact.name),
  }));
}

/** Base labels and types from the bounded archive summary. */
function summaryFacts(summary: GgbSummary): BaseFacts {
  return {
    labels: new Set(summary.objects.map(object => object.name)),
    types: new Map(summary.objects.map(object => [object.name, object.type])),
  };
}

/** Base labels and types from live facts. */
function snapshotFacts(facts: Snapshot): BaseFacts {
  return {
    labels: new Set(facts.map(fact => fact.name)),
    types: new Map(facts.map(fact => [fact.name, fact.type])),
  };
}

function updateFacts(facts: Snapshot): Map<string, BaseFact> {
  return new Map(facts.map(fact => [fact.name, {
    name: fact.name, type: fact.type, independent: fact.independent,
    moveable: fact.moveable, fixed: fact.fixed, slider: fact.slider,
  }]));
}

/** Applies additions, updates and styles, then enforces the modify gates. */
async function modifyGates(
  context: BuildContext, page: Page, summary: GgbSummary,
) {
  const baseline = await context.timed('base.observe', () => snapshot(page));
  checkBaseline(baseline, summary);
  const facts = snapshotFacts(baseline);
  // Live facts are authoritative for base labels and types.
  context.compiled = compile(context.request, facts);
  const compiled = context.compiled;
  validateModifyStyles(compiled.styles, facts.labels);
  validateUpdates(compiled.updates, updateFacts(baseline));
  const baseTypes = new Map(baseline.map(fact => [fact.name, fact.type]));
  validateTargets(compiled.styles.filter(style =>
    facts.labels.has(style.object)), baseTypes);
  context.stage = 'modify_failed';
  await context.timed('modify.execute',
    () => execute(page, compiled, context.request.prompt));
  const updateEffects = await context.timed('modify.update',
    () => applyUpdates(page, compiled.updates));
  requireUpdateEffects(compiled.updates, updateEffects);
  const styleEffects = await context.timed('modify.style',
    () => applyStyles(page, compiled.styles));
  requireEffects(compiled.styles, styleEffects);
  const verification = await context.timed('modify.verify',
    () => collect(context, page, 'construction', 'initial'));
  const differences = snapshotDifferences(verification.objects, baseline);
  const declared = new Set(compiled.program.flatMap(step => step.outputs));
  const violations = modifyViolations({
    styles: compiled.styles, updates: compiled.updates, differences,
    links: editLinks(verification.objects), declared,
    baseLabels: facts.labels,
  });
  if (violations.length) {
    throw new ToolError('preservation_violation',
      'Modification changed fields it did not declare', violations);
  }
  return {
    baseline, updateEffects, styleEffects, differences, verification,
  };
}

/** Applies edits, then enforces effect, preservation and requirement gates. */
async function editGates(
  context: BuildContext, page: Page, summary: GgbSummary,
) {
  const edits = context.compiled.edits;
  const baseline = await context.timed('base.observe', () => snapshot(page));
  checkBaseline(baseline, summary);
  // The archive types are static; live facts are authoritative before editing.
  validateTargets(edits, new Map(baseline.map(fact => [fact.name, fact.type])));
  context.stage = 'edit_failed';
  const effects = await context.timed('edit.apply', () => applyEdits(page, edits));
  requireEffects(edits, effects);
  const verification = await context.timed('edit.verify',
    () => collect(context, page, 'construction', 'initial'));
  const differences = snapshotDifferences(verification.objects, baseline);
  const violations = diffViolations(edits, differences,
    editLinks(verification.objects));
  if (violations.length) {
    throw new ToolError('preservation_violation',
      'Edit changed fields it did not declare', violations);
  }
  return { baseline, effects, differences, verification };
}

/** Persists failed initial evidence before any file can be exported. */
async function acceptConstruction(context: BuildContext,
  result: Verification): Promise<void> {
  await save(join(context.run, 'verification.json'), result);
  requirePassed(result);
}

/** Exports one bounded GGB file to the uncommitted delivery directory. */
async function exportArtifact(context: BuildContext,
  page: Page): Promise<Buffer> {
  context.stage = 'export_failed';
  const bytes = Buffer.from(await context.timed('export',
    () => exportGgb(page)), 'base64');
  if (bytes.length > limits.ggbBytes) {
    throw new ToolError('limit_exceeded', 'GGB file exceeds the size limit');
  }
  assert(bytes.subarray(0, 2).toString() === 'PK',
    'Expected a GGB ZIP archive');
  await writeFile(join(context.temp, 'result.ggb'), bytes);
  return bytes;
}

/** Edits and modifications share initial, export and reload gates. */
async function buildBase(context: BuildContext): Promise<DeliveryResult> {
  const { request, compiled } = context;
  context.stage = 'base_invalid';
  const { archive, summary } = await editArchive(context);
  if (compiled.mode === 'edit') {
    validateTargets(compiled.edits, summaryFacts(summary).types);
  } else {
    compile(request, summaryFacts(summary));
  }
  context.stage = 'base_load_failed';
  const session = await context.timed('browser.start',
    () => openBrowser(false, context.running));
  context.session = session;
  const page = await context.timed('base.applet', () => session.page());
  await context.timed('base.load', () => loadGgb(page,
    archive.bytes.toString('base64'), request.prompt, request.plan.display));
  const input = compiled.mode === 'edit'
    ? { mode: 'edit' as const, gates: await editGates(context, page, summary) }
    : { mode: 'modify' as const,
      gates: await modifyGates(context, page, summary) };
  await acceptConstruction(context, input.gates.verification);
  const bytes = await exportArtifact(context, page);
  const artifact = await reload(context, input.gates.verification);
  context.stage = 'export_failed';
  await context.timed('screenshot', () => artifact.reloaded.screenshot({
    path: join(context.temp, 'preview.png'),
  }));
  const shared = { archive, summary, bytes, reload: artifact.reload,
    page: artifact.reloaded };
  return input.mode === 'edit'
    ? await commitEdit(context, { ...shared, gates: input.gates })
    : await commitModify(context, { ...shared, gates: input.gates });
}

interface DeliveryEvidence {
  construction: Verification;
  reload: Verification;
  interaction: {
    status: string;
    samples: SampleEvidence[];
    zoom: Awaited<ReturnType<typeof zoomEvidence>>;
  };
}

/** All modes use the same evidence and atomic directory commit. */
async function finishDelivery(context: BuildContext, input: {
  bytes: Buffer; objects: Snapshot; page: Page; report: DeliveryEvidence;
  archive?: { bytes: Buffer };
}): Promise<DeliveryResult> {
  const session = context.session;
  assert(session);
  context.stage = 'export_failed';
  validateDeliveryEvidence(context.request, input.report, input.objects);
  if (Buffer.byteLength(json(input.report)) > limits.reportBytes) {
    throw new ToolError('limit_exceeded',
      'Verification report exceeds the size limit');
  }
  await save(join(context.temp, 'verification.json'), input.report);
  await writeFile(join(context.temp, 'request.json'), context.requestBytes);
  if (input.archive) {
    await writeFile(join(context.temp, 'base.ggb'), input.archive.bytes);
  }
  const base = input.archive ? { base: {
    file: 'base.ggb', sha256: sha256(input.archive.bytes),
    bytes: input.archive.bytes.length,
  } } : {};
  await save(join(context.temp, 'manifest.json'), {
    protocolVersion: 2, milestone: 'M6',
    runtimeVersion: await runtimeVersion(input.page), file: 'result.ggb',
    sha256: sha256(input.bytes), requestSha256: context.requestSha256,
    ...base, objects: input.objects,
  });
  await context.timed('cleanup', () => session.close());
  context.session = undefined;
  context.running.throwIfAborted();
  const delivery = join(context.run, 'delivery');
  await rename(context.temp, delivery);
  return await deliveryResult(context, delivery);
}

/** A late journal error cannot revoke the committed delivery. */
async function deliveryResult(context: BuildContext,
  delivery: string): Promise<DeliveryResult> {
  const warnings: string[] = [];
  try {
    await saveRun(context, 'delivered');
  } catch (error) {
    warnings.push(
      'Delivery committed; run.json update failed: ' + String(error));
  }
  return { delivery, file: join(delivery, 'result.ggb'),
    report: join(delivery, 'verification.json'),
    ...(warnings.length ? { warnings } : {}) };
}

/** Writes the edit delivery, including the base copy and the diff evidence. */
async function commitEdit(
  context: BuildContext,
  input: {
    archive: { bytes: Buffer }; summary: GgbSummary; bytes: Buffer;
    gates: Awaited<ReturnType<typeof editGates>>;
    reload: Verification; page: Page;
  },
): Promise<DeliveryResult> {
  const { request } = context;
  const base = request.base!;
  const zoomResult = await zoomEvidence(context, input.page);
  const allowed = [...editFields(context.compiled.edits)].map(key => {
    const [object, field] = key.split('\u0000');
    return { object, field };
  });
  await save(join(context.temp, 'diff.json'), {
    baseSha256: base.sha256, allowed, changes: input.gates.differences,
  });
  const report = {
    milestone: 'M6', requestSha256: context.requestSha256,
    edit: {
      base: {
        sha256: base.sha256, bytes: input.archive.bytes.length,
        view: input.summary.view,
      },
      allowed, baseline: input.gates.baseline,
      effects: input.gates.effects, changes: input.gates.differences,
    },
    construction: input.gates.verification,
    reload: input.reload,
    interaction: { status: 'passed', samples: [], zoom: zoomResult },
  };
  return await finishDelivery(context, {
    bytes: input.bytes, archive: input.archive, report,
    objects: input.gates.verification.objects, page: input.page,
  });
}

/** Writes the modify delivery, including the base copy and the diff evidence. */
async function commitModify(
  context: BuildContext,
  input: {
    archive: { bytes: Buffer }; summary: GgbSummary; bytes: Buffer;
    gates: Awaited<ReturnType<typeof modifyGates>>;
    reload: Verification; page: Page;
  },
): Promise<DeliveryResult> {
  const { request } = context;
  const base = request.base!;
  const compiled = context.compiled;
  const zoomResult = await zoomEvidence(context, input.page);
  const allowed = [
    ...editFields(compiled.styles), ...updateFields(compiled.updates),
  ].map(key => {
    const [object, field] = key.split('\u0000');
    return { object, field };
  });
  const added = compiled.program.flatMap(step => step.outputs);
  await save(join(context.temp, 'diff.json'), {
    mode: 'modify', baseSha256: base.sha256, allowed, added,
    changes: input.gates.differences,
  });
  const report = {
    milestone: 'M6', requestSha256: context.requestSha256,
    modify: {
      base: {
        sha256: base.sha256, bytes: input.archive.bytes.length,
        view: input.summary.view,
      },
      allowed, added, baseline: input.gates.baseline,
      updates: compiled.updates, updateEffects: input.gates.updateEffects,
      styles: compiled.styles, styleEffects: input.gates.styleEffects,
      changes: input.gates.differences,
    },
    construction: input.gates.verification,
    reload: input.reload,
    interaction: { status: 'passed', samples: [], zoom: zoomResult },
  };
  return await finishDelivery(context, {
    bytes: input.bytes, archive: input.archive, report,
    objects: input.gates.verification.objects, page: input.page,
  });
}

async function commitDelivery(
  context: BuildContext, original: Page,
  artifact: Awaited<ReturnType<typeof reload>>,
  construction: Verification, bytes: Buffer, samples: SampleEvidence[],
): Promise<DeliveryResult> {
  const session = context.session;
  assert(session);
  const zoomResult = await zoomEvidence(context, artifact.reloaded);
  compareSnapshots(await snapshot(original), construction.objects);
  const guaranteed = tautologies(context.request.plan.program,
    context.request.plan.requirements);
  const report = {
    milestone: 'M6', requestSha256: context.requestSha256,
    construction, reload: artifact.reload,
    interaction: { status: 'passed', samples, zoom: zoomResult },
    ...(guaranteed.length ? { tautology: guaranteed } : {}),
  };
  return await finishDelivery(context, {
    bytes, objects: construction.objects, page: original, report,
  });
}

async function saveRun(
  context: BuildContext, state: 'delivered' | 'failed', error?: ToolError,
): Promise<void> {
  await save(join(context.run, 'run.json'), {
    state, requestSha256: context.requestSha256,
    ...(state === 'delivered' ? { delivery: 'delivery' } : {}),
    totalMs: performance.now() - context.started,
    timings: context.timings, observationTimings: context.observationTimings,
    ...(error ? { error: {
      code: error.code, message: error.message, details: error.details,
    }, diagnostics: context.diagnostics } : {}),
  });
}

async function failBuild(
  context: BuildContext, error: unknown,
): Promise<never> {
  const failure = toolError(error, context.stage, context.running);
  const session = context.session;
  try {
    if (session) await context.timed('cleanup', () => session.close());
  } catch (cleanup) {
    context.diagnostics.push('Cleanup failed: ' + String(cleanup));
  }
  failure.details = {
    run: context.run || undefined, stage: context.stage,
    cause: failure.details, diagnostics: context.diagnostics,
  };
  try {
    if (context.run) await saveRun(context, 'failed', failure);
  } catch (write) {
    context.diagnostics.push('Cannot save run.json: ' + String(write));
  }
  throw failure;
}

/** Builds from an empty canvas; verifies and closes resources before commit. */
async function buildCreate(context: BuildContext): Promise<DeliveryResult> {
  const initial = await construct(context);
  const artifact = await reload(context, initial.construction);
  const samples = await sampleInteractions(
    context, artifact, initial.construction);
  return await commitDelivery(context, initial.original, artifact,
    initial.construction, initial.bytes, samples);
}

/** Dispatches creation and edit requests; both own their own gates. */
export async function build(
  input: unknown, signal?: AbortSignal,
): Promise<DeliveryResult> {
  const context = buildContext(input, signal);
  try {
    if (!context.request.base) return await buildCreate(context);
    return await buildBase(context);
  } catch (error) {
    return await failBuild(context, error);
  }
}

function validatePhase(request: Request, input: any, phase: 'initial' | 'sampled') {
  assert(input?.status === 'passed' && Array.isArray(input.objects) && input.objects.length > 0, 'Missing or failed verification evidence');
  const actual = verify(request, input.objects as Snapshot, phase, input.observations); requirePassed(actual);
  assert(equivalent(actual.results, input.results), 'Verification results do not match their observations');
}

/** Re-derives completion from evidence, both at commit and preview. */
function validateDeliveryEvidence(request: Request,
  report: DeliveryEvidence, objects: Snapshot): void {
  validatePhase(request, report.construction, 'initial');
  validatePhase(request, report.reload, 'initial');
  compareSnapshots(report.construction.objects, objects);
  compareSnapshots(report.reload.objects, objects);
  assert(report.interaction?.status === 'passed'
    && Array.isArray(report.interaction.samples),
  'Missing or failed interaction evidence');
  assert.equal(report.interaction.samples.length,
    request.plan.interactions.length, 'Incomplete interaction coverage');
  validateSamples(request, report.interaction.samples, report.reload.objects);
  const z = report.interaction.zoom;
  if (request.plan.display === 'algebra') {
    assert(z?.method === 'not_applicable' && 'reason' in z
      && z.reason === 'algebra-only view', 'Invalid algebra view evidence');
  } else {
    assert(z?.method === 'button' && 'before' in z && 'after' in z
      && Number.isFinite(z.before) && Number.isFinite(z.after)
      && z.before > 0 && z.after > 0 && z.before !== z.after,
    'Missing zoom evidence');
  }
}

/** Replays interaction decisions from stored facts before loading the file. */
function validateSamples(
  request: Request, samples: SampleEvidence[], original: Snapshot,
): void {
  for (const [index, sample] of samples.entries()) {
    const expected = request.plan.interactions[index];
    assert(expected);
    const { before: _, after: __, roundTrip, method, ...input } = sample;
    assert(equivalent(input, expected), 'Interaction sample changed');
    compareSnapshots(sample.before, original);
    validatePhase(request, sample.after, 'sampled');
    const id = 'point' in expected ? expected.point : expected.parameter;
    const before = sample.before.find(fact => fact.name === id);
    const after = sample.after.objects.find(fact => fact.name === id);
    assert(before && after, 'Missing interaction facts');
    if ('point' in expected) {
      assert(typeof after.x === 'number' && typeof before.x === 'number' &&
        typeof after.y === 'number' && typeof before.y === 'number');
      assert(method === 'mouse' && Math.hypot(after.x - before.x,
        after.y - before.y) > 1e-8, 'No observed drag movement');
    } else {
      assert(method === 'native_value' && before.type === 'numeric' &&
        before.independent && before.moveable && before.slider &&
        after.value !== null && before.value !== null &&
        Math.abs(after.value - before.value) > 1e-8 &&
        equivalent(after.value, expected.value) &&
        expected.value >= before.slider.min &&
        expected.value <= before.slider.max, 'Invalid parameter evidence');
    }
  }
  validateRoundTrips(request, samples);
}

/** Parameter reports must retain both forward and restored-state evidence. */
function validateRoundTrips(request: Request, samples: SampleEvidence[]): void {
  for (const [index, sample] of samples.entries()) {
    const input = request.plan.interactions[index];
    if (!input || !('parameter' in input)) {
      assert(!sample.roundTrip, 'Unexpected round-trip evidence');
      continue;
    }
    const before = sample.before.find(fact => fact.name === input.parameter);
    assert(before && sample.roundTrip, 'Missing parameter round-trip evidence; rebuild');
    assert(equivalent(sample.roundTrip.value, before.value),
      'Parameter restore value changed');
    validatePhase(request, sample.roundTrip.after, 'initial');
    compareSnapshots(sample.roundTrip.after.objects, sample.before);
  }
}

export async function openPreview(deliveryDir: string, headed = true, signal?: AbortSignal) {
  try { return await preview(deliveryDir, headed, signal); }
  catch (error) { throw toolError(error, 'preview_failed', signal); }
}

/** Opens a verified file in the default browser using the request locale. */
export async function openDefaultPreview(
  deliveryDir: string, signal?: AbortSignal,
): Promise<Awaited<ReturnType<typeof openPreview>> & {
  closed: Promise<void>;
}> {
  const session = await openPreview(deliveryDir, false, signal);
  try {
    // Publish only after the normal file, report and real reload gates passed.
    const material = session.publishPreview({
      base64: session.bytes.toString('base64'),
      prompt: session.request.prompt,
      display: session.request.plan.display ?? 'graphics',
      locale: session.request.locale,
    });
    const waiting = AbortSignal.any([
      AbortSignal.timeout(limits.operationMs), ...(signal ? [signal] : []),
    ]);
    await openDefaultBrowser(material.url, waiting);
    await new Promise<void>((done, reject) => {
      const abort = () => reject(waiting.reason);
      waiting.addEventListener('abort', abort, { once: true });
      material.loaded.then(done).finally(() => {
        waiting.removeEventListener('abort', abort);
      });
      if (waiting.aborted) abort();
    });
    return { ...session, url: material.url, closed: material.closed };
  } catch (error) {
    const failure = toolError(error, 'preview_failed', signal);
    try { await session.close(); }
    catch (cleanup) {
      failure.details = {
        cause: failure.details, cleanup: String(cleanup),
      };
    }
    throw failure;
  }
}

/** Re-derives the base-to-result differences from the embedded base copy. */
async function recheckEdits(
  request: Request, report: any, base: any, delivery: string,
  session: Engine, objects: Snapshot,
): Promise<void> {
  assert(base?.file === 'base.ggb' && /^[a-f0-9]{64}$/.test(base.sha256),
    'Missing base evidence');
  const bytes = await readFile(join(delivery, base.file));
  assert.equal(sha256(bytes), base.sha256, 'Base checksum mismatch');
  assert.equal(report.edit?.base?.sha256, base.sha256,
    'Base evidence changed');
  const page = await session.page();
  try {
    await loadGgb(page, bytes.toString('base64'), request.prompt,
      request.plan.display);
    const baseline = await snapshot(page);
    compareSnapshots(baseline, report.edit.baseline);
    const differences = snapshotDifferences(objects, baseline);
    assert(equivalent(differences, report.edit.changes),
      'Recorded edit diff does not match the files');
    const violations = diffViolations(request.plan.edits ?? [], differences,
      editLinks(objects));
    assert.equal(violations.length, 0,
      `Undeclared changes: ${JSON.stringify(violations)}`);
  } finally {
    await page.close();
  }
}

/** One declared style field as observed on a final object. */
function styleFieldMatches(fact: any, field: string,
  requested: unknown): boolean {
  const actual = fact[field];
  if (field === 'color') {
    return typeof actual === 'string'
      && actual.toUpperCase() === String(requested).toUpperCase();
  }
  if (field === 'filling') {
    return typeof actual === 'number'
      && Math.abs(actual - Number(requested)) <= 1e-8;
  }
  if (field === 'caption') return actual === requested && fact.labelStyle === 3;
  return actual === requested;
}

/** Every declared style and update must survive into the final figure. */
function verifyDeclaredChanges(
  compiled: ReturnType<typeof compile>, objects: Snapshot,
) {
  const facts = new Map(objects.map(fact => [fact.name, fact]));
  for (const style of compiled.styles) {
    const fact = facts.get(style.object);
    assert(fact, `Missing style target: ${style.object}`);
    for (const [field, value] of Object.entries(style.properties)) {
      assert(styleFieldMatches(fact, field, value),
        `Style not retained: ${style.object}.${field}`);
    }
  }
  for (const update of compiled.updates) {
    const fact = facts.get(update.object);
    assert(fact, `Missing update target: ${update.object}`);
    if (update.value !== undefined) {
      assert(valueMatches(fact.value, update.value),
        `Value not retained: ${update.object}`);
    }
    if (update.coords !== undefined) {
      assert(valueMatches(fact.x, update.coords[0])
        && valueMatches(fact.y, update.coords[1]),
      `Coordinates not retained: ${update.object}`);
    }
  }
}

/** Re-derives a modify diff and its preservation gate from the base copy. */
async function recheckModify(
  request: Request, compiled: ReturnType<typeof compile>, report: any,
  base: any, delivery: string, session: Engine, objects: Snapshot,
): Promise<void> {
  assert(base?.file === 'base.ggb' && /^[a-f0-9]{64}$/.test(base.sha256),
    'Missing base evidence');
  const bytes = await readFile(join(delivery, base.file));
  assert.equal(sha256(bytes), base.sha256, 'Base checksum mismatch');
  assert.equal(report.modify?.base?.sha256, base.sha256,
    'Base evidence changed');
  const page = await session.page();
  try {
    await loadGgb(page, bytes.toString('base64'), request.prompt,
      request.plan.display);
    const baseline = await snapshot(page);
    compareSnapshots(baseline, report.modify.baseline);
    const differences = snapshotDifferences(objects, baseline);
    assert(equivalent(differences, report.modify.changes),
      'Recorded modify diff does not match the files');
    const baseLabels = new Set(baseline.map(fact => fact.name));
    const declared = new Set(compiled.program.flatMap(step => step.outputs));
    const violations = modifyViolations({
      styles: compiled.styles, updates: compiled.updates, differences,
      links: editLinks(objects), declared, baseLabels,
    });
    assert.equal(violations.length, 0,
      `Undeclared changes: ${JSON.stringify(violations)}`);
    verifyDeclaredChanges(compiled, objects);
  } finally {
    await page.close();
  }
}

async function preview(deliveryDir: string, headed: boolean, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const delivery = resolve(deliveryDir);
  const manifest = await readJson(join(delivery, 'manifest.json'), 2 * 1024 * 1024) as any;
  assert(manifest?.protocolVersion === 2 && manifest.milestone === 'M6' && manifest.file === 'result.ggb', 'Unsupported delivery format; regenerate with build');
  assert.match(manifest.sha256, /^[a-f0-9]{64}$/); assert.match(manifest.requestSha256, /^[a-f0-9]{64}$/);
  const request = parseRequest(await readJson(join(delivery, 'request.json')));
  assert.equal(sha256(await readFile(join(delivery, 'request.json'))), manifest.requestSha256, 'Request checksum mismatch');
  const picture = await stat(join(delivery, 'preview.png'));
  assert(picture.isFile() && picture.size > 0 && picture.size <= limits.ggbBytes, 'preview.png must be a bounded nonempty file');
  const report = await readJson(join(delivery, 'verification.json'), limits.reportBytes) as any;
  const baseline = report?.modify?.baseline ?? report?.edit?.baseline;
  const compiled = compile(request,
    request.base && Array.isArray(baseline) ? snapshotFacts(baseline) : undefined);
  assert.equal(report?.milestone, 'M6'); assert.equal(report.requestSha256, manifest.requestSha256);
  validateDeliveryEvidence(request, report, manifest.objects);
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
    if (request.base && compiled.mode === 'modify') {
      await recheckModify(request, compiled, report, manifest.base, delivery,
        session, actual.objects);
    } else if (request.base) {
      await recheckEdits(request, report, manifest.base, delivery, session,
        actual.objects);
    } else assert(!manifest.base, 'Unexpected base evidence');
    return { ...session, page, delivery, request, bytes };
  } catch (error) {
    const failure = toolError(error, 'preview_failed', signal);
    try { await session.close(); }
    catch (cleanup) { failure.details = { cause: failure.details, cleanup: String(cleanup) }; }
    throw failure;
  }
}
