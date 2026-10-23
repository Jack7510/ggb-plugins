/** @fileoverview Reproduces and repairs directrix path state in the real engine. */
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import test from 'node:test';
import type {Page} from 'playwright';
import {applyStyles, dragPoint, exportGgb, loadGgb, openBrowser, snapshot,
  zoom} from '../src/browser.js';
import {build, openPreview} from '../src/delivery.js';
import {runtimeCompatibility} from '../src/runtime-compatibility.js';
import {root} from '../src/server.js';
import type {Request} from '../src/schema.js';

const evidenceRoot = resolve(process.env.GGB_TEST_EVIDENCE_DIR
  ?? join(root, 'output/path-point-regression'));
type Engine = Awaited<ReturnType<typeof openBrowser>>;
type Stage = Awaited<ReturnType<typeof recordState>>;

async function recordState(page: Page, label: string) {
  return page.evaluate(label => {
    const parameter = window.ggb.isDefined('A')
      ? window.ggb.getValue('PathParameter(A)') : NaN;
    return {label, xml: window.ggb.getXML(),
    parameter: Number.isFinite(parameter) ? parameter : null,
    parameterFinite: Number.isFinite(parameter),
    objects: window.ggb.getAllObjectNames().map(name => ({name,
      defined: window.ggb.isDefined(name),
      command: window.ggb.getCommandString(name, false),
      value: window.ggb.getValueString(name, false),
      x: window.ggb.getObjectType(name) === 'point'
        ? window.ggb.getXcoord(name) : null,
      y: window.ggb.getObjectType(name) === 'point'
        ? window.ggb.getYcoord(name) : null,
    }))};
  }, label);
}

async function command(page: Page, source: string): Promise<void> {
  assert.ok(await page.evaluate(source =>
    window.ggb.asyncEvalCommandGetLabels(source), source));
}

async function construct(page: Page, derived: boolean, initial: boolean,
  stages: Stage[]): Promise<void> {
  for (const source of ['p: y^2=4x', 'F=Focus(p)',
    derived ? 'd=Directrix(p)' : 'd: x=-1', 'A=Point(d)']) {
    await command(page, source);
    stages.push(await recordState(page, source));
  }
  if (initial) {
    await page.evaluate(() => window.ggb.setCoords('A', -1, 3));
    stages.push(await recordState(page, 'initial'));
  }
  for (const source of ['s=Segment(F,A)', 'M=Midpoint(s)',
    'b=PerpendicularBisector(s)']) await command(page, source);
  stages.push(await recordState(page, 'dependents'));
}

async function compareCase(engine: Engine, original: Buffer,
  raw: boolean, derived: boolean, initial: boolean): Promise<void> {
  const name = `${raw ? 'original' : 'fixed'}-`
    + `${derived ? 'derived' : 'ordinary'}-${initial ? 'initial' : 'default'}`;
  const context = engine.browser.contexts()[0];
  assert.ok(context);
  if (raw) await context.route('**/6.cache.js', route =>
    route.fulfill({body: original, contentType: 'text/javascript'}));
  const stages: Stage[] = [];
  let page: Page | undefined;
  try {
    page = await engine.page();
    await construct(page, derived, initial, stages);
    const data = await exportGgb(page);
    await writeFile(join(evidenceRoot, `${name}.ggb`),
      Buffer.from(data, 'base64'));
    await page.evaluate(() => window.ggb.setLabelVisible('p', true));
    stages.push(await recordState(page, 'p.labelVisible'));
    await page.screenshot({path: join(evidenceRoot, `${name}.png`)});
    await loadGgb(page, data);
    stages.push(await recordState(page, 'reload-before-style'));
    const defined = !(raw && derived);
    for (const stage of stages.slice(-2)) {
      for (const id of ['A', 's', 'M', 'b']) {
        assert.equal(stage.objects.find(o => o.name === id)?.defined,
          defined, `${name}: ${stage.label}: ${id}`);
      }
    }
    const constructed = stages.find(s => s.label === 'dependents');
    assert.ok(constructed?.objects.find(o => o.name === 'A')?.defined);
    assert.equal(constructed.parameterFinite, defined,
      'The original engine already has a nonfinite path parameter');
  } finally {
    await writeFile(join(evidenceRoot, `${name}.json`),
      JSON.stringify(stages, null, 2));
    await page?.close();
    if (raw) await context.unroute('**/6.cache.js');
  }
}

test('real engine matrix isolates the first visible loss to update or reload',
  {timeout: 120_000}, async t => {
    await mkdir(evidenceRoot, {recursive: true});
    const identity = runtimeCompatibility('5.4.932.1');
    const original = await readFile(join(root, '.runtime/GeoGebra',
      identity.asset));
    const engine = await openBrowser(false);
    try {
      for (const raw of [true, false]) {
        for (const derived of [false, true]) {
          for (const initial of [false, true]) await t.test(
            JSON.stringify({raw, derived, initial}), () =>
              compareCase(engine, original, raw, derived, initial));
        }
      }
    } finally {await engine.close();}
  });

function constructionRequest(): Request {
  return {protocolVersion: 2, prompt: 'Point on a moving directrix',
    locale: 'en', outputDir: join(evidenceRoot, 'delivery'), plan: {
      program: [
        ['q', 'q=Slider(1,2,1)'], ['p', 'p: y^2=4*q*x'],
        ['F', 'F=Focus(p)'], ['d', 'd=Directrix(p)'],
        ['A', 'A=Point(d)'], ['s', 's=Segment(F,A)'],
        ['M', 'M=Midpoint(s)'], ['b', 'b=PerpendicularBisector(s)'],
      ].map(([id, source]) => ({id: id!, source: source!, op: 'native',
        mode: 'algebra', ...(id === 'A' ? {initial: [-1, 3] as [number, number]} : {})})),
      requirements: [{id: 'path', source: 'Point on a moving directrix',
        checks: [
          {kind: 'pointOn', subjects: ['A', 'd'], scope: 'sampled'},
          {kind: 'coordinate', subjects: ['A'], coordinates: [-1, 3],
            scope: 'initial'},
          {kind: 'expression', subjects: ['A', 'd'],
            expression: 'Distance(A,d)', mode: 'algebra', expected: 0,
            scope: 'sampled'},
          {kind: 'expression', subjects: ['b', 'F', 'A'],
            expression: 'ArePerpendicular(b,Line(F,A))', mode: 'algebra',
            expected: true, scope: 'sampled'},
        ]}],
      interactions: [{point: 'A', dx: 0, dy: 40},
        {parameter: 'q', value: 2}],
      styles: [
        {object: 'p', properties: {labelVisible: true, color: '#123456'}},
        {object: 'd', properties: {labelVisible: true, caption: 'directrix'}},
      ], view: {xMin: -5, xMax: 5, yMin: -5, yMax: 5},
    }};
}

async function audit(page: Page, label: string): Promise<void> {
  const before = await page.evaluate(() => window.ggb.getXML());
  let facts;
  try {facts = await snapshot(page);}
  catch (error) {
    await writeFile(join(evidenceRoot, `${label}-audit-failure.json`),
      JSON.stringify({before, after: await page.evaluate(() =>
        window.ggb.getXML())}, null, 2));
    throw error;
  }
  const point = facts.find(o => o.name === 'A');
  assert.ok(point?.defined && point.moveable && !point.independent);
  assert.ok(point.inputs.includes('d') && point.inputs.includes('p')
    && point.inputs.includes('q'));
  assert.equal(point.command, 'Point[d]');
  for (const id of ['d', 's', 'M', 'b']) {
    assert.ok(facts.find(o => o.name === id)?.defined);
  }
  const line = facts.find(o => o.name === 'd')?.line;
  assert.ok(line && point.x !== null && point.y !== null);
  assert.ok(Math.abs(line[0]! * point.x + line[1]! * point.y
    + line[2]!) < 1e-8);
  await writeFile(join(evidenceRoot, `${label}.json`),
    JSON.stringify({facts, xml: await page.evaluate(() =>
      window.ggb.getXML())}, null, 2));
}

/** Wait for the native zoom animation, not just its first scale change. */
async function settledView(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((done, reject) => {
    const timer = setTimeout(() => reject(new Error('View did not settle')),
      5000);
    let previous = '', stable = 0;
    const frame = () => {
      const view = window.ggb.getViewProperties(1);
      stable = view === previous ? stable + 1 : 0;
      previous = view;
      if (stable >= 5) {clearTimeout(timer); done();}
      else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }));
}

test('original Point(d) retains dependency, styling, dragging and reload',
  {timeout: 120_000}, async () => {
    await mkdir(evidenceRoot, {recursive: true});
    const result = await build(constructionRequest());
    const report = JSON.parse(await readFile(result.report, 'utf8'));
    assert.equal(report.construction.status, 'passed');
    assert.equal(report.reload.status, 'passed');
    assert.equal(report.interaction.samples.length, 2);
    const session = await openPreview(result.delivery, false);
    try {
      await audit(session.page, 'delivered');
      await applyStyles(session.page, [
        {object: 'p', properties: {labelVisible: false}},
        {object: 'd', properties: {labelVisible: false}},
      ]);
      await dragPoint(session.page, {point: 'A', dx: 0, dy: 30});
      await audit(session.page, 'after-mouse-drag');
      await session.page.evaluate(() => window.ggb.setValue('q', 2));
      assert.equal(await session.page.evaluate(() =>
        window.ggb.getXcoord('A')), -2);
      await audit(session.page, 'after-parent-update');
      await zoom(session.page);
      await settledView(session.page);
      const data = await exportGgb(session.page);
      await loadGgb(session.page, data);
      await settledView(session.page);
      await audit(session.page, 'after-second-reload');
      await session.page.screenshot({path: join(evidenceRoot, 'final.png')});
    } finally {await session.close();}
  });


test('ellipse and hyperbola directrix paths retain their original behavior',
  {timeout: 30_000}, async () => {
    await mkdir(evidenceRoot, {recursive: true});
    const engine = await openBrowser(false);
    try {
      for (const conic of ['Ellipse', 'Hyperbola']) {
        const page = await engine.page();
        try {
          for (const source of ['F1=(-2,0)', 'F2=(2,0)',
            `c=${conic}(F1,F2,${conic === 'Ellipse' ? 3 : 1})`,
            'd=Directrix(c)', 'A=Point(d)']) await command(page, source);
          await applyStyles(page, [
            {object: 'c', properties: {labelVisible: true}},
            {object: 'd', properties: {labelVisible: true}},
          ]);
          await page.evaluate(() => window.ggb.setCoords('F1', -3, 0));
          const data = await exportGgb(page);
          await loadGgb(page, data);
          const facts = await snapshot(page);
          const point = facts.find(o => o.name === 'A');
          assert.ok(point?.defined && point.inputs.includes('d')
            && point.inputs.includes('c'));
          await writeFile(join(evidenceRoot, `${conic}.json`),
            JSON.stringify(facts, null, 2));
        } finally {await page.close();}
      }
    } finally {await engine.close();}
  });
