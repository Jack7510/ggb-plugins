/** @fileoverview Pins expression probe semantics and Polygon output identity. */
import assert from 'node:assert/strict';
import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import test from 'node:test';
import type {Page} from 'playwright';
import {openBrowser, runtimeVersion} from '../src/browser.js';
import {build} from '../src/delivery.js';
import {ToolError} from '../src/schema.js';
import {root} from '../src/server.js';

type Engine = Awaited<ReturnType<typeof openBrowser>>;
const evidenceRoot = resolve(process.env.GGB_EXPRESSION_EVIDENCE_DIR
  ?? join(root, 'output/expression-regression'));
const cases = [
  {id: 'vertex', expression: 'Vertex(tri,3)', type: 'point', defined: true},
  {id: 'residual', expression: 'Distance(Vertex(tri,3),F2)',
    type: 'numeric', defined: true, value: 0},
  {id: 'equation', expression: 'Distance(Vertex(tri,3),F2)=0',
    type: 'line', defined: false},
  {id: 'equality', expression: 'Distance(Vertex(tri,3),F2)==0',
    type: 'boolean', defined: true, value: 1},
  {id: 'tiny-threshold', expression: 'Distance(Vertex(tri,3),F2)<10^(-8)',
    type: 'boolean', defined: true, value: 0},
  {id: 'threshold-control', expression: '0<10^(-6)',
    type: 'boolean', defined: true, value: 1},
];

async function probePage(engine: Engine, input: boolean): Promise<Page> {
  const context = engine.browser.contexts()[0];
  assert.ok(context);
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  if (input) await page.route(engine.url + '/', async route => {
    const response = await route.fetch();
    await route.fulfill({response, body: (await response.text())
      .replace("perspective: 'G'", "perspective: 'AG'")
      .replace('showAlgebraInput: false', 'showAlgebraInput: true')});
  });
  await page.goto(engine.url);
  await page.waitForFunction(() => typeof window.ggb?.getXML === 'function');
  return page;
}

async function setup(page: Page) {
  return page.evaluate(async () => {
    const stages = [];
    for (const source of ['ell: 2x^2+3y^2=6', 'F1=(-1,0)', 'F2=(1,0)',
      'ang=Slider(π/6,5π/6,0.01)', 'Q=F1+(cos(ang),sin(ang))',
      'l=Line(F1,Q)', 'A=Intersect(ell,l,1)', 'B=Intersect(ell,l,2)',
      'tri=Polygon(A,B,F2)']) {
      stages.push({source, raw: await window.ggb.asyncEvalCommandGetLabels(source)});
    }
    return stages;
  });
}

async function paste(page: Page, source: string): Promise<void> {
  await page.locator('.avInputItem').click();
  await page.locator('textarea').evaluate((element, text) => {
    const data = new DataTransfer();
    data.setData('text/plain', text);
    element.dispatchEvent(new ClipboardEvent('paste', {
      clipboardData: data, bubbles: true, cancelable: true,
    }));
  }, source);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() =>
    window.ggb.getAllObjectNames().includes('GgbProbe0'));
}

async function compare(engine: Engine, input: boolean,
  item: typeof cases[number]): Promise<void> {
  const page = await probePage(engine, input);
  const consoleEvents: {type: string; text: string}[] = [];
  page.on('console', event => consoleEvents.push({type: event.type(),
    text: event.text()}));
  page.on('pageerror', error => consoleEvents.push({type: 'pageerror',
    text: error.message}));
  try {
    const stages = await setup(page);
    const source = `GgbProbe0=(${item.expression})`;
    let raw: string | null = null;
    if (input) await paste(page, source);
    else raw = await page.evaluate(source =>
      window.ggb.asyncEvalCommandGetLabels(source), source);
    const observed = await page.evaluate(() => ({
      type: window.ggb.getObjectType('GgbProbe0'),
      defined: window.ggb.isDefined('GgbProbe0'),
      value: window.ggb.getValue('GgbProbe0'),
      valueString: window.ggb.getValueString('GgbProbe0', false),
      command: window.ggb.getCommandString('GgbProbe0', false),
      xml: window.ggb.getXML(),
    }));
    await writeFile(join(evidenceRoot, `${input ? 'input' : 'async'}-${item.id}.json`),
      JSON.stringify({source, raw, rawApplicable: !input, stages, observed,
        engineErrors: await page.locator('[role="alert"]').allTextContents(),
        consoleEvents, version: await runtimeVersion(page)}, null, 2));
    assert.equal(observed.type, item.type);
    assert.equal(observed.defined, item.defined);
    if ('value' in item) assert.equal(observed.value, item.value);
    if (!input) assert.equal(raw, 'GgbProbe0');
    await page.screenshot({path: join(evidenceRoot,
      `${input ? 'input' : 'async'}-${item.id}.png`)});
  } finally {await page.close();}
}

test('input and exact async probe isolate equation, boolean and numeric results',
  {timeout: 120_000}, async t => {
    await mkdir(evidenceRoot, {recursive: true});
    const engine = await openBrowser(false);
    try {
      for (const input of [true, false]) {
        for (const item of cases) await t.test(
          `${input ? 'input' : 'async'}: ${item.id}`, () =>
            compare(engine, input, item));
      }
    } finally {await engine.close();}
  });

test('Polygon list input returns one stable label despite existing edge names',
  {timeout: 30_000}, async () => {
    await mkdir(evidenceRoot, {recursive: true});
    const engine = await openBrowser(false);
    const stages = [];
    try {
      for (const occupied of [false, true]) {
        const page = await engine.page();
        const result = await page.evaluate(async occupied => {
          for (const source of ['A=(-1,1)', 'B=(0,-1)', 'F2=(1,0)',
            ...(occupied ? ['a=1', 'b=2', 'f2=3'] : [])]) {
            await window.ggb.asyncEvalCommandGetLabels(source);
          }
          const raw = await window.ggb.asyncEvalCommandGetLabels(
            'tri=Polygon({A,B,F2})');
          return {occupied, raw, type: window.ggb.getObjectType('tri'),
            defined: window.ggb.isDefined('tri'), xml: window.ggb.getXML()};
        }, occupied);
        stages.push(result);
        assert.equal(result.raw, 'tri');
        assert.equal(result.type, 'triangle');
        assert.ok(result.defined);
        await page.close();
      }
    } finally {
      await writeFile(join(evidenceRoot, 'polygon-labels.json'),
        JSON.stringify(stages, null, 2));
      await engine.close();
    }
  });

test('numeric residual and list Polygon pass reload, dependencies and samples',
  {timeout: 120_000}, async () => {
    await mkdir(evidenceRoot, {recursive: true});
    const request = JSON.parse(await readFile(join(root,
      'examples/v2-cases/ellipse-focus-triangle.json'), 'utf8'));
    request.outputDir = join(evidenceRoot, 'accepted');
    const result = await build(request);
    const report = JSON.parse(await readFile(result.report, 'utf8'));
    assert.equal(report.construction.status, 'passed');
    assert.equal(report.reload.status, 'passed');
    assert.equal(report.interaction.samples.length, 2);
    assert.ok(report.interaction.samples.every(
      (sample: {after: {status: string}}) => sample.after.status === 'passed'));
    await writeFile(join(evidenceRoot, 'delivery.json'),
      JSON.stringify(result, null, 2));
    request.outputDir = join(evidenceRoot, 'rejected');
    const check = request.plan.requirements.at(-1).checks.at(-1);
    check.expression += '=0';
    check.expected = true;
    const message = 'expression unverified: probe returned line'
      + ' (defined=false); expected boolean';
    await assert.rejects(build(request), error => {
      assert.ok(error instanceof ToolError);
      assert.equal(error.code, 'verification_unverified');
      assert.ok(JSON.stringify(error.details).includes(message));
      return true;
    });
    for (const directory of await readdir(request.outputDir)) {
      const files = await readdir(join(request.outputDir, directory));
      assert.ok(!files.includes('delivery'));
    }
  });
