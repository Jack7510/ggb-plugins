/** @fileoverview Simulates applet state through real modify delivery gates. */
import assert from 'node:assert/strict';
import test, {mock} from 'node:test';
import {mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {runInNewContext} from 'node:vm';
import type {Page} from 'playwright';
import * as browser from '../src/browser.js';
import {validateParameterChanges} from '../src/modify.js';
import {parseRequest, ToolError, type Request} from '../src/schema.js';
import {validateDeliveryEvidence, summarizeHostVerification}
  from '../src/delivery-contract.js';

type Fault = 'none' | 'sample' | 'restore' | 'unrelated' | 'cancel' | 'leak';
let fault: Fault = 'none';
let baseSlider = false;
let abort: AbortController;
let closed = 0;
let reloadedPage: Page | undefined;
let pageCount = 0;
const changed: number[] = [];
const states = new WeakMap<Page, browser.Snapshot>();
const exported = new Map<string, browser.Snapshot>();

function fact(name: string, value: number): browser.Snapshot[number] {
  return {name, type: 'numeric', nativeType: 'numeric', value,
    defined: true, independent: true, moveable: true, fixed: false,
    command: '', nativeDefinition: null, expression: null,
    referenceState: 'direct', inputs: [], valueString: String(value),
    x: null, y: null, line: null, circle: null, conic: null, data: null,
    color: '#000000', visible: true, labelVisible: false, labelStyle: 0,
    lineThickness: 2, lineStyle: 0, filling: 0, caption: '',
    slider: name === 'n' ? {min: 3, max: 12, step: 1} : null};
}
function baseline(): browser.Snapshot {
  return [fact('b', 1), ...(baseSlider ? [fact('n', 3)] : [])];
}
function fakePage(): Page {
  // No browser opens: only the lifecycle methods used by delivery are supplied.
  const page = {close: async () => {},
    screenshot: async ({path}: {path: string}) => writeFile(path, 'preview'),
  } as unknown as Page;
  states.set(page, []);
  if (++pageCount === 2) reloadedPage = page;
  return page;
}
function observations(page: Page, request: Request): browser.Observation[] {
  const facts = states.get(page)!;
  const n = facts.find(f => f.name === 'n')!.value!;
  const q = facts.find(f => f.name === 'q')!.value!;
  return [{id: 'relation:1', expression: 'q-2*n', mode: 'algebra',
    type: 'numeric', defined: true, value: q - 2 * n, result: null}];
}
mock.module('../src/inspect.js', {namedExports: {
  async loadBase() {return {archive: {bytes: Buffer.from('base')}, summary: {
    version: '5.4.932.1', view: null,
    objects: baseline().map(f => ({name: f.name, type: f.type})),
  }};},
}});
mock.module('../src/browser.js', {namedExports: {...browser,
  async openBrowser() {return {page: async () => fakePage(),
    async close() {closed++;}};},
  async loadGgb(page: Page, data: string) {
    states.set(page, structuredClone(exported.get(data) ?? baseline()));
  },
  async execute(page: Page) {
    const b = states.get(page)!;
    if (!baseSlider) b.push(fact('n', 3));
    b.push({...fact('q', 6), independent: false, moveable: false,
      inputs: ['n'], expression: '2*n'});
  },
  async applyStyles() {return [];},
  async applyUpdates() {return [];},
  async snapshot(page: Page) {return structuredClone(states.get(page)!);},
  async observe(page: Page, request: Request) {
    return {objects: structuredClone(states.get(page)!),
      observations: observations(page, request),
      durations: {casMs: 0, probesMs: 0, valuesMs: 0, snapshotMs: 0}};
  },
  async exportGgb(page: Page) {
    const data = Buffer.from('delivered').toString('base64');
    exported.set(data, structuredClone(states.get(page)!));
    return data;
  },
  async interact(page: Page, sample: {parameter: string; value: number}) {
    changed.push(sample.value);
    if (fault === 'cancel') {
      abort.abort();
      throw new Error('cancelled');
    }
    const facts = states.get(page)!;
    facts.find(f => f.name === sample.parameter)!.value = sample.value;
    const q = facts.find(f => f.name === 'q')!;
    q.value = sample.value * 2 + (fault === 'sample' ? 1 : 0);
    if (fault === 'restore' && sample.value === 3) q.defined = false;
    if (fault === 'unrelated') facts.find(f => f.name === 'b')!.value = 99;
    if (fault === 'leak') {
      states.get(reloadedPage!)!.find(f => f.name === 'q')!.value = 99;
    }
    return 'native_value';
  },
  async zoom() {return {method: 'button', before: 1, after: 2};},
  async runtimeVersion() {return '5.4.932.1';},
}});
const {build} = await import('../src/delivery.js');

function request(outputDir: string): Request {
  return parseRequest({protocolVersion: 2, prompt: 'add a dependent value',
    locale: 'en', outputDir,
    base: {path: '/tmp/base.ggb', sha256: 'b'.repeat(64)},
    plan: {program: [
      ...(!baseSlider ? [{id: 'n', op: 'native', mode: 'algebra',
        source: 'n=Slider(3,12,1)'}] : []),
      {id: 'q', op: 'native', mode: 'algebra', source: 'q=2*n'},
    ], requirements: [{id: 'relation', source: 'dependent value', checks: [
      {kind: 'dependsOn', subjects: ['q', 'n'], scope: 'sampled'},
      {kind: 'expression', subjects: ['q', 'n'], expression: 'q-2*n',
        mode: 'algebra', expected: 0, scope: 'sampled'},
    ]}], interactions: [{parameter: 'n', value: 7},
      {parameter: 'n', value: 12}]}});
}

for (const existing of [false, true]) {
  test(`modify isolates/restores ${existing ? 'base' : 'new'} slider`,
    async () => {
    const dir = await mkdtemp(join(tmpdir(), 'modify-samples-'));
    fault = 'none';
    baseSlider = existing;
    abort = new AbortController();
    changed.length = closed = pageCount = 0;
    try {
      const input = request(dir);
      const result = await build(input);
      const report = JSON.parse(await readFile(result.report, 'utf8'));
      assert.deepEqual(changed, [7, 3, 12, 3]);
      assert.equal(report.interaction.status, 'passed');
      assert.equal(report.interaction.samples.length, 2);
      for (const sample of report.interaction.samples) {
        assert.equal(sample.before.find((f: {name: string}) =>
          f.name === 'n').value, 3);
        assert.equal(sample.roundTrip.value, 3);
        assert.equal(sample.roundTrip.after.status, 'passed');
      }
      assert.equal(report.reload.objects.find((f: {name: string}) =>
        f.name === 'n').value, 3);
      assert.equal(await readFile(result.file, 'utf8'), 'delivered');
      validateDeliveryEvidence(input, report, report.reload.objects);
      assert.equal(closed, 1);
      for (const mutate of [
        (v: typeof report) => {v.interaction.samples[0].value = 8;},
        (v: typeof report) => {v.interaction.samples[0].method = 'mouse';},
        (v: typeof report) => {v.interaction.samples.pop();},
        (v: typeof report) => {v.interaction.status = 'not_sampled';},
        (v: typeof report) => {
          v.interaction.samples[0].roundTrip.after.objects[0].value = 99;
        },
      ]) {
        const changedReport = structuredClone(report);
        mutate(changedReport);
        assert.throws(() => validateDeliveryEvidence(input, changedReport,
          changedReport.reload.objects));
      }
      delete report.interaction.samples[0].roundTrip;
      assert.throws(() => validateDeliveryEvidence(input, report,
        report.reload.objects), /round-trip/);
    } finally {await rm(dir, {recursive: true, force: true});}
  });
}
const failures = ['sample', 'restore', 'unrelated', 'cancel', 'leak'] as const;
for (const failure of failures) {
  test(`modify refuses ${failure} without committing a delivery`, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'modify-rejected-'));
    fault = failure;
    baseSlider = false;
    abort = new AbortController();
    changed.length = closed = pageCount = 0;
    try {
      await assert.rejects(build(request(dir), abort.signal), error => {
        assert.ok(error instanceof ToolError);
        if (failure === 'unrelated') assert.equal(error.code,
          'preservation_violation');
        return true;
      });
      const [run] = await readdir(dir);
      assert.ok(run);
      assert.ok(!(await readdir(join(dir, run))).includes('delivery'));
      assert.equal(closed, 1);
    } finally {await rm(dir, {recursive: true, force: true});}
  });
}

test('zero samples cannot imply passing interaction coverage', () => {
  const report = {construction: {status: 'passed', results: []},
    reload: {status: 'passed', results: []},
    interaction: {status: 'passed', samples: []}};
  assert.partialDeepStrictEqual(summarizeHostVerification(report),
    {interaction: {status: 'not_sampled', samples: 0}});
});


test('sampling preserves facts across normalized subtype changes', () => {
  const before = [fact('n', 3), {...fact('poly', 6), type: 'polygon',
    nativeType: 'triangle', independent: false, moveable: false,
    command: 'Polygon[vertices]', nativeDefinition: {
      name: 'Polygon', args: ['vertices'],
    }, inputs: ['n']}];
  const after = structuredClone(before);
  after[0]!.value = 7;
  after[1]!.nativeType = 'polygon';
  after[1]!.value = 14;
  validateParameterChanges(before, after, 'n', 7);
  for (const mutate of [
    (v: typeof after) => {v[1]!.type = 'circle';},
    (v: typeof after) => {v[1]!.inputs = [];},
    (v: typeof after) => {v[0]!.fixed = true;},
    (v: typeof after) => {v[0]!.labelVisible = true;},
    (v: typeof after) => {v[0]!.labelStyle = 3;},
    (v: typeof after) => {v.push(fact('extra', 9));},
    (v: typeof after) => {v.pop();},
  ]) {
    const changedFacts = structuredClone(after);
    mutate(changedFacts);
    assert.throws(() => validateParameterChanges(before, changedFacts, 'n', 7),
      error => error instanceof ToolError &&
        error.code === 'preservation_violation');
  }
});
