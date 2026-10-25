/** @fileoverview Tests native output ownership and unchanged request contracts. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {resolveProgramOutputs, programOutputNames, requireStableOutputs}
  from '../src/native-outputs.js';
import {parseRequest} from '../src/schema.js';
import {compile} from '../src/compile.js';
import {digestJson} from '../src/host-protocol.js';

interface Fact {
  name: string; defined: boolean; independent: boolean;
  nativeDefinition?: {name: string; args: string[]};
  nativeOutputs?: string[];
}

function fixture(outputs?: string[]) {
  const request = parseRequest({protocolVersion: 2, prompt: 'Native relation',
    locale: 'en', outputDir: '/tmp/native-output-unit', plan: {
      program: [{id: 'A', op: 'native', mode: 'algebra', source: 'A=(0,0)'},
        {id: 'U', op: 'native', mode: 'algebra', source: 'U=FutureMath(A)',
          ...(outputs ? {outputs} : {})}],
      requirements: [{id: 'relation', source: 'Native relation', checks: [
        {kind: 'exists', subjects: ['U'], scope: 'initial'}]}],
      interactions: [],
    }});
  const nativeDefinition = {name: 'FutureMath', args: ['A']};
  const objects: Fact[] = [
    {name: 'A', defined: true, independent: true},
    ...['U', 'V'].map(name => ({name, defined: true, independent: false,
      nativeDefinition, nativeOutputs: ['U', 'V']})),
  ];
  return {request, objects};
}

test('omitted outputs discover generic siblings without changing request bytes',
  () => {
  const {request, objects} = fixture();
  const before = digestJson(request);
  assert.deepEqual(resolveProgramOutputs(request.plan.program, objects)
    .get('U'), ['U', 'V']);
  assert.deepEqual([...programOutputNames(request.plan.program, objects)],
    ['A', 'U', 'V']);
  assert.equal(digestJson(request), before);
  assert.equal('outputs' in request.plan.program[1]!, false);
});

test('explicit outputs are exact, including when only the primary is declared',
  () => {
  const partial = fixture(['U']);
  assert.throws(() => resolveProgramOutputs(partial.request.plan.program,
    partial.objects), /Incomplete native outputs/u);
  const complete = fixture(['U', 'V']);
  assert.deepEqual(resolveProgramOutputs(complete.request.plan.program,
    complete.objects).get('U'), ['U', 'V']);
});

for (const name of ['x', 'Circle', 'GgbProbeExtra', 'bad-name']) {
  test('automatic outputs keep naming protection: ' + name, () => {
    const {request, objects} = fixture();
    for (const fact of objects) {
      if ('nativeOutputs' in fact) fact.nativeOutputs = ['U', name];
    }
    objects[2]!.name = name;
    assert.throws(() => resolveProgramOutputs(request.plan.program, objects),
      /Reserved|Protected|Invalid object identifier/u);
  });
}

for (const fault of ['missing', 'undefined', 'independent', 'unknown-owner',
  'different-owner', 'different-group', 'future-collision', 'base-collision',
  'too-many', 'missing-principal', 'empty-group'] as const) {
  test('automatic outputs reject ' + fault, () => {
    const {request, objects} = fixture();
    const extra = objects[2]!;
    const baseline = new Set<string>();
    if (fault === 'missing') objects.pop();
    if (fault === 'undefined') extra.defined = false;
    if (fault === 'independent') extra.independent = true;
    if ('nativeDefinition' in extra) {
      if (fault === 'unknown-owner') delete extra.nativeDefinition;
      if (fault === 'different-owner') {
        extra.nativeDefinition = {name: 'OtherMath', args: ['A']};
      }
      if (fault === 'different-group') extra.nativeOutputs = ['V'];
    }
    if (fault === 'future-collision') {
      request.plan.program.push({id: 'V', op: 'native', mode: 'algebra',
        source: 'V=(1,2)'});
    }
    if (fault === 'base-collision') baseline.add('V');
    if (fault === 'missing-principal') objects[1]!.nativeOutputs = ['V'];
    if (fault === 'empty-group') objects[1]!.nativeOutputs = [];
    if (fault === 'too-many' && 'nativeOutputs' in objects[1]!) {
      objects[1]!.nativeOutputs = ['U',
        ...Array.from({length: 16}, (_, i) => 'X' + i)];
    }
    assert.throws(() => resolveProgramOutputs(request.plan.program, objects,
      baseline), /output|ownership/u);
  });
}

test('automatic names cannot become undeclared program references', () => {
  const {request} = fixture();
  request.plan.program.push({id: 'q', op: 'native', mode: 'algebra',
    source: 'q=Segment(V,A)'});
  assert.throws(() => compile(request), /undefined object V/u);
  const step = request.plan.program[1]!;
  assert(step.op === 'native');
  step.outputs = ['U', 'V'];
  assert.doesNotThrow(() => compile(request));
});

test('reload and samples cannot exchange a sibling for a new object', () => {
  const {request, objects} = fixture();
  const after = structuredClone(objects);
  after[2]!.name = 'W';
  for (const fact of after) {
    if ('nativeOutputs' in fact) fact.nativeOutputs = ['U', 'W'];
  }
  assert.throws(() => requireStableOutputs(request.plan.program,
    objects, after), /output group changed/u);
  assert.doesNotThrow(() => requireStableOutputs(request.plan.program,
    objects, structuredClone(objects)));
});
