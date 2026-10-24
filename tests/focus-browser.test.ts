/** @fileoverview Compares native multi-output calls in the UI and async API. */
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import test from 'node:test';
import type {Page} from 'playwright';
import {execute, openBrowser, runtimeVersion}
  from '../src/browser.js';
import {build} from '../src/delivery.js';
import {compile} from '../src/compile.js';
import {parseRequest, ToolError} from '../src/schema.js';
import {root} from '../src/server.js';

type Engine = Awaited<ReturnType<typeof openBrowser>>;
type Transport = 'input' | 'async';
const evidenceRoot = resolve(process.env.GGB_FOCUS_EVIDENCE_DIR
  ?? join(root, 'output/focus-regression'));
const cases = [
  {id: 'focus', commands: ['Focus(ell)'], points: 2},
  {id: 'assigned', commands: ['F_1=Focus(ell)'], points: 2},
  {id: 'nested-first', commands: ['F_1=Element(Focus(ell),1)'], points: 0},
  {id: 'nested-second', commands: ['F_2=Element(Focus(ell),2)'], points: 0},
  {id: 'plain-name', commands: ['F1=Element(Focus(ell),1)'], points: 0},
  {id: 'saved-list', commands: ['L={Focus(ell)}',
    'F_1=Element(L,1)', 'F_2=Element(L,2)'], points: 2},
  {id: 'nested-list', commands: ['F_1=Element({Focus(ell)},1)',
    'F_2=Element({Focus(ell)},2)'], points: 2},
  {id: 'literal-list', commands: ['F_1=Element({(-1,0),(1,0)},1)'], points: 1},
];

async function inputPage(engine: Engine): Promise<Page> {
  const context = engine.browser.contexts()[0];
  assert.ok(context);
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  await page.route(engine.url + '/', async route => {
    const response = await route.fetch();
    // Change only the visible input controls, not the engine or command parser.
    const html = (await response.text())
      .replace("perspective: 'G'", "perspective: 'AG'")
      .replace('showAlgebraInput: false', 'showAlgebraInput: true');
    await route.fulfill({response, body: html});
  });
  await page.goto(engine.url);
  await page.waitForFunction(() => typeof window.ggb?.getXML === 'function');
  return page;
}

async function pasteInput(page: Page, source: string): Promise<void> {
  const count = await page.evaluate(() => window.ggb.getAllObjectNames().length);
  await page.locator('.avInputItem').click();
  // Paste through the native editor. insertText does not submit its math model.
  await page.locator('textarea').evaluate((element, text) => {
    const data = new DataTransfer();
    data.setData('text/plain', text);
    element.dispatchEvent(new ClipboardEvent('paste', {
      clipboardData: data, bubbles: true, cancelable: true,
    }));
  }, source);
  await page.keyboard.press('Enter');
  await page.waitForFunction(before =>
    window.ggb.getAllObjectNames().length > before
      || document.querySelector('[role="alert"]')?.textContent
        ?.includes('Illegal argument'), count);
}

async function objects(page: Page) {
  return page.evaluate(() => window.ggb.getAllObjectNames().map(name => {
    const type = window.ggb.getObjectType(name);
    return {name, type, defined: window.ggb.isDefined(name),
      command: window.ggb.getCommandString(name, false),
      value: window.ggb.getValueString(name, false),
      independent: window.ggb.isIndependent(name),
      x: type === 'point' ? window.ggb.getXcoord(name) : null,
      y: type === 'point' ? window.ggb.getYcoord(name) : null};
  }));
}

async function submit(page: Page, transport: Transport, source: string) {
  let raw: string | null = null;
  let error: string | null = null;
  try {
    if (transport === 'input') await pasteInput(page, source);
    else raw = await page.evaluate(source =>
      window.ggb.asyncEvalCommandGetLabels(source), source);
  } catch (cause) {error = String(cause);}
  return {source, raw, error,
    // Input has no return value; raw:null means not applicable for that path.
    rawApplicable: transport === 'async', objects: await objects(page),
    engineError: await page.locator('[role="alert"]').allTextContents()};
}

async function compare(engine: Engine, transport: Transport,
  item: typeof cases[number]): Promise<void> {
  const page = await inputPage(engine);
  const consoleEvents: {type: string; text: string}[] = [];
  const stages: Awaited<ReturnType<typeof submit>>[] = [];
  page.on('console', message => consoleEvents.push({type: message.type(),
    text: message.text()}));
  page.on('pageerror', error => consoleEvents.push({type: 'pageerror',
    text: error.message}));
  try {
    stages.push(await submit(page, transport, 'ell: 2x^2+3y^2=6'));
    for (const source of item.commands) {
      stages.push(await submit(page, transport, source));
    }
    assert.ok(stages.every(stage => stage.error === null));
    const final = stages.at(-1);
    assert.ok(final);
    const points = final.objects.filter(object => object.type === 'point');
    assert.equal(points.length, item.points);
    assert.ok(points.every(point => point.defined && !point.independent));
    assert.ok(points.every(point => Math.abs(Math.abs(point.x!) - 1) < 1e-9
      && Math.abs(point.y!) < 1e-9));
    if (item.points === 0) {
      if (transport === 'async') assert.equal(final.raw, null);
      else assert.match(final.engineError.join('\n'),
        /Illegal argument: Point Focus\(ell\)/u);
    }
  } finally {
    const prefix = join(evidenceRoot, `${transport}-${item.id}`);
    await page.screenshot({path: prefix + '.png'});
    await writeFile(prefix + '.json', JSON.stringify({transport,
      version: await runtimeVersion(page), browser: engine.browser.version(),
      stages, consoleEvents, xml: await page.evaluate(() => window.ggb.getXML()),
    }, null, 2));
    await page.close();
  }
}

test('input and async API agree on Focus, list wrapping and Element nesting',
  {timeout: 180_000}, async t => {
    await mkdir(evidenceRoot, {recursive: true});
    const engine = await openBrowser(false);
    try {
      for (const transport of ['input', 'async'] as const) {
        for (const item of cases) {
          await t.test(`${transport}: ${item.id}`, () =>
            compare(engine, transport, item));
        }
      }
    } finally {await engine.close();}
  });

test('failed native nesting preserves the raw null without rewriting source',
  {timeout: 30_000}, async () => {
    await mkdir(evidenceRoot, {recursive: true});
    const source = 'F_1=Element(Focus(ell),1)';
    const request = parseRequest({protocolVersion: 2, prompt: 'ellipse focus',
      locale: 'en', outputDir: evidenceRoot, plan: {
        program: [
          {id: 'ell', source: 'ell: 2x^2+3y^2=6',
            op: 'native', mode: 'algebra'},
          {id: 'F_1', source, op: 'native', mode: 'algebra'},
        ], interactions: [],
        requirements: [{id: 'focus', source: 'ellipse focus', checks: [
          {kind: 'exists', subjects: ['F_1'], scope: 'initial'},
        ]}],
      }});
    const engine = await openBrowser(false);
    try {
      const page = await engine.page();
      let failure: ToolError | undefined;
      await assert.rejects(execute(page, compile(request), request.prompt),
        error => {
          assert.ok(error instanceof ToolError);
          assert.equal(error.code, 'execution_failed');
          assert.partialDeepStrictEqual(error.details, {source, stepId: 'F_1',
            operation: 'outputs', actual: {rawLabels: null, outputs: null,
              x: null, y: null}});
          failure = error;
          return true;
        });
      assert.ok(failure);
      await writeFile(join(evidenceRoot, 'bridge-failure.json'),
        JSON.stringify({code: failure.code, message: failure.message,
          details: failure.details}, null, 2));
      assert.deepEqual(await page.evaluate(() =>
        window.ggb.getAllObjectNames()), ['ell']);
    } finally {await engine.close();}
  });

test('explicit focus lists pass construction, dependency, reload and sampling',
  {timeout: 120_000}, async () => {
    await mkdir(evidenceRoot, {recursive: true});
    const input = JSON.parse(await readFile(join(root,
      'examples/v2-cases/ellipse-focus-list.json'), 'utf8'));
    input.outputDir = join(evidenceRoot, 'delivery');
    const result = await build(input);
    const report = JSON.parse(await readFile(result.report, 'utf8'));
    assert.equal(report.construction.status, 'passed');
    assert.equal(report.reload.status, 'passed');
    assert.equal(report.interaction.samples.length, 1);
    const sample = report.interaction.samples[0];
    assert.equal(sample.after.status, 'passed');
    const left = sample.after.objects.find((o: {name: string}) =>
      o.name === 'F_1');
    assert.ok(left);
    assert.ok(Math.abs(left.x + Math.sqrt(8)) < 1e-9);
    assert.ok(left.inputs.includes('ell'));
    await writeFile(join(evidenceRoot, 'delivery-result.json'),
      JSON.stringify(result, null, 2));
  });
