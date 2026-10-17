/** @fileoverview Regression tests for review boundaries without a browser. */
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { deflateRawSync } from 'node:zlib';
import type { Snapshot } from '../src/browser.js';
import { compile } from '../src/compile.js';
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
