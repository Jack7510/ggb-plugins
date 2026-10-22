/** @fileoverview Pure, shared delivery gates; never starts a browser. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import type {Snapshot} from './browser.js';
import type {Request} from './schema.js';
import {ToolError, parseRequest} from './schema.js';
import {requireSampleCoverage} from './facts.js';
import {compareSnapshots, equivalent, verify, type Verification}
  from './verify.js';
type Interaction = Request['plan']['interactions'][number];
function requirePassed(result: Verification): void {
  if (result.status !== 'passed') {
    throw new ToolError('verification_unverified',
      'Required checks did not pass');
  }
}
export type SampleEvidence = Interaction & {
  method: 'mouse' | 'native_value';
  before: Snapshot;
  after: Verification;
  roundTrip?: { value: number; after: Verification };
};

export interface DeliveryEvidence {
  construction: Verification;
  reload: Verification;
  interaction: {
    status: string;
    samples: SampleEvidence[];
    zoom: { method: string; reason: string } |
      { method: string; before: number; after: number };
  };
}

function validatePhase(request: Request, input: Verification,
  phase: 'initial' | 'sampled'): void {
  assert(input?.status === 'passed' && Array.isArray(input.objects) &&
    input.objects.length > 0, 'Missing or failed verification evidence');
  const actual = verify(request, input.objects, phase, input.observations);
  requirePassed(actual);
  assert(equivalent(actual.results, input.results),
    'Verification results do not match their observations');
}

/** Re-derives completion from evidence, both at commit and preview. */
export function validateDeliveryEvidence(request: Request,
  report: DeliveryEvidence, objects: Snapshot): void {
  requireSampleCoverage(request, report.construction.objects);
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
    assert(before && sample.roundTrip,
      'Missing parameter round-trip evidence; rebuild');
    assert(equivalent(sample.roundTrip.value, before.value),
      'Parameter restore value changed');
    validatePhase(request, sample.roundTrip.after, 'initial');
    compareSnapshots(sample.roundTrip.after.objects, sample.before);
  }
}


/** Consume the same stored evidence gates as build and preview. */
export function validateHostDelivery(input: unknown, report: unknown,
  manifest: unknown): void {
  const request = parseRequest(input);
  // These assertions are followed by the original complete evidence checks.
  const m = manifest as {protocolVersion?: unknown; milestone?: unknown;
    requestSha256?: unknown; objects?: unknown};
  const v = report as DeliveryEvidence & {milestone?: unknown;
    requestSha256?: unknown};
  assert(m?.protocolVersion === 2 && m.milestone === 'M6');
  assert(v?.milestone === 'M6' && v.requestSha256 === m.requestSha256);
  assert(Array.isArray(m.objects));
  const requestDigest = createHash('sha256')
    .update(JSON.stringify(request, null, 2) + '\n').digest('hex');
  assert.equal(m.requestSha256, requestDigest, 'Request evidence changed');
  validateDeliveryEvidence(request, v, m.objects as Snapshot);
}


/** Validate manifest-owned material facts against host-measured bytes.
 * @param manifest Stored plugin manifest, treated as untrusted input.
 */
export function validateHostMaterial(manifest: unknown, facts: {
  file: string; runtimeVersion: string; sha256: string;
}): void {
  const value = manifest as {file?: unknown; runtimeVersion?: unknown;
    sha256?: unknown};
  assert.equal(value.file, facts.file, 'Manifest file mismatch');
  assert.equal(value.runtimeVersion, facts.runtimeVersion,
    'Runtime version mismatch');
  assert.equal(value.sha256, facts.sha256, 'Artifact digest mismatch');
}

/** Bounded display facts; the complete report remains a separate artifact. */
export function summarizeHostVerification(input: unknown): object {
  // Called after validateHostDelivery has checked all evidence phases.
  const report = input as DeliveryEvidence;
  const phase = (input: unknown) => {
    const value = input as {status: string; results: {status: string}[]};
    const results = value.results;
    return {status: value.status, results: results.length,
      passed: results.filter(item => item.status === 'passed').length,
      failed: results.filter(item => item.status === 'failed').length,
      unverified: results.filter(item => item.status === 'unverified').length};
  };
  const interaction = report.interaction;
  return {construction: phase(report.construction),
    reload: phase(report.reload),
    interaction: {status: interaction.status,
      samples: interaction.samples.length}};
}
