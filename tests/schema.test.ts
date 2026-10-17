import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { compile } from '../src/compile.js';
import { build } from '../src/delivery.js';
import { parseRequest, type Request } from '../src/schema.js';
import { root } from '../src/server.js';
import {
  equivalent, compareSnapshots, snapshotDifferences, verify,
} from '../src/verify.js';
import type { Snapshot } from '../src/browser.js';

const fixture = JSON.parse(await readFile(join(root, 'examples/v2-cases/triangle.json'), 'utf8'));
test('M6 value, assumption and interaction envelopes reject invalid extensions before execution', async () => {
  const original = JSON.parse(await readFile(join(root, 'tests/fixtures/statistics.json'), 'utf8'));
  const cases = [
    (r: any) => { r.plan.requirements[0].checks[0].expected = ['symbolic']; },
    (r: any) => { r.plan.requirements[0].checks[0].expected = Array(256).fill(0); },
    (r: any) => { r.plan.requirements[0].checks[0].expected = [[[[[[[[[[0]]]]]]]]]]; },
    (r: any) => { r.plan.requirements[0].checks[5].mode = 'algebra'; },
    (r: any) => { r.plan.interactions = [{parameter:'matrixA',value:Infinity}]; },
    (r: any) => { r.plan.interactions = [{parameter:'matrixA',value:1,point:'A'}]; },
    (r: any) => { r.plan.interactions = [{parameter:'matrixA',value:1},{parameter:'matrixA',value:1}]; },
  ];
  for (const change of cases) { const input = structuredClone(original); change(input); assert.throws(() => parseRequest(input)); }
});
test('reserved step IDs are rejected while engine-owned outputs may use reserved labels', () => {
  for (const name of ['ln', 'sin', 'Circle', 'Text', 'true', 'Segment']) {
    const input = structuredClone(fixture);
    input.plan.program[0].id = name;
    assert.throws(() => parseRequest(input),
      new RegExp(`Reserved GeoGebra name: ${name}`));
  }
  const outputs = structuredClone(fixture);
  outputs.plan.program.push({
    id: 'helper', op: 'native', source: 'helper=1', mode: 'algebra',
    outputs: ['helper', 'Segment'],
  });
  assert.doesNotThrow(() => parseRequest(outputs));
});
test('requirement IDs may carry report-style punctuation', () => {
  const named = structuredClone(fixture);
  named.plan.requirements[0].id = 'circle-exists.v2';
  assert.equal(parseRequest(named).plan.requirements[0]?.id,
    'circle-exists.v2');
  for (const bad of ['1circle', 'circle exists', '']) {
    const broken = structuredClone(fixture);
    broken.plan.requirements[0].id = bad;
    assert.throws(() => parseRequest(broken), /Invalid requirement ID/);
  }
});

test('unknown fields are named and misplaced plan fields get a hint', () => {
  const stray = structuredClone(fixture);
  stray.plan.requirements[0].checks[0].kind2 = 'expression';
  assert.throws(() => parseRequest(stray), /Unknown field: kind2/);
  const lifted = structuredClone(fixture);
  lifted.interactions = [];
  assert.throws(() => parseRequest(lifted),
    /Unknown field: interactions; interactions belong under plan/);
});

test('subject-count errors name the requirement and the predicate', () => {
  const input = structuredClone(fixture);
  input.plan.requirements[0].checks[0] = {
    kind: 'midpoint', subjects: ['A', 'B'], scope: 'initial',
  };
  assert.throws(() => parseRequest(input),
    /Check ".*" midpoint: expected 3 subjects, got 2/);
});

test('predicate errors name the expected type and the actual one', () => {
  const facts = [
    { name: 'A', type: 'point', defined: true, independent: true, moveable: true,
      x: 1, y: 2, value: null, line: null, circle: null, inputs: [],
      referenceState: 'direct' },
    { name: 's', type: 'segment', defined: true, independent: false,
      moveable: false, x: null, y: null, value: null, line: null, circle: null,
      inputs: ['A'], referenceState: 'direct' },
  ] as unknown as Snapshot;
  const request = {
    protocolVersion: 2, prompt: 'x', locale: 'zh', outputDir: 'x',
    plan: {
      program: [], interactions: [],
      requirements: [
        { id: 'par', source: 'x', checks: [
          { kind: 'parallel', subjects: ['s', 's'], scope: 'initial' }] },
        { id: 'on', source: 'x', checks: [
          { kind: 'pointOn', subjects: ['A', 's'], scope: 'initial' }] },
      ],
    },
  } as unknown as Request;
  const result = verify(request, facts, 'initial');
  const messages = JSON.stringify(result.results);
  assert.match(messages, /Expected a line: s \(segment\)/);
  assert.match(messages, /Expected a circle or conic: s \(segment\)/);
});

test('filling accepts fractions and rejects out-of-range values', () => {
  const sample = structuredClone(fixture);
  sample.plan.styles = [{ object: 'A', properties: { filling: 0.5 } }];
  assert.doesNotThrow(() => parseRequest(sample));
  for (const filling of [-0.1, 1.5, Number.NaN]) {
    const invalid = structuredClone(fixture);
    invalid.plan.styles = [{ object: 'A', properties: { filling } }];
    assert.throws(() => parseRequest(invalid), /Invalid filling/);
  }
});
test('expression checks name the check and the missing subject', () => {
  const input = structuredClone(fixture);
  const requirement = input.plan.requirements[0];
  const index = requirement.checks.length;
  requirement.checks.push({
    kind: 'expression', subjects: ['A', 'AbsentPoint'],
    expression: 'Distance(A,B)', mode: 'algebra', expected: 0,
    scope: 'initial',
  });
  assert.throws(() => parseRequest(input), (error: unknown) => {
    assert(error instanceof Error);
    assert.match(error.message, new RegExp(`Check ${requirement.id}:${index}`));
    assert.match(error.message, /missing AbsentPoint/);
    return true;
  });
});
test('programs can reference later declarations and compile in dependency order', () => {
  const input = structuredClone(fixture);
  input.plan.program.reverse();
  const result = compile(parseRequest(input));
  const index = (id: string) => result.program.findIndex(s => s.step.id === id);
  assert(index('M') > index('A') && index('M') > index('B'));
  assert(index('median') > index('M') && index('median') > index('C'));
});

test('unsafe inputs, invalid graphs and unsupported verification are rejected before browser execution', async t => {
  const cases: [string, (input: any) => void][] = [
    ['raw script', r => { r.script = 'alert(1)'; }],
    ['external GGB', r => { r.initialGgbPath = '/tmp/unknown.ggb'; }],
    ['injected reference', r => { r.plan.program[4].args[0].ref = 'A)\nDelete(B)'; }],
    ['unsupported command', r => { r.plan.program[4].name = 'Execute'; }],
    ['duplicate object', r => { r.plan.program[1].id = 'A'; }],
    ['missing reference', r => { r.plan.program[4].args[0].ref = 'Missing'; }],
    ['dependency cycle', r => { r.plan.program[4].args[0].ref = 'M'; }],
    ['invalid argument type', r => { r.plan.program[4].args[0] = 2; }],
    ['empty requirements', r => { r.plan.requirements = []; }],
    ['empty checks', r => { r.plan.requirements[0].checks = []; }],
    ['invented source', r => { r.plan.requirements[0].source = 'Not in prompt'; }],
    ['unsupported method', r => { r.plan.requirements[0].checks[0].kind = 'proveEverything'; }],
    ['forged result', r => { r.plan.requirements[0].checks[0].status = 'passed'; }],
    ['caller tolerance', r => { r.plan.requirements[0].checks[0].tolerance = 10; }],
    ['unknown check subject', r => { r.plan.requirements[0].checks[0].subjects = ['Unknown']; }],
    ['dependent drag point', r => { r.plan.interactions[0].point = 'M'; }],
    ['invalid style target', r => { r.plan.styles[0].object = 'Missing'; }],
    ['invalid line thickness', r => { r.plan.styles[1].properties.lineThickness = 0; }],
  ];
  const directory = await mkdtemp(join(tmpdir(), 'ggb-reject-'));
  try {
    for (const [name, mutate] of cases) await t.test(name, async () => {
      const input = structuredClone(fixture); input.outputDir = join(directory, name);
      mutate(input);
      await assert.rejects(build(input));
      await assert.rejects(stat(input.outputDir), /ENOENT/, 'Invalid input must not write artifacts');
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('consistency comparison tolerates numerical noise but preserves identity and dependency', () => {
  assert(equivalent({ x: 1 }, { x: 1 + 1e-9 }));
  assert(!equivalent({ x: 1 }, { x: 1 + 5e-8 }));
  assert(!equivalent({ x: 1 }, { x: 1.001 }));
  assert(!equivalent({ ref: 'A' }, { ref: 'B' }));
  assert(!equivalent({ x: 1 }, { x: '1' }));
});

test('snapshot diagnostics preserve the math, dependency and presentation gates', () => {
  const baseline = [{ name: 'A', type: 'point', independent: true, x: 1, y: 2, inputs: [], lineThickness: 5 }] as unknown as Snapshot;
  for (const [field, value] of [['x', 1.01], ['inputs', ['B']], ['lineThickness', 7]] as const) {
    const changed = structuredClone(baseline);
    Object.assign(changed[0]!, { [field]: value });
    const differences = snapshotDifferences(changed, baseline);
    assert(differences.some(d => d.object === 'A' && d.field === field));
    assert.throws(() => compareSnapshots(changed, baseline), /Construction facts changed/);
  }
  assert.deepEqual(snapshotDifferences(baseline, baseline), []);
  assert.equal(snapshotDifferences([], baseline)[0]!.field, 'objectCount');
  assert.throws(() => compareSnapshots([...baseline, ...baseline], baseline));
});

test('numeric literals preserve small and negative values without scientific notation', () => {
  for (const value of [1e-7, -1e-7, 1.23456789e-12, -1.23456789e-12, Number.MIN_VALUE, 0, -0, 10000]) {
    const input = structuredClone(fixture);
    input.plan.program = [{ id: 'P', op: 'freePoint', x: value, y: -value },
      { id: 'k', op: 'command', name: 'Circle', args: [{ ref: 'P' }, Math.abs(value) || 1] }];
    input.plan.requirements = [{ id: 'point', source: input.prompt, checks: [{ kind: 'exists', subjects: ['P'], scope: 'initial' }] }];
    input.plan.styles = []; input.plan.interactions = [{ point: 'P', dx: 40, dy: 30 }];
    const commands = compile(parseRequest(input)).program.map(s => s.command);
    const coordinates = /^P=\(([^,]+),([^,]+)\)$/.exec(commands[0]!)!;
    const radius = /^k=Circle\(P,([^)]+)\)$/.exec(commands[1]!)![1]!;
    for (const literal of [...coordinates.slice(1), radius]) assert(!/[eE]/.test(literal));
    assert.equal(Number(coordinates[1]), value === 0 ? 0 : value);
    assert.equal(Number(coordinates[2]), value === 0 ? 0 : -value);
    assert.equal(Number(radius), Math.abs(value) || 1);
  }
});
