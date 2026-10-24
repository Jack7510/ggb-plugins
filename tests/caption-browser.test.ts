/** @fileoverview Pins caption normalization and dependent construction delivery. */
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import test from 'node:test';
import type {Page} from 'playwright';
import {exportGgb, loadGgb, openBrowser, runtimeVersion}
  from '../src/browser.js';
import {build} from '../src/delivery.js';
import {ToolError} from '../src/schema.js';
import {root} from '../src/server.js';

const evidence = resolve(process.env.GGB_CAPTION_EVIDENCE_DIR
  ?? join(root, 'output/caption-regression'));

async function captionState(page: Page, name: string) {
  return page.evaluate(name => {
    const api = window.ggb;
    const xml = new DOMParser().parseFromString(api.getXML(), 'text/xml');
    const object = [...xml.querySelectorAll('element')]
      .find(element => element.getAttribute('label') === name);
    return {caption: api.getCaption(name, false),
      substituted: api.getCaption(name, true),
      labelStyle: api.getLabelStyle(name), defined: api.isDefined(name),
      xml: object?.outerHTML};
  }, name);
}

async function setCaption(page: Page, name: string, caption: string) {
  await page.evaluate(({name, caption}) => {
    window.ggb.setCaption(name, caption);
    window.ggb.setLabelStyle(name, 3);
    window.ggb.setLabelVisible(name, true);
  }, {name, caption});
}

test('exact own-name caption is normalized, not ignored, and survives reload',
  {timeout: 120_000}, async () => {
    await mkdir(evidence, {recursive: true});
    const engine = await openBrowser(false);
    const stages = [];
    try {
      for (const [name, source] of [['A', 'A=(0,0)'],
        ['k', 'k=Slider(0.5,1.2,0.1)']] as const) {
        for (const requested of [name, 'Custom ' + name, '']) {
          const page = await engine.page();
          const raw = await page.evaluate(source =>
            window.ggb.asyncEvalCommandGetLabels(source), source);
          // Starting with a different caption distinguishes reset from no-op.
          await setCaption(page, name, 'Before ' + name);
          const before = await captionState(page, name);
          await setCaption(page, name, requested);
          const after = await captionState(page, name);
          await loadGgb(page, await exportGgb(page));
          const reload = await captionState(page, name);
          const expected = requested === name ? '' : requested;
          assert.equal(before.caption, 'Before ' + name);
          assert.equal(after.caption, expected);
          assert.deepEqual(reload, after);
          assert.equal(after.labelStyle, 3);
          assert.equal(after.defined, true);
          stages.push({name, source, raw, requested, before, after, reload,
            version: await runtimeVersion(page)});
          await page.screenshot({path: join(evidence,
            `${name}-${requested === name ? 'same' : requested ? 'custom' : 'empty'}.png`)});
          await page.close();
        }
      }
    } finally {
      await writeFile(join(evidence, 'caption-contrast.json'),
        JSON.stringify(stages, null, 2));
      await engine.close();
    }
  });

function dependentRequest() {
  return {protocolVersion: 2, prompt: 'dependent focus and line', locale: 'en',
    outputDir: join(evidence, 'delivery'), title: 'caption dependency', plan: {
      program: [
        {id: 'a', source: 'a=Slider(2,3,0.5)', op: 'native', mode: 'algebra'},
        {id: 'k', source: 'k=Slider(0.5,1.2,0.1)', op: 'native', mode: 'algebra'},
        {id: 'ell', source: 'ell: x^2/a^2+y^2/3=1', op: 'native', mode: 'algebra'},
        {id: 'Lf', source: 'Lf={Focus(ell)}', op: 'native', mode: 'algebra'},
        {id: 'F', source: 'F=Element(Lf,1)', op: 'native', mode: 'algebra'},
        {id: 'g', source: 'g: y-y(F)=k*(x-x(F))', op: 'native', mode: 'algebra'},
        {id: 'A', source: 'A=Intersect(ell,g,1)', op: 'native', mode: 'algebra'},
      ], requirements: [{id: 'relation', source: 'dependent focus and line',
        checks: [
          {kind: 'dependsOn', subjects: ['F', 'ell', 'a'], scope: 'sampled'},
          {kind: 'dependsOn', subjects: ['g', 'F', 'ell', 'a', 'k'], scope: 'sampled'},
          {kind: 'pointOn', subjects: ['F', 'g'], scope: 'sampled'},
          {kind: 'pointOn', subjects: ['A', 'ell'], scope: 'sampled'},
          {kind: 'pointOn', subjects: ['A', 'g'], scope: 'sampled'},
        ]}], interactions: [{parameter: 'a', value: 3}, {parameter: 'k', value: 1.1}],
      styles: ['A', 'k'].map(object => ({object,
        properties: {caption: object, labelVisible: true}})),
    }};
}

test('own-name captions deliver with full dependency, reload and samples',
  {timeout: 120_000}, async () => {
    await mkdir(evidence, {recursive: true});
    const request = dependentRequest();
    const result = await build(request);
    const report = JSON.parse(await readFile(result.report, 'utf8'));
    assert.equal(report.construction.status, 'passed');
    assert.equal(report.reload.status, 'passed');
    assert.equal(report.interaction.samples.length, 2);
    assert.ok(report.interaction.samples.every(
      (sample: {after: {status: string}}) => sample.after.status === 'passed'));
    await writeFile(join(evidence, 'delivery-result.json'),
      JSON.stringify(result, null, 2));
    // The initial position is right, but the defining focus is no longer used.
    const line = request.plan.program.find(step => step.id === 'g');
    assert.ok(line);
    line.source = 'g: y=k*(x+1)';
    request.outputDir = join(evidence, 'rejected');
    await assert.rejects(build(request), error => {
      assert.ok(error instanceof ToolError);
      assert.equal(error.code, 'verification_failed');
      assert.ok(JSON.stringify(error.details).includes('dependsOn'));
      return true;
    });
  });
