/**
 * @fileoverview Unit tests for GGB audit rules, edit schema and edit gates.
 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { auditGgb, readGgb } from '../src/ggbfile.js';
import {
  diffViolations, editFields, requireEffects, validateTargets,
} from '../src/edit.js';
import { parseRequest, ToolError } from '../src/schema.js';
import { root } from '../src/server.js';

const basePath = join(root, 'tests/fixtures/edit-base.ggb');
const sha = 'a'.repeat(64);
const archive = (body: string, extra: [string, string][] = []) => new Map([
  ['geogebra.xml', Buffer.from(`<geogebra version="5.4.932.1">`
    + `<construction>${body}</construction></geogebra>`)],
  ...extra.map(([name, text]): [string, Buffer] => [name, Buffer.from(text)]),
]);
const element = (type: string, label: string) =>
  `<element type="${type}" label="${label}"/>`;

function editRequest() {
  return {
    protocolVersion: 2, prompt: '把圆改成红色', locale: 'zh-CN',
    outputDir: 'output/edits',
    base: { path: basePath, sha256: sha },
    plan: {
      edits: [{ object: 'circ', properties: { color: '#D92B2B' } }],
      requirements: [{
        id: 'appearance', source: '改成红色',
        checks: [{
          kind: 'style', subjects: ['circ'], scope: 'initial',
          properties: { color: '#D92B2B' },
        }],
      }],
      interactions: [],
    },
  };
}

test('archive reading binds bytes to a digest and rejects foreign files',
  async () => {
  const file = await readGgb(basePath);
  assert.equal(file.sha256.length, 64);
  assert(file.entries.has('geogebra.xml'));
  const directory = await mkdtemp(join(tmpdir(), 'ggb-archive-'));
  try {
    const garbage = join(directory, 'base.ggb');
    await writeFile(garbage, Buffer.from('not a zip archive at all'));
    await assert.rejects(readGgb(garbage), (error: unknown) =>
      error instanceof ToolError && error.code === 'base_unsupported');
    const truncated = join(directory, 'truncated.ggb');
    const bytes = await readFile(basePath);
    await writeFile(truncated, bytes.subarray(0, bytes.length - 40));
    await assert.rejects(readGgb(truncated), (error: unknown) =>
      error instanceof ToolError);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive audit rejects scripts, custom tools and opaque materials', () => {
  const summary = auditGgb(archive(element('point', 'A')));
  assert.deepEqual(summary.objects, [{ name: 'A', type: 'point' }]);
  const reject = (entries: Map<string, Buffer>, pattern: RegExp) =>
    assert.throws(() => auditGgb(entries), (error: unknown) =>
      error instanceof ToolError && pattern.test(error.message));
  reject(archive(element('point', 'A'), [['notes.txt', 'x']]),
    /Unsupported GGB entry/);
  reject(archive(element('point', 'A'),
    [['geogebra_javascript.js', 'function ggbOnInit() { alert(1) }']]),
    /scripts are not supported/);
  reject(archive(`${element('point', 'A')}<ggbscript>alert(1)</ggbscript>`),
    /object scripts are not supported/);
  reject(archive('<macros><macro cmd="M" tool="1"/></macros>'), /Custom tools/);
  reject(archive(element('image', 'img1')), /Unsupported base object/);
  reject(archive(''), /no objects/);
});

test('archive labels are decoded and keep their actual names', () => {
  const summary = auditGgb(archive(
    element('segment', 'L_2&apos;') + element('angle', '&#x3B8;1') +
    element('point', 'A&amp;B')));
  assert.deepEqual(summary.objects.map(object => object.name),
    ["L_2'", 'θ1', 'A&B']);
});

test('edit targets accept the labels real files contain', () => {
  const input: any = editRequest();
  input.plan.edits = [
    { object: 'θ1', properties: { color: '#1F8F3A' } },
    { object: "L_2'", properties: { lineThickness: 8 } },
  ];
  input.plan.requirements[0].checks = [
    { kind: 'style', subjects: ['θ1'], scope: 'initial',
      properties: { color: '#1F8F3A' } },
    { kind: 'style', subjects: ["L_2'"], scope: 'initial',
      properties: { lineThickness: 8 } },
  ];
  const request = parseRequest(input);
  assert.deepEqual(request.plan.edits?.map(edit => edit.object),
    ['θ1', "L_2'"]);
  for (const bad of ['', 'A B', 'A"B', 'A<B', '\u0000A', 'x'.repeat(65)]) {
    const broken: any = editRequest();
    broken.plan.edits[0].object = bad;
    assert.throws(() => parseRequest(broken), /Invalid base object name/);
  }
});

test('edit requests carry a digest and never mix with a program', () => {
  const request = parseRequest(editRequest());
  assert.equal(request.base?.sha256, sha);
  assert.deepEqual(request.plan.program, []);
  const reject = (mutate: (input: any) => void, pattern: RegExp) => {
    const input: any = editRequest();
    mutate(input);
    assert.throws(() => parseRequest(input), pattern);
  };
  reject(input => {
    input.plan.program = [{ id: 'A', op: 'freePoint', x: 1, y: 1 }];
  },
    /declares edits, not a program/);
  reject(input => { input.base.path = 'relative/base.ggb'; },
    /Base path must be absolute/);
  reject(input => { input.base.sha256 = 'xyz'; }, /Invalid base sha256/);
  reject(input => { input.plan.edits[0].properties.caption = 'x'; },
    /Unknown field/);
  reject(input => { input.plan.edits[0].properties.filling = 1.5; },
    /Invalid filling/);
  reject(input => {
    input.plan.edits.push({ object: 'circ', properties: { visible: true } });
  },
    /Duplicate edit target/);
  reject(input => { input.plan.edits[0].object = 'A"B'; },
    /Invalid base object name/);
  reject(input => {
    input.plan.interactions = [{ point: 'O', dx: 40, dy: 0 }];
  }, /no interaction samples/);
  const primed: any = editRequest();
  primed.plan.edits[0].object = "A'";
  primed.plan.requirements[0].checks[0].subjects = ["A'"];
  assert.equal(parseRequest(primed).plan.edits?.[0]?.object, "A'");
});

test('targets must exist and accept that property on that type', () => {
  const types = new Map([['circ', 'circle'], ['O', 'point'], ['msg', 'text']]);
  const check = (edits: any[], pattern: RegExp) =>
    assert.throws(() => validateTargets(edits, types), pattern);
  check([{ object: 'zzz', properties: { color: '#112233' } }],
    /Unknown base object/);
  check([{ object: 'O', properties: { filling: 0.3 } }],
    /Filling needs a fillable/);
  check([{ object: 'msg', properties: { lineStyle: 1 } }], /outline object/);
  validateTargets(
    [{ object: 'circ', properties: { filling: 0.3, lineStyle: 1 } }], types);
});

test('diff allow-list admits documented propagation to dependents', () => {
  const edits = [{ object: 'bTri', properties: { color: '#E8833A' } }];
  const links = [
    { name: 'a', inputs: ['P', 'C', 'bTri'] },
    { name: 'c_1', inputs: ['C', 'A', 'bTri'] },
    { name: 'O', inputs: [] },
    { name: 'txtSum', inputs: [] },
  ];
  const propagated = [
    { object: 'a', field: 'color', expected: '#C7442E', actual: '#E8833A' },
    { object: 'c_1', field: 'filling', expected: 0, actual: 0.4 },
    { object: 'txtSum', field: 'color', expected: '#111111', actual: '#E8833A' },
    { object: 'a', field: 'visible', expected: true, actual: false },
  ];
  assert.deepEqual(diffViolations(edits, propagated, links).map(change =>
    `${change.object}.${change.field}`), ['c_1.filling', 'txtSum.color',
    'a.visible']);
  assert.equal(diffViolations(edits, propagated.slice(0, 1)).length, 1);
});

test('diff allow-list rejects undeclared objects and fields', () => {
  const edits = [
    { object: 'circ', properties: { color: '#112233', filling: 0.3 } },
  ];
  assert.deepEqual([...editFields(edits)],
    ['circ\u0000color', 'circ\u0000filling']);
  const changes = [
    { object: 'circ', field: 'color', expected: '#000', actual: '#112233' },
    { object: 'O', field: 'visible', expected: true, actual: false },
    { object: 'circ', field: 'objectCount', expected: 1, actual: 0 },
  ];
  assert.deepEqual(diffViolations(edits, changes).map(change =>
    `${change.object}.${change.field}`), ['O.visible', 'circ.objectCount']);
});

test('edits must be observable, not merely accepted', () => {
  const edits = [
    { object: 'circ', properties: { color: '#d92b2b', filling: 0.3 } },
    { object: 'O', properties: { visible: false } },
  ];
  const effects = [
    { object: 'circ', field: 'color', before: '#1F4EFF', after: '#D92B2B' },
    { object: 'circ', field: 'filling', before: 0.5, after: 0.3000000001 },
    { object: 'O', field: 'visible', before: true, after: false },
  ];
  requireEffects(edits, effects);
  const rejected = (list: any[], pattern: RegExp) =>
    assert.throws(() => requireEffects(edits, list), (error: unknown) =>
      error instanceof ToolError && error.code === 'edit_no_effect' &&
      pattern.test(error.message));
  rejected(effects.slice(0, 2), /no observed effect/);
  rejected(effects.map(item => item.field === 'filling' ?
    { ...item, after: 0.5 } : item), /no observed effect/);
  rejected(effects.map(item => item.field === 'color' ?
    { ...item, after: '#000000' } : item), /no observed effect/);
});
