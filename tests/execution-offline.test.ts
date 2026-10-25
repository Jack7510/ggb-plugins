/** @fileoverview Exercises the real execution bridge with a simulated applet. */
import assert from 'node:assert/strict';
import test, {mock} from 'node:test';
import {runInNewContext} from 'node:vm';
import {mkdtemp, readFile, readdir, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import type {Page} from 'playwright';
import * as browser from '../src/browser.js';
import {compile} from '../src/compile.js';
import {parseRequest, ToolError} from '../src/schema.js';
import {canonicalJson} from '../src/host-protocol.js';

type Fault = 'none' | 'initial-undefined' | 'initial-throw' | 'command' |
  'style-loss' | 'command-null' | 'command-extra';
interface NativeReply {id: string; raw: string | null; defined?: boolean;}
interface State {defined: boolean; x: number; y: number; type: string;}

/** No GeoGebra algorithm runs here: states and faults are explicit fixtures. */
function applet(fault: Fault, reply?: NativeReply) {
  const objects = new Map<string, State>();
  const commands: string[] = [];
  const coordinates: unknown[][] = [];
  const api = {
    getAllObjectNames: () => [...objects.keys()],
    isDefined: (id: string) => objects.get(id)?.defined ?? false,
    getObjectType: (id: string) => objects.get(id)?.type ?? '',
    isMoveable: (id: string) => id === 'A',
    getXcoord: (id: string) => objects.get(id)?.x ?? NaN,
    getYcoord: (id: string) => objects.get(id)?.y ?? NaN,
    async asyncEvalCommandGetLabels(source: string) {
      commands.push(source);
      const id = /^([^=:]+)[=:]/u.exec(source)?.[1]?.trim();
      assert.ok(id);
      if (fault === 'command' && id === 'A') throw new Error('first engine error');
      if (fault === 'command-null' && id === 'A') return null;
      if (reply?.id === id && reply.raw === null) return null;
      const type = id === 'p' ? 'parabola' : id === 'd' || id === 'l'
        ? 'line' : id === 's' ? 'segment' : 'point';
      objects.set(id, {defined: reply?.id === id ? reply.defined ?? true : true,
        x: -1, y: 0, type});
      if (reply?.id === id) return reply.raw;
      return fault === 'command-extra' && id === 'A' ? 'A,Z' : id;
    },
    setCoords(id: string, x: number, y: number) {
      coordinates.push([id, x, y]);
      if (fault === 'initial-throw') throw new Error('first setCoords error');
      const state = objects.get(id)!;
      Object.assign(state, {x, y, defined: fault !== 'initial-undefined'});
      if (!state.defined) state.x = state.y = NaN;
    },
    getXML: () => '<geogebra><construction/></geogebra>',
    setPerspective() {}, setLabelVisible() {}, setLabelStyle() {},
    setLineThickness() {}, setAxesVisible() {}, setGridVisible() {},
    setCoordSystem() {}, setMode() {},
    getViewProperties: () => JSON.stringify({width: 600, height: 400}),
    getValueString: (id: string) => JSON.stringify(objects.get(id)),
    getColor: () => '#000000',
    setColor() {
      if (fault === 'style-loss') objects.get('A')!.defined = false;
    },
  };
  return {api, commands, coordinates, objects};
}

/** Serialize callbacks as Playwright does, but run in a Node VM, not a browser. */
function pageFor(world: ReturnType<typeof applet>): Page {
  const sandbox = {window: {ggb: world.api},
    document: {title: '', querySelector: () => ({textContent: '', title: ''})},
    DOMParser: class {parseFromString() {return {querySelectorAll: () => []};}}};
  // This is an external Page boundary; only evaluate is used by these fixtures.
  return {evaluate: async (callback: Function, input: unknown) =>
    structuredClone(await runInNewContext(`(${callback.toString()})(input)`,
      {...sandbox, input}))} as unknown as Page;
}

function request(outputDir = '/tmp/offline-execution') {
  return parseRequest({protocolVersion: 2, prompt: 'point on directrix',
    locale: 'en', outputDir, title: 'offline', plan: {
      program: [
        {id: 'p', op: 'native', mode: 'algebra', source: 'p: y^2=4x'},
        {id: 'F', op: 'native', mode: 'algebra', source: 'F=Focus(p)'},
        {id: 'd', op: 'native', mode: 'algebra', source: 'd=Directrix(p)'},
        {id: 'A', op: 'native', mode: 'algebra', source: 'A=Point(d)',
          outputs: ['A'], initial: [-1, 2]},
        {id: 's', op: 'native', mode: 'algebra', source: 's=Segment(F,A)'},
      ], requirements: [{id: 'point', source: 'point on directrix', checks: [
        {kind: 'exists', subjects: ['A'], scope: 'initial'},
      ]}], interactions: [], view: {xMin: -2, xMax: 5, yMin: -3, yMax: 3},
      styles: [{object: 'p', properties: {color: '#123456'}}],
    }});
}

/** All replies are injected fixtures, not claims about engine syntax. */
function failureRequest(id: string, source: string,
  outputDir = '/tmp/offline-native-hints') {
  return parseRequest({protocolVersion: 2, prompt: 'native error',
    locale: 'en', outputDir, title: 'hint', plan: {
      program: [
        ...['P', 'B', 'C'].map((id, index) => ({id, op: 'native',
          mode: 'algebra', source: `${id}=(${index},1)`})),
        {id: 'L', source: 'L={P,B,C}', op: 'native', mode: 'algebra'},
        {id: 'S', source: 'S=Vector(P,B)', op: 'native', mode: 'algebra'},
        {id, source, op: 'native', mode: 'algebra', outputs: [id]},
        {id: 'Tail', source: 'Tail=(1,1)', op: 'native', mode: 'algebra'},
      ], requirements: [{id: 'native', source: 'native error', checks: [
        {kind: 'exists', subjects: [id], scope: 'initial'},
      ]}], interactions: [],
    }});
}

const hintCases = [
  {id: 'T', source: 'T=Polygon(P,B,C)', raw: 'T,c,p,b'},
  {id: 'T_{1}', source: 'T_{1}=Polygon(P,B,C)', raw: 'T_{1},c,p,b'},
  {id: 'T_{2}', source: 'T_{2}=Polygon[P,B,C]', raw: 'T_{2},c,p,b'},
  {id: 'T_{3}', source: 'T_{3}=Polygon(Element(L,1),B,C)',
    raw: 'T_{3},c,p,b'},
  {id: 'T_{4}', source: 'T_{4}: Polygon[Element[L,1],B,C]',
    raw: 'T_{4},c,p,b'},
  {id: 'T_{5}', source: 'T_{5}=Polygon(' + ' '.repeat(600) + 'P,B,C)',
    raw: 'T_{5},c,p,b'},
  {id: 'E_{1}', source: 'E_{1}=Round(Length(S),6)', raw: null},
  {id: 'E_{2}', source: 'E_{2}=Round[Length[S],6]', raw: null},
];
for (const item of hintCases) {
  test(`execute preserves first failure and adds guidance: ${item.id}`,
    async () => {
      const world = applet('none', item);
      await assert.rejects(browser.execute(pageFor(world),
        compile(failureRequest(item.id, item.source)), 'native error'), error => {
        assert.ok(error instanceof ToolError);
        assert.equal(error.code, 'execution_failed');
        assert.match(error.message, item.raw === null
          ? /^Execution failed or output undefined:/u
          : /^Incomplete native outputs:/u);
        assert.match(error.message, item.raw === null
          ? /unrounded residuals and area sums/u : /Polygon\(\{/u);
        if (item.raw !== null) {
          assert.match(error.message, /preserve.*dependencies, requirements/u);
          assert.match(error.message, /do not replace required objects/u);
          assert.match(error.message, /first repair this step outputs/u);
          assert.partialDeepStrictEqual(error.details, {actual: {
            outputs: item.raw.split(',')}});
        }
        assert.partialDeepStrictEqual(error.details, {stepId: item.id,
          source: item.source.slice(0, 512), operation: 'outputs',
          expected: {outputs: [item.id]}, actual: {rawLabels: item.raw}});
        return true;
      });
      assert.equal(world.commands.includes('Tail=(1,1)'), false);
    });
}

for (const item of [
  {id: 'T', source: 'T=Polygon({P,B,C})', raw: 'T,Z'},
  {id: 'T', source: 'T=Polygon(Sequence(P,k,1,3))', raw: 'T,Z'},
  {id: 'T', source: 'T=Segment(P,B)', raw: 'T,Z'},
  {id: 'err', source: 'err=round(Length(S),6)', raw: null},
  {id: 'err', source: 'err=Round(Length(S),6)', raw: 'err', defined: false},
]) {
  test(`execute does not guess a repair for ${item.source}`, async () => {
    const world = applet('none', item);
    await assert.rejects(browser.execute(pageFor(world),
      compile(failureRequest(item.id, item.source)), 'native error'), error => {
      assert.ok(error instanceof ToolError);
      assert.equal(error.code, 'execution_failed');
      assert.doesNotMatch(error.message, /face-only|built-in rounding/u);
      if (item.raw?.includes(',')) {
        assert.match(error.message, /first repair this step outputs/u);
        assert.match(error.message, /preserve source, IDs, dependencies/u);
      }
      return true;
    });
  });
}

test('Point(d) plus initial succeeds through the bridge when the applet supports it', async () => {
  const world = applet('none');
  await browser.execute(pageFor(world), compile(request()), 'point on directrix');
  assert.deepEqual(world.coordinates, [['A', -1, 2]]);
  assert.equal(world.objects.get('A')!.defined, true);
  assert.ok(world.commands.includes('s=Segment(F,A)'));
});

for (const fault of ['initial-undefined', 'initial-throw', 'command'] as const) {
  test(`the first step failure survives the applet realm: ${fault}`, async () => {
    const world = applet(fault);
    await assert.rejects(browser.execute(pageFor(world), compile(request()),
      'point on directrix'), error => {
      assert.ok(error instanceof ToolError);
      assert.equal(error.code, 'execution_failed');
      assert.doesNotThrow(() => canonicalJson(error.details));
      if (fault === 'initial-undefined') {
        assert.partialDeepStrictEqual(error.details,
          {actual: {defined: false, x: null, y: null}});
      }
      assert.partialDeepStrictEqual(error.details, {stepId: 'A',
        source: 'A=Point(d)', operation: fault === 'command' ? 'command' : 'initial',
        expected: {coordinates: [-1, 2]}});
      return true;
    });
    assert.equal(world.commands.includes('s=Segment(F,A)'), false);
  });
}

for (const fault of ['command-null', 'command-extra'] as const) {
  test(`raw native return survives normalization: ${fault}`, async () => {
    const world = applet(fault);
    await assert.rejects(browser.execute(pageFor(world), compile(request()),
      'point on directrix'), error => {
      assert.ok(error instanceof ToolError);
      const actual = fault === 'command-null'
        ? {rawLabels: null, outputs: null}
        : {rawLabels: 'A,Z', outputs: ['A', 'Z']};
      assert.partialDeepStrictEqual(error.details, {stepId: 'A',
        source: 'A=Point(d)', operation: 'outputs', actual});
      assert.doesNotThrow(() => canonicalJson(error.details));
      return true;
    });
    assert.equal(world.commands.includes('s=Segment(F,A)'), false);
  });
}

let world = applet('none');
let closed = 0;
let observed = 0;
let cleanupFails = false;
mock.module('../src/browser.js', {namedExports: {...browser,
  async openBrowser() {return {page: async () => pageFor(world),
    async close() {closed++; if (cleanupFails) throw new Error('secondary cleanup error');}};},
  async observe() {observed++; throw new Error('must not reach verification');},
}});
const {build} = await import('../src/delivery.js');

for (const fault of ['initial-undefined', 'initial-throw', 'command', 'style-loss'] as const) {
  test(`delivery journals the first failure, closes resources, and never exports: ${fault}`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'execution-journal-'));
    world = applet(fault); closed = observed = 0; cleanupFails = true;
    try {
      await assert.rejects(build(request(root)), error => {
        assert.ok(error instanceof ToolError);
        assert.equal(error.code, fault === 'style-loss' ?
          'presentation_invariant_failed' : 'execution_failed');
        return true;
      });
      const journal = JSON.parse(await readFile(join(root, 'offline/run.json'), 'utf8'));
      assert.equal(journal.state, 'failed');
      if (fault === 'style-loss') {
        assert.equal(journal.error.details.cause.object, 'p');
        assert.equal(journal.error.details.cause.field, 'color');
      } else {
        assert.equal(journal.error.details.cause.stepId, 'A');
        assert.equal(journal.error.details.cause.source, 'A=Point(d)');
      }
      assert.match(JSON.stringify(journal.diagnostics), /secondary cleanup error/);
      assert.equal(closed, 1);
      assert.equal(observed, 0);
      assert.equal((await readdir(join(root, 'offline'))).includes('delivery'), false);
    } finally {await rm(root, {recursive: true, force: true});}
  });
}


for (const item of [hintCases[3]!, hintCases[7]!]) {
  test(`delivery journals the same native repair guidance: ${item.id}`,
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'native-hint-journal-'));
      world = applet('none', item); closed = observed = 0; cleanupFails = false;
      try {
        let firstMessage = '';
        await assert.rejects(build(failureRequest(item.id, item.source, root)),
          error => {
            assert.ok(error instanceof ToolError);
            assert.equal(error.code, 'execution_failed');
            firstMessage = error.message;
            assert.match(firstMessage, item.raw === null
              ? /unrounded residuals/u : /Polygon\(\{/u);
            return true;
          });
        const path = join(root, 'hint');
        const journal = JSON.parse(await readFile(join(path, 'run.json'),
          'utf8'));
        assert.equal(journal.error.message, firstMessage);
        assert.equal(journal.error.details.cause.stepId, item.id);
        assert.equal(journal.error.details.cause.actual.rawLabels, item.raw);
        assert.equal((await readdir(path)).includes('delivery'), false);
        assert.equal(closed, 1);
        assert.equal(observed, 0);
      } finally {await rm(root, {recursive: true, force: true});}
    });
}
