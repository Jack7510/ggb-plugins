/** @fileoverview Verifies generic native siblings through real GGB delivery. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {build, openPreview, sha256} from '../src/delivery.js';
import {parseRequest, type Request} from '../src/schema.js';
import {validateHostDelivery, type DeliveryEvidence}
  from '../src/delivery-contract.js';
import type {Snapshot} from '../src/browser.js';

interface Fixture {
  root: string; request: Request; saved: Request;
  result: Awaited<ReturnType<typeof build>>;
  report: DeliveryEvidence; manifest: {objects: Snapshot}; outputs: string[];
}

function triangle(outputDir: string): Request {
  return parseRequest({protocolVersion: 2,
    prompt: 'Construct triangle ABC and drag A', locale: 'en', outputDir,
    plan: {
      program: [
        {id: 'A', op: 'native', mode: 'algebra', source: 'A=(0,0)'},
        {id: 'B', op: 'native', mode: 'algebra', source: 'B=(4,0)'},
        {id: 'C', op: 'native', mode: 'algebra', source: 'C=(1,3)'},
        {id: 't', op: 'native', mode: 'algebra', source: 't=Polygon(A,B,C)'},
      ], requirements: [{id: 'triangle',
        source: 'Construct triangle ABC and drag A', checks: [
          {kind: 'type', subjects: ['t'], objectType: 'polygon',
            scope: 'sampled'},
          {kind: 'dependsOn', subjects: ['t', 'A', 'B', 'C'],
            scope: 'sampled'},
        ]}],
      interactions: [{point: 'A', dx: 40, dy: 20}],
      view: {xMin: -2, xMax: 6, yMin: -2, yMax: 5},
    }});
}

async function prepare(root: string): Promise<Fixture> {
  const request = triangle(join(root, 'auto'));
  const original = JSON.stringify(request);
  const result = await build(request);
  const report = JSON.parse(await readFile(result.report, 'utf8')) as
    DeliveryEvidence;
  const manifest = JSON.parse(await readFile(
    join(result.delivery, 'manifest.json'), 'utf8')) as {objects: Snapshot};
  const saved = parseRequest(JSON.parse(await readFile(
    join(result.delivery, 'request.json'), 'utf8')));
  const primary = manifest.objects.find(o => o.name === 't');
  assert(primary?.nativeOutputs);
  const outputs = primary.nativeOutputs;
  assert.equal(outputs.length, 4);
  assert(outputs.includes('t'));
  assert.equal(JSON.stringify(request), original);
  const step = saved.plan.program[3]!;
  assert(step.op === 'native');
  assert.equal(step.outputs, undefined);
  for (const phase of [report.construction, report.reload,
    report.interaction.samples[0]!.after]) {
    assert.equal(phase.status, 'passed');
    const program = phase.results.find(r => r.requirementId === '$program:t');
    assert.deepEqual(program?.subjects, outputs);
  }
  assert.equal(report.interaction.status, 'passed');
  validateHostDelivery(saved, report, manifest);
  const preview = await openPreview(result.delivery, false);
  await preview.close();
  return {root, request, result, report, manifest, saved, outputs};
}

async function explicit(f: Fixture, complete: boolean): Promise<void> {
  const input = triangle(join(f.root, complete ? 'explicit' : 'strict'));
  const step = input.plan.program[3]!;
  assert(step.op === 'native');
  step.outputs = complete ? f.outputs : ['t'];
  if (!complete) {
    await assert.rejects(build(input), /Incomplete native outputs/u);
    return;
  }
  const result = await build(input);
  const saved = JSON.parse(await readFile(
    join(result.delivery, 'request.json'), 'utf8'));
  assert.deepEqual(saved.plan.program[3].outputs, f.outputs);
}

async function collision(f: Fixture): Promise<void> {
  const input = triangle(join(f.root, 'collision'));
  const name = f.outputs.find(name => name !== 't')!;
  input.plan.program.push({id: name, op: 'native', mode: 'algebra',
    source: name + '=2'});
  await assert.rejects(build(input), /output name collision/u);
}

async function tamper(f: Fixture): Promise<void> {
  const changed = structuredClone(f.report);
  const sibling = changed.reload.objects.find(o => o.name === f.outputs[1]);
  assert(sibling);
  delete sibling.nativeOutputs;
  assert.throws(() => validateHostDelivery(f.saved, changed, f.manifest));
  const path = join(f.result.delivery, 'verification.json');
  const bytes = await readFile(path);
  try {
    await writeFile(path, JSON.stringify(changed));
    await assert.rejects(openPreview(f.result.delivery, false));
  } finally {await writeFile(path, bytes);}
}

async function modify(f: Fixture): Promise<void> {
  const bytes = await readFile(f.result.file);
  const input = parseRequest({protocolVersion: 2, prompt: 'Add triangle u',
    locale: 'en', outputDir: join(f.root, 'modify'),
    base: {path: f.result.file, sha256: sha256(bytes)}, plan: {
      program: [{id: 'u', op: 'native', mode: 'algebra',
        source: 'u=Polygon(A,B,C)'}],
      requirements: [{id: 'added', source: 'Add triangle u', checks: [
        {kind: 'type', subjects: ['u'], objectType: 'polygon',
          scope: 'initial'},
        {kind: 'dependsOn', subjects: ['u','A','B','C'],
          scope: 'initial'}]}], interactions: [],
    }});
  const result = await build(input);
  const diff = JSON.parse(await readFile(
    join(result.delivery, 'diff.json'), 'utf8'));
  assert.equal(diff.added.length, 4);
  assert(diff.added.includes('u'));
  const preview = await openPreview(result.delivery, false);
  await preview.close();
}

test('implicit native outputs survive full delivery, reload and modification',
  {timeout: 120_000}, async t => {
  const root = await mkdtemp(join(tmpdir(), 'native-output-real-'));
  try {
    const f = await prepare(root);
    await t.test('explicit complete labels succeed',
      () => explicit(f, true));
    await t.test('an explicit primary-only declaration still fails',
      () => explicit(f, false));
    await t.test('automatic edges cannot occupy a future step name',
      () => collision(f));
    await t.test('stored sibling ownership cannot be removed or changed',
      () => tamper(f));
    await t.test('new siblings enter modify preservation and diff evidence',
      () => modify(f));
  } finally {await rm(root, {recursive: true, force: true});}
});

test('non-Polygon multi-output commands keep exact principal identities',
  {timeout: 60_000}, async () => {
  const root = await mkdtemp(join(tmpdir(), 'native-focus-output-'));
  try {
    const input = parseRequest({protocolVersion: 2, prompt: 'Focus of ellipse',
      locale: 'en', outputDir: root, plan: {
        program: [
          {id: 'ell', op: 'native', mode: 'algebra',
            source: 'ell: x^2/9+y^2/5=1'},
          {id: 'F_{1}', op: 'native', mode: 'algebra',
            source: 'F_{1}=Focus(ell)'}],
        requirements: [{id: 'focus', source: 'Focus of ellipse', checks: [
          {kind: 'type', subjects: ['F_{1}'], objectType: 'point',
            scope: 'initial'},
          {kind: 'dependsOn', subjects: ['F_{1}','ell'], scope: 'initial'},
        ]}], interactions: [],
      }});
    const result = await build(input);
    const manifest = JSON.parse(await readFile(
      join(result.delivery, 'manifest.json'), 'utf8'));
    assert.deepEqual(manifest.objects.find(
      (o: {name: string}) => o.name === 'F_{1}').nativeOutputs,
    ['F_{1}', 'F_{2}']);
    const bad = structuredClone(input);
    bad.outputDir = join(root, 'missing-principal');
    const step = bad.plan.program[1]!;
    assert(step.op === 'native');
    step.id = 'F'; step.source = 'F=Focus(ell)';
    bad.plan.requirements[0]!.checks = [
      {kind: 'exists', subjects: ['F'], scope: 'initial'}];
    await assert.rejects(build(bad), /output undefined/u);
  } finally {await rm(root, {recursive: true, force: true});}
});
