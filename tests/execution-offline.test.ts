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
  'style-loss';
interface State {defined: boolean; x: number; y: number; type: string;}

/** No GeoGebra algorithm runs here: states and faults are explicit fixtures. */
function applet(fault: Fault) {
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
      const type = id === 'p' ? 'parabola' : id === 'd' || id === 'l'
        ? 'line' : id === 's' ? 'segment' : 'point';
      objects.set(id, {defined: true, x: -1, y: 0, type});
      return id;
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
          initial: [-1, 2]},
        {id: 's', op: 'native', mode: 'algebra', source: 's=Segment(F,A)'},
      ], requirements: [{id: 'point', source: 'point on directrix', checks: [
        {kind: 'exists', subjects: ['A'], scope: 'initial'},
      ]}], interactions: [], view: {xMin: -2, xMax: 5, yMin: -3, yMax: 3},
      styles: [{object: 'p', properties: {color: '#123456'}}],
    }});
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
