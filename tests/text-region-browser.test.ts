/** @fileoverview Real Text, point/vector and constrained-region contrasts. */
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import test from 'node:test';
import type {Page} from 'playwright';
import {openBrowser, runtimeVersion} from '../src/browser.js';
import {build} from '../src/delivery.js';
import {root} from '../src/server.js';

type Engine = Awaited<ReturnType<typeof openBrowser>>;
const evidenceRoot = resolve(process.env.GGB_TEXT_REGION_EVIDENCE_DIR
  ?? join(root, 'output/text-region-regression'));
const cases = [
  {id: 'semicolon', source: 'msg=Text("A; B",TAnchor)', type: 'text'},
  {id: 'inner-quote', source: String.raw`msg=Text("A; \"B\"",TAnchor)`,
    type: ''},
  {id: 'ascii-quote', source: 'msg=Text("A; "+UnicodeToLetter(34)'
    + '+"B"+UnicodeToLetter(34),TAnchor)', type: 'text'},
  {id: 'overescaped', source: String.raw`msg=Text(\"A; B\",TAnchor)`,
    type: ''},
  {id: 'numeric-point', source: 'msg=Text(n,TAnchor)', type: 'text'},
  {id: 'numeric-vector', source: 'msg=Text(n,q)', type: ''},
  {id: 'dynamic', source: 'msg=Text("n = "+n,TAnchor)', type: 'text'},
];

async function pageFor(engine: Engine, input: boolean): Promise<Page> {
  const context = engine.browser.contexts()[0];
  assert.ok(context);
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
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

async function submitInput(page: Page, source: string): Promise<void> {
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
    window.ggb.getAllObjectNames().includes('msg')
    || document.querySelector('[role="alert"]')?.textContent?.trim());
}

async function contrast(engine: Engine, input: boolean,
  item: typeof cases[number]): Promise<void> {
  const page = await pageFor(engine, input);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', event => {
    if (event.type() === 'error') errors.push(event.text());
  });
  try {
    const setup = await page.evaluate(async () => {
      const values = [];
      for (const source of ['TAnchor=(0,4)', 'q=(0,4)', 'n=3']) {
        values.push({source,
          raw: await window.ggb.asyncEvalCommandGetLabels(source)});
      }
      return values;
    });
    let raw: string | null = null;
    if (input) await submitInput(page, item.source);
    else raw = await page.evaluate(source =>
      window.ggb.asyncEvalCommandGetLabels(source), item.source);
    const observed = await page.evaluate(() => ({
      anchor: window.ggb.getObjectType('TAnchor'),
      q: window.ggb.getObjectType('q'),
      type: window.ggb.getObjectType('msg'),
      defined: window.ggb.isDefined('msg'),
      text: window.ggb.getValueString('msg', false),
      xml: window.ggb.getXML(),
    }));
    const prefix = `${input ? 'input' : 'async'}-${item.id}`;
    await writeFile(join(evidenceRoot, prefix + '.json'), JSON.stringify({
      source: item.source, setup, raw, rawApplicable: !input, observed, errors,
      engineErrors: await page.locator('[role="alert"]').allTextContents(),
      runtime: await runtimeVersion(page),
    }, null, 2));
    await page.screenshot({path: join(evidenceRoot, prefix + '.png')});
    assert.equal(observed.anchor, 'point');
    assert.equal(observed.q, 'vector');
    assert.equal(observed.type, item.type);
    assert.equal(observed.defined, item.type === 'text');
    if (!input) assert.equal(raw, item.type ? 'msg' : null);
  } finally {await page.close();}
}

test('input and async distinguish literal escaping from anchor types',
  {timeout: 180_000}, async t => {
    await mkdir(evidenceRoot, {recursive: true});
    const engine = await openBrowser(false);
    try {
      for (const input of [true, false]) for (const item of cases) {
        await t.test(`${input ? 'input' : 'async'}: ${item.id}`,
          () => contrast(engine, input, item));
      }
    } finally {await engine.close();}
  });

test('a free point can leave a region; PointIn keeps the closed-region relation',
  {timeout: 30_000}, async () => {
    await mkdir(evidenceRoot, {recursive: true});
    const engine = await openBrowser(false);
    try {
      const page = await engine.page();
      const result = await page.evaluate(async () => {
        const setup = [];
        for (const source of ['A=(0,0)', 'B=(6,0)', 'C=(1.5,4)',
          'tri=Polygon({A,B,C})', 'P=(2.4,1.2)', 'Q=PointIn(tri)',
          'pInside=IsInRegion(P,tri)', 'qInside=IsInRegion(Q,tri)']) {
          setup.push({source,
            raw: await window.ggb.asyncEvalCommandGetLabels(source)});
        }
        window.ggb.setCoords('Q', 2.4, 1.2);
        const before = window.ggb.getXML();
        window.ggb.setCoords('P', 20, 20);
        window.ggb.setCoords('Q', 20, 20);
        return {setup, before, after: window.ggb.getXML(),
          pInside: window.ggb.getValue('pInside'),
          qInside: window.ggb.getValue('qInside'),
          qDefined: window.ggb.isDefined('Q'),
          q: [window.ggb.getXcoord('Q'), window.ggb.getYcoord('Q')],
          edgeResidual: 4 * (window.ggb.getXcoord('Q') - 6)
            + 4.5 * window.ggb.getYcoord('Q')};
      });
      await writeFile(join(evidenceRoot, 'region.json'),
        JSON.stringify(result, null, 2));
      await page.screenshot({path: join(evidenceRoot, 'region.png')});
      assert.equal(result.pInside, 0);
      assert.equal(result.qInside, 1);
      assert.equal(result.qDefined, true);
      assert.ok(Math.abs(result.edgeResidual) < 1e-8);
    } finally {await engine.close();}
  });

test('positive weights keep strict interior, dependency and Text after reload',
  {timeout: 120_000}, async () => {
    await mkdir(evidenceRoot, {recursive: true});
    const request = JSON.parse(await readFile(join(root,
      'examples/v2-cases/interior-triangle.json'), 'utf8'));
    request.outputDir = join(evidenceRoot, 'accepted');
    const result = await build(request);
    const report = JSON.parse(await readFile(result.report, 'utf8'));
    await writeFile(join(evidenceRoot, 'delivery.json'),
      JSON.stringify(result, null, 2));
    assert.equal(report.construction.status, 'passed');
    assert.equal(report.reload.status, 'passed');
    assert.equal(report.interaction.samples.length, 2);
    assert.ok(report.interaction.samples.every(
      (sample: {after: {status: string}}) => sample.after.status === 'passed'));
  });
