/**
 * @fileoverview Unit tests for construction-modification requests and gates.
 */
import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { compile, type BaseFacts } from '../src/compile.js';
import {
  modifyViolations, requireUpdateEffects, validateUpdates,
  type BaseFact,
} from '../src/modify.js';
import { parseRequest, ToolError } from '../src/schema.js';
import { root } from '../src/server.js';

const basePath = join(root, 'tests/fixtures/edit-base.ggb');
const sha = 'b'.repeat(64);
const facts: BaseFacts = {
  labels: new Set(['O', 'R', 'circ']),
  types: new Map([['O', 'point'], ['R', 'point'], ['circ', 'circle']]),
};

function modifyRequest() {
  return {
    protocolVersion: 2, prompt: '在圆上添加点 P 并连接 O', locale: 'zh-CN',
    outputDir: 'output/modify',
    base: { path: basePath, sha256: sha },
    plan: {
      program: [
        { id: 'P', op: 'native', source: 'P=Point(circ)',
          mode: 'algebra', outputs: ['P'] },
        { id: 's', op: 'native', source: 's=Segment(O,P)',
          mode: 'algebra', outputs: ['s'] },
      ],
      styles: [{ object: 's', properties: { color: '#D92B2B' } }],
      requirements: [{
        id: 'segment', source: '连接 O',
        checks: [{ kind: 'exists', subjects: ['s'], scope: 'initial' }],
      }],
      interactions: [],
    },
  };
}

const reject = (mutate: (input: any) => void) => {
  const input: any = modifyRequest();
  mutate(input);
  return assert.throws(() => parseRequest(input));
};

test('construction modifications declare native steps and controlled updates',
  () => {
    const input: any = modifyRequest();
    input.plan.updates = [{ object: 'O', coords: [1, 2] }];
    input.plan.requirements[0].checks.push({
      kind: 'coordinate', subjects: ['O'], scope: 'initial',
      coordinates: [1, 2],
    });
    const request = parseRequest(input);
    assert.equal(request.plan.program.length, 2);
    assert.deepEqual(request.plan.updates, [{ object: 'O', coords: [1, 2] }]);
    reject(value => { value.plan.edits = [{ object: 'O',
      properties: { color: '#112233' } }]; });
    reject(value => { value.plan.view = {
      xMin: -1, xMax: 1, yMin: -1, yMax: 1 }; });
    reject(value => { value.plan.interactions = [
      { point: 'O', dx: 30, dy: 0 }]; });
    reject(value => { value.plan.program[0] = {
      id: 'P', op: 'freePoint', x: 1, y: 1 }; });
    reject(value => { value.plan.updates = [
      { object: 'O', coords: [1, 2] }, { object: 'O', value: 1 }]; });
    reject(value => { value.plan.updates = [
      { object: 'O', value: 1, coords: [1, 2] }]; });
    reject(value => { value.plan.updates = [{ object: 'O' }]; });
    reject(value => { value.base = undefined; });
  });

test('compile binds modify outputs and references to the base', () => {
  const compiled = compile(parseRequest(modifyRequest()), facts);
  assert.equal(compiled.mode, 'modify');
  assert.deepEqual(compiled.program.flatMap(step => step.outputs), ['P', 's']);
  const collision: any = modifyRequest();
  collision.plan.program[1].id = 'O';
  collision.plan.program[1].outputs = ['O'];
  assert.throws(() => compile(parseRequest(collision), facts),
    /Output collides with base object: O/);
  const missing: any = modifyRequest();
  missing.plan.styles[0].object = 'Q';
  assert.throws(() => compile(parseRequest(missing), facts),
    /Unknown object reference: Q/);
  const wrong: any = modifyRequest();
  wrong.plan.updates = [{ object: 'O', value: 1 }];
  assert.throws(() => compile(parseRequest(wrong), facts),
    /Value update needs a numeric base object: O/);
  const subject: any = modifyRequest();
  subject.plan.requirements[0].checks = [{
    kind: 'radius', subjects: ['O'], scope: 'initial', value: 3,
  }];
  assert.throws(() => compile(parseRequest(subject), facts),
    /Invalid radius subject: O/);
});

test('update targets must be independent, movable and in range', () => {
  const values = new Map<string, BaseFact>([
    ['O', { name: 'O', type: 'point', independent: true, moveable: true,
      fixed: false, slider: null }],
    ['P', { name: 'P', type: 'point', independent: false, moveable: false,
      fixed: false, slider: null }],
    ['F', { name: 'F', type: 'point', independent: true, moveable: false,
      fixed: true, slider: null }],
    ['n', { name: 'n', type: 'numeric', independent: true, moveable: true,
      fixed: false, slider: { min: 0, max: 5, step: 1 } }],
  ]);
  validateUpdates([
    { object: 'O', coords: [1, 2] },
    { object: 'n', value: 4 },
  ], values);
  const fail = (update: any, pattern: RegExp) => assert.throws(
    () => validateUpdates([update], values),
    (error: unknown) => error instanceof ToolError
      && error.code === 'invalid_update' && pattern.test(error.message));
  fail({ object: 'P', coords: [1, 2] }, /not independent/);
  fail({ object: 'F', coords: [1, 2] }, /fixed/);
  fail({ object: 'n', coords: [1, 2] }, /movable point/);
  fail({ object: 'O', value: 1 }, /numeric object/);
  fail({ object: 'n', value: 9 }, /slider range/);
  fail({ object: 'n', value: 3.5 }, /step grid/);
  assert.throws(() => validateUpdates([{ object: 'Q', value: 1 }], values),
    (error: unknown) => error instanceof ToolError
      && error.code === 'unknown_update_target');
});

test('update effects must reach the requested value', () => {
  requireUpdateEffects([{ object: 'O', coords: [1, 2] }], [
    { object: 'O', field: 'x', before: 0, after: 1 },
    { object: 'O', field: 'y', before: 0, after: 2 },
  ]);
  assert.throws(() => requireUpdateEffects(
    [{ object: 'O', coords: [1, 2] }],
    [{ object: 'O', field: 'x', before: 0, after: 1 }]),
  (error: unknown) => error instanceof ToolError
    && error.code === 'update_no_effect');
});

test('the modify gate allows additions, declared updates and propagation',
  () => {
    const differences = [
      { object: 'P', field: 'objectCount', expected: 0, actual: 1 },
      { object: 's', field: 'objectCount', expected: 0, actual: 1 },
      { object: 'O', field: 'x', expected: 0, actual: 0.5 },
      { object: 'O', field: 'y', expected: 0, actual: 0.5 },
      { object: 'circ', field: 'circle', expected: { x: 0, y: 0, radius: 3 },
        actual: { x: 0.5, y: 0.5, radius: 2.5 } },
      { object: 'circ', field: 'color', expected: '#1F4EFF',
        actual: '#1F8F3A' },
    ];
    const violations = modifyViolations({
      styles: [{ object: 'circ', properties: { color: '#1F8F3A' } }],
      updates: [{ object: 'O', coords: [0.5, 0.5] }],
      differences, declared: new Set(['P', 's']),
      baseLabels: new Set(['O', 'R', 'circ']),
      links: [
        { name: 'O', inputs: [], referenceState: 'direct' as const },
        { name: 'R', inputs: [], referenceState: 'direct' as const },
        { name: 'circ', inputs: ['O', 'R'], referenceState: 'direct' as const },
        { name: 'P', inputs: ['circ'], referenceState: 'direct' as const },
        { name: 's', inputs: ['O', 'P'], referenceState: 'direct' as const },
      ],
    });
    assert.deepEqual(violations, []);
    const captioned = modifyViolations({
      styles: [{ object: 'R', properties: { caption: 'Right' } }],
      updates: [], declared: new Set(),
      baseLabels: new Set(['O', 'R', 'circ']),
      links: [],
      differences: [
        { object: 'R', field: 'caption', expected: '', actual: 'Right' },
        { object: 'R', field: 'labelStyle', expected: 0, actual: 3 },
      ],
    });
    assert.deepEqual(captioned, []);
  });

test('the modify gate rejects removals, undeclared additions and edits',
  () => {
    const gate = (differences: any[], declared = new Set(['P'])) =>
      modifyViolations({
        styles: [], updates: [], differences, declared,
        baseLabels: new Set(['O', 'R', 'circ']),
        links: [],
      });
    assert.equal(gate([
      { object: 'R', field: 'objectCount', expected: 1, actual: 0 },
    ]).length, 1);
    assert.equal(gate([
      { object: 'Q', field: 'objectCount', expected: 0, actual: 1 },
    ]).length, 1);
    assert.equal(gate([
      { object: 'P', field: 'objectCount', expected: 0, actual: 1 },
    ]).length, 0);
    assert.equal(gate([
      { object: 'O', field: 'x', expected: 0, actual: 1 },
    ]).length, 1);
    assert.equal(gate([
      { object: 'O', field: 'color', expected: '#4D4DFF', actual: '#D92B2B' },
    ]).length, 1);
    assert.equal(gate([
      { object: 'O', field: 'visible', expected: true, actual: false },
    ]).length, 1);
  });
