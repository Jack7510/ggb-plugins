/** @fileoverview Regression tests for review boundaries without a browser. */
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { deflateRawSync } from 'node:zlib';
import type { Snapshot, Observation } from '../src/browser.js';
import { compile } from '../src/compile.js';
import { validateHostMaterial } from '../src/delivery-contract.js';
import { auditGgb, readGgb } from '../src/ggbfile.js';
import { modifyViolations } from '../src/modify.js';
import { parseRequest, ToolError, type Request } from '../src/schema.js';
import { verify } from '../src/verify.js';

/** Builds a small ZIP with explicit headers for the bounded-reader tests. */
function archive(entries: { name: string; body: Buffer; declared: number }[],
  method = 8): Buffer {
  const locals: Buffer[] = [];
  const records: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const data = method === 8 ? deflateRawSync(entry.body) : entry.body;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(entry.declared, 22);
    local.writeUInt16LE(name.length, 26);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50);
    record.writeUInt16LE(method, 10);
    record.writeUInt32LE(data.length, 20);
    record.writeUInt32LE(entry.declared, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    records.push(record, name);
    offset += local.length + name.length + data.length;
  }
  const central = Buffer.concat(records);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, end]);
}

async function readArchive(bytes: Buffer) {
  const directory = await mkdtemp(join(tmpdir(), 'ggb-zip-bound-'));
  try {
    const path = join(directory, 'input.ggb');
    await writeFile(path, bytes);
    return await readGgb(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('ZIP allocation is bounded by declared and actual expansion budgets',
  async () => {
    const body = Buffer.alloc(2 * 1024 * 1024);
    const forged = archive([{ name: 'geogebra.xml', body, declared: 1 }]);
    assert(forged.length < 10_000);
    await assert.rejects(readArchive(forged), (error: unknown) =>
      error instanceof ToolError && error.code === 'limit_exceeded');
    const large = Buffer.alloc(12 * 1024 * 1024);
    const total = archive(['geogebra.xml', 'geogebra_defaults2d.xml',
      'geogebra_defaults3d.xml'].map(name => ({
      name, body: large, declared: large.length,
    })));
    await assert.rejects(readArchive(total), (error: unknown) =>
      error instanceof ToolError && error.code === 'limit_exceeded');
  });

test('bounded ZIP entries accept correct stored, deflated and empty bodies',
  async () => {
    for (const method of [0, 8]) {
      for (const body of [Buffer.from('<geogebra/>'), Buffer.alloc(0)]) {
        const result = await readArchive(archive([
          { name: 'geogebra.xml', body, declared: body.length },
        ], method));
        assert.deepEqual(result.entries.get('geogebra.xml'), body);
      }
    }
  });

test('base audit rejects dimensional XML types before API aliases hide them',
  () => {
    for (const type of ['point3d', 'vector3d', 'line3d', 'polygon3d']) {
      const xml = '<geogebra><construction>'
        + '<element type="point" label="O"/>'
        + `<element type="${type}" label="A"/>`
        + '</construction></geogebra>';
      assert.throws(() => auditGgb(new Map([
        ['geogebra.xml', Buffer.from(xml)],
      ])), (error: unknown) => error instanceof ToolError
        && error.code === 'base_unsupported');
    }
  });

function numberFact(name: string, type: string, value: number): Snapshot[0] {
  return {
    name, type, nativeType: type, value, defined: true,
    independent: true, moveable: true, command: String(value),
    nativeDefinition: null, referenceState: 'direct',
    expression: String(value), inputs: [], valueString: String(value),
    x: null, y: null, line: null, circle: null, conic: null, data: null,
    color: '#000000', visible: true, labelVisible: false, labelStyle: 0,
    lineThickness: 2, lineStyle: 0, filling: 0, caption: '', fixed: false,
    slider: null,
  };
}

function equalRequest(): Request {
  return {
    protocolVersion: 2, prompt: 'Equal segments', locale: 'en',
    outputDir: '/tmp/unused', plan: {
      program: ['a', 'b'].map(id => ({
        id, op: 'native', source: `${id}=3`, mode: 'algebra',
      })),
      requirements: [{ id: 'equal', source: 'Equal segments', checks: [
        { kind: 'equalLength', subjects: ['a', 'b'], scope: 'initial' },
      ] }], interactions: [],
    },
  };
}

test('equalLength checks actual segment types on every native subject', () => {
  const request = parseRequest(equalRequest());
  compile(request);
  for (const [left, right, value, status] of [
    ['numeric', 'numeric', 3, 'unverified'],
    ['segment', 'numeric', 3, 'unverified'],
    ['segment', 'segment', 3, 'passed'],
    ['segment', 'segment', 4, 'failed'],
  ] as const) {
    const result = verify(request, [numberFact('a', left, 3),
      numberFact('b', right, value)], 'initial');
    assert.equal(result.results.find(r => r.checkId === 'equal:0')?.status,
      status);
  }
});

test('questions cannot supply assumptions or requirement sources', () => {
  const request: Request = {
    protocolVersion: 2, prompt: 'Plot f(x)=sqrt(x^2)-x', locale: 'en',
    outputDir: '/tmp/unused',
    clarifications: [{ question: 'May we assume x>0?',
      answer: 'No, negative inputs are allowed.' }],
    plan: {
      program: [{ id: 'f', op: 'native', mode: 'algebra',
        source: 'f(x)=sqrt(x^2)-x' }],
      requirements: [{ id: 'identity', source: 'Plot', checks: [{
        kind: 'expression', subjects: ['f'], expression: 'Simplify(f(x))',
        mode: 'cas', assumptions: ['x>0'], expected: 0, scope: 'initial',
      }] }], interactions: [],
    },
  };
  assert.throws(() => parseRequest(request), /Assumption is not in the input/);
  const confirmed = structuredClone(request);
  confirmed.clarifications = [{ question: 'State the domain.',
    answer: 'x>0' }];
  assert.doesNotThrow(() => parseRequest(confirmed));
  const given = structuredClone(request);
  given.prompt += ', x>0';
  assert.doesNotThrow(() => parseRequest(given));
  const fabricated = structuredClone(request);
  fabricated.plan.requirements[0]!.source = 'May we assume x>0?';
  assert.throws(() => parseRequest(fabricated), /source is not in the input/);
});

test('conic recomputation is allowed only along a declared update dependency',
  () => {
    const input = {
      styles: [], updates: [{ object: 'F1', coords: [-1, 0] as
        [number, number] }],
      differences: [{ object: 'el', field: 'conic',
        expected: [80, 144, -720, 0, 0, 0],
        actual: [108, 144, -945, 0, -54, 0] }],
      declared: new Set<string>(), baseLabels: new Set(['F1', 'el']),
      links: [{ name: 'el', inputs: ['F1'],
        referenceState: 'direct' as const }],
    };
    assert.deepEqual(modifyViolations(input), []);
    assert.equal(modifyViolations({ ...input, links: [] }).length, 1);
  });

test('host material validation rejects non-object and non-string manifests',
  () => {
    const facts = { file: 'result.ggb', runtimeVersion: '5.0',
      sha256: 'a'.repeat(64) };
    assert.doesNotThrow(() => validateHostMaterial({ ...facts }, facts));
    for (const value of [null, [], 'manifest', {},
      { ...facts, file: 1 }, { ...facts, sha256: null }]) {
      assert.throws(() => validateHostMaterial(value, facts), /Manifest/);
    }
  });

test('pointOn cannot substitute for a verified dynamic dependency', () => {
  const request: Request = {protocolVersion: 2, prompt: 'point on line',
    locale: 'en', outputDir: '/tmp/unused', plan: {
      program: [], interactions: [], requirements: [{id: 'path',
        source: 'point on line', checks: [
          {kind: 'pointOn', subjects: ['A', 'd'], scope: 'initial'},
          {kind: 'dependsOn', subjects: ['A', 'd', 'p'], scope: 'initial'},
        ]}],
    }};
  for (const [independent, referenceState, status] of [
    [true, 'direct', 'failed'], [false, 'direct', 'passed'],
    [false, 'ambiguous', 'unverified'],
  ] as const) {
    const facts = [
      {...numberFact('A', 'point', 0), x: -1, y: 3, independent,
        inputs: independent ? [] : ['d'], referenceState},
      {...numberFact('d', 'line', 0), independent: false,
        inputs: ['p'], line: [1, 0, 1]},
      numberFact('p', 'parabola', 0),
    ] as Snapshot;
    const result = verify(request, facts, 'initial', []);
    assert.equal(result.results.find(r => r.checkId === 'path:0')?.status,
      'passed');
    assert.equal(result.results.find(r => r.checkId === 'path:1')?.status,
      status);
  }
});

/** Probe diagnostics must explain rejection without changing admission. */
function expressionFixture(expected: number | boolean | number[]) {
  const request = equalRequest();
  request.plan.requirements[0]!.checks = [{kind: 'expression',
    subjects: ['a'], expression: 'a', mode: 'algebra', expected,
    scope: 'initial'}];
  const observation: Observation = {id: 'equal:0', expression: 'a',
    mode: 'algebra', type: 'numeric', defined: true, value: 3, result: 'a'};
  return {request, observation};
}

test('expression summaries preserve actual types and independent expectations',
  () => {
    for (const [expected, type, defined, value, status] of [
      [true, 'line', false, null, 'unverified'],
      [true, 'numeric', true, 1, 'unverified'],
      [0, 'numeric', true, 2, 'failed'],
      [0, 'numeric', true, 5e-8, 'unverified'],
      [[1], 'list', true, null, 'unverified'],
    ] as const) {
      const fixture = expressionFixture(Array.isArray(expected)
        ? [...expected] : expected as number | boolean);
      Object.assign(fixture.observation, {type, defined, value});
      const result = verify(fixture.request, [numberFact('a', 'numeric', 3),
        numberFact('b', 'numeric', 3)], 'initial', [fixture.observation]);
      const check = result.results.find(r => r.checkId === 'equal:0');
      assert.equal(check?.status, status);
      const evidence = check?.evidence as {message: string};
      assert.match(evidence.message, new RegExp(`returned ${type}`));
      assert.ok(evidence.message.includes(`defined=${defined}`));
      assert.ok(evidence.message.includes(`expected ${Array.isArray(expected)
        ? 'list' : typeof expected === 'boolean' ? 'boolean' : 'numeric'}`));
      assert.ok(evidence.message.length <= 256);
    }
  });

test('expression summaries distinguish missing, mismatched and failed probes',
  () => {
    const {request, observation} = expressionFixture(0);
    const facts = [numberFact('a', 'numeric', 3), numberFact('b', 'numeric', 3)];
    for (const [probe, expected] of [
      [undefined, 'probe observation missing'],
      [{...observation, expression: 'b'}, 'does not match'],
      [{...observation, error: '/Users/private sk-secret'}, 'evaluation error'],
    ] as const) {
      const check = verify(request, facts, 'initial', probe ? [probe] : [])
        .results.find(r => r.checkId === 'equal:0');
      const evidence = check?.evidence as {message: string};
      assert.equal(check?.status, 'unverified');
      assert.ok(evidence.message.includes(expected));
      if (!probe) assert.ok(evidence.message.includes('defined=unknown'));
      assert.doesNotMatch(evidence.message, /private|sk-secret/u);
    }
    const missing = verify(request, [], 'initial', [observation])
      .results.find(r => r.checkId === 'equal:0');
    assert.match((missing?.evidence as {message: string}).message,
      /required subject missing/u);
    const valid = expressionFixture(3);
    const passed = verify(valid.request, facts, 'initial', [valid.observation])
      .results.find(r => r.checkId === 'equal:0');
    assert.equal(passed?.status, 'passed');
    assert.equal((passed?.evidence as {message?: string}).message, undefined);
  });


test('derived fixed-value objects still need dependencies at initial and reload', () => {
  const request: Request = {protocolVersion: 2, prompt: 'focus of ellipse',
    locale: 'en', outputDir: '/tmp/unused', plan: {
      program: [], interactions: [], requirements: [{id: 'focus',
        source: 'focus of ellipse', checks: [
          {kind: 'coordinate', subjects: ['F'], coordinates: [-1, 0], scope: 'initial'},
          {kind: 'dependsOn', subjects: ['F', 'ell'], scope: 'initial'},
        ]}],
    }};
  const source = numberFact('ell', 'ellipse', 0);
  const initial = {...numberFact('F', 'point', 0), x: -1, y: 0,
    independent: false, inputs: ['ell'], referenceState: 'direct' as const};
  for (const [changes, expected] of [
    [{}, 'passed'],
    [{independent: true, inputs: []}, 'failed'],
    [{referenceState: 'ambiguous'}, 'unverified'],
  ] as const) {
    const facts = [source, {...initial, ...changes}] as Snapshot;
    const results = verify(request, facts, 'initial').results
      .filter(result => result.requirementId === 'focus');
    assert.equal(results[0]?.status, 'passed');
    assert.equal(results[1]?.status, expected);
  }
  // Reload is an independent snapshot; an initially valid graph cannot hide loss.
  assert.equal(verify(request, [source, initial] as Snapshot, 'initial').status, 'passed');
  const lost = {...initial, independent: true, inputs: []};
  assert.notEqual(verify(request, [source, lost] as Snapshot, 'initial').status, 'passed');
  // Explicit fixed input uses coordinates alone, without inventing a dependency.
  request.plan.requirements[0]!.checks.pop();
  assert.equal(verify(request, [lost] as Snapshot, 'initial').status, 'passed');
});
