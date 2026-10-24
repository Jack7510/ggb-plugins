/** @fileoverview Offline replay of type, style and hidden numeric labels. */
import assert from 'node:assert/strict';
import test from 'node:test';
import type {Snapshot} from '../src/browser.js';
import type {Request, Check} from '../src/schema.js';
import {verify, compareSnapshots} from '../src/verify.js';
import {validateDeliveryEvidence} from '../src/delivery-contract.js';

function fact(name = 'n'): Snapshot[number] {
  return {name, type: 'numeric', nativeType: 'numeric', value: 4,
    defined: true, independent: false, moveable: false, fixed: false,
    command: '', nativeDefinition: null, expression: '4',
    referenceState: 'direct', inputs: [], valueString: 'n = 4',
    x: null, y: null, line: null, circle: null, conic: null, data: null,
    color: '#000000', visible: false, labelVisible: false, labelStyle: 2,
    lineThickness: 2, lineStyle: 0, filling: 0, caption: '', slider: null};
}
function request(check: Check): Request {
  return {protocolVersion: 2, prompt: 'original', locale: 'en',
    outputDir: '/tmp/unused', plan: {program: [{id: 'n', op: 'native',
      mode: 'algebra', source: 'n=4'}], requirements: [{id: 'r',
      source: 'original', checks: [check]}], interactions: []}};
}

test('type summaries preserve expected, observed and unknown states', () => {
  const input = request({kind: 'type', subjects: ['n'], objectType: 'conic',
    scope: 'initial'});
  const observed = {...fact(), type: 'ellipse', nativeType: 'ellipse'};
  const result = verify(input, [observed], 'initial').results.at(-1)!;
  assert.equal(result.status, 'failed');
  assert.partialDeepStrictEqual(result.evidence, {
    expected: {objectType: 'conic'},
    actual: {objectType: 'ellipse', defined: true}});
  assert.match((result.evidence as {message: string}).message,
    /objectType expected "conic"; actual "ellipse"/);
  const unknown = verify(input, [], 'initial').results.at(-1)!;
  assert.equal(unknown.status, 'unverified');
  assert.partialDeepStrictEqual(unknown.evidence, {actual: {defined: null}});
  input.plan.requirements[0]!.checks[0]!.objectType = 'ellipse';
  assert.equal(verify(input, [observed], 'initial').results.at(-1)!.status,
    'passed');
});

test('hidden numeric label requirements still fail after reload', () => {
  const input = request({kind: 'style', subjects: ['n'], scope: 'initial',
    properties: {visible: false, labelVisible: false}});
  input.plan.styles = [{object: 'n', properties: {
    visible: false, labelVisible: false}}];
  const before = [fact()];
  // Observed boundary: value/visibility survive, label flag changes.
  const after = [{...fact(), labelVisible: true}];
  const construction = verify(input, before, 'initial');
  const reload = verify(input, after, 'initial');
  assert.equal(construction.status, 'passed');
  assert.doesNotThrow(() => compareSnapshots(before, after));
  assert.equal(reload.status, 'failed');
  for (const method of ['style', 'presentation']) {
    const result = reload.results.find(r => r.method === method)!;
    assert.equal(result.status, 'failed');
    assert.partialDeepStrictEqual(result.evidence, {
      expected: {visible: false, labelVisible: false},
      actual: {visible: false, labelVisible: true, defined: true},
    });
    assert.match((result.evidence as {message: string}).message,
      /labelVisible expected false; actual true; visible=false/);
  }
  assert.throws(() => validateDeliveryEvidence(input, {construction, reload,
    interaction: {status: 'not_sampled', samples: [],
      zoom: {method: 'button', before: 1, after: 2}}}, after));
  input.plan.styles = [{object: 'n', properties: {visible: false}}];
  input.plan.requirements[0]!.checks[0]!.properties = {visible: false};
  assert.equal(verify(input, after, 'initial').status, 'passed');
});

test('numeric helpers cannot replace mathematical defining roots', () => {
  const input = request({kind: 'dependsOn', subjects: ['F', 'C'],
    scope: 'sampled'});
  input.plan.program = [];
  const C = {...fact('C'), type: 'ellipse', independent: true};
  const cval = {...fact('cval'), independent: true};
  const F = {...fact('F'), type: 'point', x: -Math.sqrt(7), y: 0,
    inputs: ['cval'], expression: '(-cval,0)', labelVisible: true,
    labelStyle: 0};
  for (const phase of ['initial', 'sampled'] as const) {
    assert.equal(verify(input, [C, cval, F], phase).results.at(-1)!.status,
      'failed');
    const list = {...fact('L'), type: 'list', inputs: ['C']};
    assert.equal(verify(input, [C, list, {...F, inputs: ['L']}], phase)
      .results.at(-1)!.status, 'passed');
    assert.equal(verify(input, [C, {...F, inputs: ['C'],
      referenceState: 'ambiguous'}], phase).results.at(-1)!.status,
    'unverified');
  }
});


test('style feedback preserves caption and float gate semantics', () => {
  const input = request({kind: 'style', subjects: ['n'], scope: 'initial',
    properties: {color: '#abcdef', filling: 0.5, caption: 'n'}});
  const observed = {...fact(), color: '#ABCDEF', filling: 0.5 + 1e-10,
    caption: '', labelStyle: 3};
  assert.equal(verify(input, [observed], 'initial').results.at(-1)!.status,
    'passed');
  const result = verify(input, [{...observed, labelStyle: 0}], 'initial')
    .results.at(-1)!;
  assert.equal(result.status, 'failed');
  input.plan.styles = [{object: 'n', properties: {caption: 'n'}}];
  const presentation = verify(input, [{...observed, labelStyle: 0}], 'initial')
    .results.find(result => result.method === 'presentation')!;
  assert.match((presentation.evidence as {message: string}).message,
    /labelStyle expected 3; actual 0/);
  assert.match((result.evidence as {message: string}).message,
    /labelStyle expected 3; actual 0/);
  assert.doesNotMatch((result.evidence as {message: string}).message,
    /caption expected|filling expected|color expected/);
  input.plan.requirements[0]!.checks[0]!.properties = {
    caption: '自定义标签'.repeat(20), color: '#FFFFFF'};
  const failure = verify(input, [observed], 'initial').results.at(-1)!;
  assert.equal(failure.status, 'failed');
  assert.ok((failure.evidence as {message: string}).message.length <= 256);
  assert.match((failure.evidence as {message: string}).message, /caption/);
});


test('display rounding cannot hide raw residual or area-sum failures', () => {
  const input = request({kind: 'expression', subjects: ['residual'],
    expression: 'residual', mode: 'algebra', expected: 0, scope: 'sampled'});
  input.plan.program = [];
  input.plan.requirements[0]!.checks.push({kind: 'expression',
    subjects: ['areaSum'], expression: 'areaSum', mode: 'algebra',
    expected: 15, scope: 'sampled'});
  // Explicit snapshots and observations; no GeoGebra is invoked.
  const values = {residual: 4e-7, areaSum: 15 + 4e-7,
    residualDisplay: Math.round(4e-7 * 1e6) / 1e6,
    areaDisplay: Math.round((15 + 4e-7) * 1e6) / 1e6};
  assert.equal(values.residualDisplay, 0);
  assert.equal(values.areaDisplay, 15);
  const objects = Object.entries(values).map(([name, value]) =>
    ({...fact(name), value}));
  const observations = ['residual', 'areaSum'].map((expression, index) => ({
    id: `r:${index}`, expression, mode: 'algebra' as const, type: 'numeric',
    defined: true, value: values[expression as 'residual' | 'areaSum'],
    result: String(values[expression as 'residual' | 'areaSum']),
  }));
  for (const phase of ['initial', 'sampled'] as const) {
    const report = verify(input, objects, phase, observations);
    assert.equal(report.results.find(r => r.checkId === 'r:0')!.status,
      'failed');
    assert.notEqual(report.results.find(r => r.checkId === 'r:1')!.status,
      'passed');
    assert.notEqual(report.status, 'passed');
    const exact = observations.map(observation => ({...observation,
      value: observation.expression === 'residual' ? 0 : 15}));
    const exactObjects = objects.map(object => ({...object,
      value: object.name === 'residual' ? 0
        : object.name === 'areaSum' ? 15 : object.value}));
    assert.equal(verify(input, exactObjects, phase, exact).status, 'passed');
  }
});
