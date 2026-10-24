/** @fileoverview Tests structural CLI validation without construction. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { root } from '../src/server.js';
import { compile, type BaseFacts } from '../src/compile.js';
import { parseRequest, ToolError, type Request } from '../src/schema.js';
import { checkRequest } from '../src/check.js';
import { createHash } from 'node:crypto';

test('check validates structure and rejects source drift', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ggb-preflight-'));
  try {
    const request = JSON.parse(await readFile(
      join(root, 'examples/geometry-benchmark/01-circumcircle.json'), 'utf8',
    ));
    request.outputDir = join(directory, 'must-not-exist');
    const path = join(directory, 'request.json');
    await writeFile(path, JSON.stringify(request));
    const run = () => spawnSync(process.execPath, [
      join(root, 'dist/src/cli.js'), 'check', '--request', path,
    ], { encoding: 'utf8' });
    const valid = run();
    assert.equal(valid.status, 0, valid.stderr);
    assert.equal(JSON.parse(valid.stdout).data.validation, 'structural');
    request.prompt = 'Changed prompt';
    await writeFile(path, JSON.stringify(request));
    const invalid = run();
    assert.equal(invalid.status, 1);
    assert.match(JSON.parse(invalid.stdout).error.message, /source/);
    assert.deepEqual(await readdir(directory), ['request.json']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('once requires a headless preview and cannot open a visible session', () => {
  for (const args of [['doctor', '--once'], ['preview', '--once']]) {
    const result = spawnSync(process.execPath, [
      join(root, 'dist/src/cli.js'), ...args,
    ], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(JSON.parse(result.stdout).error.message, /requires/);
  }
});

test('native pointOn rejects known segment subjects before execution', () => {
  const request = { protocolVersion: 2, prompt: 'point on segment', locale: 'en',
    outputDir: '/tmp/preflight', plan: {
      program: [
        { id: 'A', op: 'native', mode: 'algebra', source: 'A=(0,0)' },
        { id: 's', op: 'native', mode: 'algebra', source: 's=Segment(A,(1,1))' },
      ],
      requirements: [{ id: 'r', source: 'point on segment', checks: [
        { kind: 'pointOn', subjects: ['A', 's'], scope: 'initial' },
      ] }],
      interactions: [],
    } } as never;
  assert.throws(() => compile(request), /Invalid pointOn subject: s \(segment/);
});

/** Ordinary requests only; no applet or execution entry is used by these tests. */
function nativeRequest(source: string,
    path = 'g=Line(A,B)'): Request {
  return parseRequest({protocolVersion: 2, prompt: 'point on line',
    locale: 'en', outputDir: '/tmp/native-preflight-synthetic', plan: {
      program: [
        {id: 'A', op: 'native', mode: 'algebra', source: 'A=(0,0)'},
        {id: 'B', op: 'native', mode: 'algebra', source: 'B=(1,0)'},
        {id: 'g', op: 'native', mode: 'algebra', source: path},
        {id: 'P', op: 'native', mode: 'algebra', source},
      ],
      requirements: [{id: 'r', source: 'point on line', checks: [
        {kind: 'pointOn', subjects: ['P', 'g'], scope: 'initial'},
      ]}], interactions: [],
    }});
}

const baseFacts: BaseFacts = {labels: new Set(['O', 'R', 'circ']),
  types: new Map([['O', 'point'], ['R', 'point'], ['circ', 'conic']])};

for (const modify of [false, true]) {
  const mode = modify ? 'modify' : 'create';
  const input = (source: string, path?: string): Request => ({
    ...nativeRequest(source, path), ...(modify ? {base: {
      path: '/tmp/synthetic-base.ggb', sha256: 'b'.repeat(64),
    }} : {}),
  });
  for (const source of ['P=Vector(A,B)+A', 'P=Vector[A,B]+A',
    'P=Vector(A,B)+(A)', 'P=Rotate(A,0,B)', 'P=Point[Circle(A,B)]']) {
    test(`${mode} defers uncertain expressions or accepts points: ${source}`,
      () => {
        const request = input(source);
        const before = structuredClone(request);
        assert.equal(compile(request, baseFacts).mode, mode);
        assert.deepEqual(request, before);
      });
  }
  test(`${mode} rejects known invalid pointOn outputs`, () => {
    for (const source of ['P=Vector(A,B)',
      'P=Vector(Object("A"),Object("B"))']) {
      assert.throws(() => compile(input(source), baseFacts),
        /Invalid pointOn subject: P \(vector/);
    }
    assert.throws(() => compile(input('P=Point(g)',
      'g=Segment(A,B)'), baseFacts), /Invalid pointOn subject: g \(segment/);
    assert.throws(() => compile(input('P=Point(g)',
      'g=Ray(A,B)'), baseFacts), /Invalid pointOn subject: g \(ray/);
  });
  test(`${mode} defers CAS, multi-output and ambiguous command signatures`, () => {
    const cas = input('P=Vector(A,B)');
    const step = cas.plan.program[3]!;
    assert.equal(step.op, 'native');
    if (step.op === 'native') step.mode = 'cas';
    assert.equal(compile(cas, baseFacts).mode, mode);
    const multiple = input('P=Polygon(A,B,(0,1))');
    const multiStep = multiple.plan.program[3]!;
    if (multiStep.op === 'native') multiStep.outputs = ['P', 'edge'];
    assert.equal(compile(multiple, baseFacts).mode, mode);
    assert.equal(compile(input('P=Intersect(g,Line(A,(0,1)))'), baseFacts).mode, mode);
  });
}

test('modify combines baseline types with known and unknown new outputs', () => {
  const request = {...nativeRequest('P=Point(circ)'), base: {
    path: '/tmp/synthetic-base.ggb', sha256: 'b'.repeat(64),
  }};
  request.plan.requirements[0]!.checks[0]!.subjects = ['P', 'circ'];
  assert.equal(compile(request, baseFacts).mode, 'modify');
  request.plan.requirements[0]!.checks[0]!.subjects = ['P', 'O'];
  assert.throws(() => compile(request, baseFacts), /Invalid pointOn subject/);
  assert.throws(() => compile({...request, plan: {
    ...request.plan, program: nativeRequest('P=Point(g)',
      'g=Segment(A,B)').plan.program,
    requirements: nativeRequest('P=Point(g)').plan.requirements,
  }}), /Invalid pointOn subject: g \(segment/);
});

test('shared checkRequest preflights create and real archive additions offline',
  async () => {
    const path = join(root, 'tests/fixtures/edit-base.ggb');
    const sha256 = createHash('sha256').update(await readFile(path))
      .digest('hex');
    for (const modify of [false, true]) {
      const request = {...nativeRequest('P=Vector(A,B)+A'),
        ...(modify ? {base: {path, sha256}} : {})};
      const result = await checkRequest(request);
      assert.equal(result.validation, 'structural');
      assert.equal(result.mode, modify ? 'modify' : 'create');
      request.plan.program[2] = {id: 'g', op: 'native', mode: 'algebra',
        source: 'g=Segment(A,B)'};
      await assert.rejects(checkRequest(request), error =>
        error instanceof Error && 'code' in error &&
        error.code === 'invalid_input' &&
        /Invalid pointOn subject: g \(segment/.test(error.message));
    }
  });

test('native dependency preflight rejects a command argument created later', () => {
  const request = { protocolVersion: 2, prompt: 'segment', locale: 'en',
    outputDir: '/tmp/preflight', plan: {
      program: [
        { id: 's', op: 'native', mode: 'algebra', source: 's=Segment(F,A)' },
        { id: 'A', op: 'native', mode: 'algebra', source: 'A=(0,0)' },
        { id: 'F', op: 'native', mode: 'algebra', source: 'F=(1,0)' },
      ],
      requirements: [{ id: 'r', source: 'segment', checks: [
        { kind: 'exists', subjects: ['s'], scope: 'initial' },
      ] }],
      interactions: [],
    } } as never;
  assert.throws(() => compile(request), /Step s references undefined object F/);
});

test('check validation exposes structured source and check-field details', () => {
  const base = { protocolVersion: 2, prompt: 'Draw circle c', locale: 'en',
    outputDir: '/tmp/preflight', plan: {
      program: [{ id: 'c', op: 'native', mode: 'algebra', source: 'c=Circle((0,0),1)' }],
      requirements: [{ id: 'r', source: 'not in prompt', checks: [
        { kind: 'exists', subjects: ['c'], scope: 'initial' },
      ] }],
      interactions: [],
    } };
  try { parseRequest(base); assert.fail('expected source rejection'); }
  catch (error) {
    assert.ok(error instanceof ToolError);
    assert.deepEqual(error.details, { requirementId: 'r', source: 'not in prompt',
      availableSources: ['Draw circle c'] });
  }
  const coordinate = structuredClone(base);
  coordinate.plan.requirements[0]!.source = 'Draw circle c';
  coordinate.plan.requirements[0]!.checks = [
    { kind: 'coordinate', subjects: ['c'], scope: 'initial', expected: [0, 0] },
  ] as never;
  try { parseRequest(coordinate); assert.fail('expected coordinate rejection'); }
  catch (error) {
    assert.ok(error instanceof ToolError);
    assert.deepEqual(error.details, { checkId: 'r:0', kind: 'coordinate',
      fields: ['expected'], expectedFields: ['coordinates'] });
  }
});


test('type uses objectType, sources remain verbatim and captions may be display text', () => {
  const body = {protocolVersion: 2, prompt: 'Given point F1', locale: 'en',
    outputDir: '/tmp/contract', plan: {
      program: [{id: 'A', op: 'native', source: 'A=(1,0)', mode: 'algebra'}],
      interactions: [], styles: [{object: 'A', properties: {caption: 'F₁'}}],
      requirements: [{id: 'point', source: 'point F1', checks: [
        {kind: 'type', subjects: ['A'], objectType: 'point', scope: 'initial'},
      ]}],
    }};
  assert.doesNotThrow(() => compile(parseRequest(body)));
  const wrongType = structuredClone(body);
  Object.assign(wrongType.plan.requirements[0]!.checks[0]!, {expected: 'point'});
  assert.throws(() => parseRequest(wrongType), /Unexpected expression field/);
  const wrongSource = structuredClone(body);
  wrongSource.plan.requirements[0]!.source = 'point F₁';
  assert.throws(() => parseRequest(wrongSource), /source is not in the input/);
});
