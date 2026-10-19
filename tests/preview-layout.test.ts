/** @fileoverview Verifies responsive teaching previews preserve GGB facts. */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import type { Page } from 'playwright';
import { snapshot } from '../src/browser.js';
import { build, openPreview, sha256 } from '../src/delivery.js';
import { parseRequest, type Request } from '../src/schema.js';
import { root } from '../src/server.js';
import { compareSnapshots } from '../src/verify.js';

/** Uses ordinary requests; presentation never changes mathematical checks. */
async function layoutRequest(
  display: 'graphics' | 'algebra', outputDir: string,
): Promise<Request> {
  if (display === 'graphics') {
    const input = JSON.parse(await readFile(join(root,
      'examples/v2-cases/slider-polygon.json'), 'utf8'));
    input.prompt += '，保留中文说明';
    input.plan.program.push({ id: 'msg', op: 'native', mode: 'algebra',
      source: 'msg=Text("中文说明",(-2,4))' });
    input.plan.requirements.push({ id: 'text', source: '保留中文说明',
      checks: [{ kind: 'type', subjects: ['msg'], objectType: 'text',
        scope: 'initial' }] });
    return parseRequest({ ...input, outputDir });
  }
  return parseRequest({
    protocolVersion: 2, prompt: 'Display a function', locale: 'en', outputDir,
    plan: {
      program: [{ id: 'f', op: 'native', mode: 'algebra',
        source: 'f(x)=x^2+1' }],
      requirements: [{ id: 'function', source: 'function', checks: [{
        kind: 'type', subjects: ['f'], objectType: 'function', scope: 'initial',
      }, {
        kind: 'expression', subjects: ['f'], expression: 'f(2)',
        mode: 'algebra', expected: 5, scope: 'initial',
      }] }], interactions: [], display: 'algebra',
    },
  });
}

/** Checks real panel geometry rather than matching embedding options. */
async function assertPreviewLayout(page: Page): Promise<void> {
  await page.locator('.algebraPanel').waitFor({ state: 'visible' });
  await page.locator('.toolbarPanel').waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const container = document.getElementById('workspace');
    const frame = document.querySelector('.GeoGebraFrame');
    if (!container || !frame) return false;
    const outer = container.getBoundingClientRect();
    const inner = frame.getBoundingClientRect();
    return Math.abs(inner.width - outer.width) <= 2
      && Math.abs(inner.height - outer.height) <= 2;
  });
  const layout = await page.evaluate(() => {
    const applet = document.getElementById('workspace');
    if (!applet) throw new Error('Missing applet container');
    const rect = applet.getBoundingClientRect();
    return {
      width: rect.width, height: rect.height, right: rect.right,
      bottom: rect.bottom, viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      algebraHeight: document.querySelector('.algebraPanel')
        ?.getBoundingClientRect().height ?? 0,
    };
  });
  assert(layout.width >= layout.viewportWidth - 2);
  assert(layout.height >= layout.viewportHeight * 0.8);
  assert(layout.right <= layout.viewportWidth + 1);
  assert(layout.bottom <= layout.viewportHeight + 1);
  assert(layout.scrollWidth <= layout.viewportWidth + 1);
  assert(layout.scrollHeight <= layout.viewportHeight + 1);
  assert(layout.algebraHeight >= layout.height * 0.75);
}

/** The fixture's radius is three; the new algebra pane must not crop it. */
async function assertCircleInView(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const view = JSON.parse(window.ggb.getViewProperties(1));
    return view.xMin <= -3 && view.yMin <= -3
      && view.xMin + view.width * view.invXscale >= 3
      && view.yMin + view.height * view.invYscale >= 3
      && Math.abs(view.invXscale - view.invYscale) < 1e-10;
  });
}

/** Native commands stay English without translating page or object text. */
async function assertPreviewLanguage(page: Page, request: Request): Promise<void> {
  assert.equal(await page.locator('html').getAttribute('lang'), request.locale);
  assert.equal(await page.locator('h1').textContent(), request.prompt);
  const chinese = request.locale === 'zh-CN';
  assert.equal(await page.locator('#finish').textContent(),
    chinese ? '结束预览' : 'End preview');
  if (!chinese) return;
  const algebra = page.locator('.algebraPanel');
  await algebra.waitFor({ state: 'visible' });
  const text = await algebra.innerText();
  assert.match(text, /中文说明/);
  // Circles can display equations; query the current GUI language explicitly.
  assert.match(await page.evaluate(
    () => window.ggb.getCommandString('circ', true)), /Circle/);
}

/** Publishes only through the normal report and reload verification path. */
async function checkTeachingPreview(
  request: Request, evidence: string,
): Promise<void> {
  const result = await build(request);
  const digest = sha256(await readFile(result.file));
  const session = await openPreview(result.delivery, false);
  try {
    const expected = await snapshot(session.page);
    const material = session.publishPreview({
      base64: session.bytes.toString('base64'), prompt: request.prompt,
      locale: request.locale, display: request.plan.display ?? 'graphics',
    });
    const page = await session.page.context().newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(material.url);
    await material.loaded;
    await assertPreviewLanguage(page, request);
    for (const size of [{ width: 1280, height: 900 },
      { width: 820, height: 680 }, { width: 1920, height: 1080 }]) {
      await page.setViewportSize(size);
      await page.evaluate(() => new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }));
      await assertPreviewLayout(page);
      if (request.plan.display !== 'algebra') await assertCircleInView(page);
      compareSnapshots(await snapshot(page), expected);
      await page.screenshot({ path: join(evidence,
        `${request.plan.display}-${size.width}.png`) });
    }
    await page.locator('#finish').click();
    await material.closed;
    assert.equal(sha256(await readFile(result.file)), digest);
  } finally { await session.close(); }
}

test('teaching previews expose toolbar and algebra and fill resized windows',
  { timeout: 90_000 }, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ggb-preview-layout-'));
    const evidence = join(root, 'output/preview-layout');
    await mkdir(evidence, { recursive: true });
    try {
      for (const display of ['graphics', 'algebra'] as const) {
        await checkTeachingPreview(
          await layoutRequest(display, directory), evidence);
      }
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
