/** @fileoverview Tests real-engine round trips and ambiguous mouse targets. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { interact, openBrowser, snapshot } from '../src/browser.js';
import { build, openPreview, sha256 } from '../src/delivery.js';
import { validateUpdates } from '../src/modify.js';
import { root } from '../src/server.js';
import { ToolError, type Request } from '../src/schema.js';

interface PolygonSample {
  value: number; count: number; radius: number; side: number; area: number;
  changed: boolean;
}

async function input(path: string) {
  const request = JSON.parse(await readFile(join(root, path), 'utf8'));
  const directory = join(root, 'output/interaction-regressions');
  await mkdir(directory, { recursive: true });
  request.outputDir = await mkdtemp(join(directory, 'case-'));
  return request;
}

test('variable polygon rejects undefined residuals on the same-page return',
  { timeout: 30_000 }, async () => {
    const request = await input('tests/fixtures/polygon-residual.json');
    request.plan.interactions = [{ parameter: 'n', value: 12 }];
    await assert.rejects(build(request), (error: unknown) => {
      assert(error instanceof ToolError);
      assert.equal(error.code, 'verification_failed');
      return true;
    });
    const [run] = await readdir(request.outputDir);
    assert(run);
    const directory = join(request.outputDir, run);
    assert(!(await readdir(directory)).includes('delivery'));
    const evidence = JSON.parse(await readFile(
      join(directory, 'verification.json'), 'utf8',
    ));
    assert.equal(evidence.samples[0].after.status, 'passed');
    assert.equal(evidence.samples[0].roundTrip.after.status, 'failed');
    assert(evidence.samples[0].roundTrip.after.objects.some(
      (object: { defined: boolean }) => !object.defined,
    ));
  });

test('native outline survives returns and rejects missing evidence',
  { timeout: 30_000 }, async () => {
    const request = await input(
      'examples/geometry-benchmark/08-regular-polygon.json',
    );
    const result = await build(request);
    const report = JSON.parse(await readFile(result.report, 'utf8'));
    const digest = sha256(await readFile(result.file));
    for (const sample of report.interaction.samples) {
      assert.equal(sample.after.status, 'passed');
      assert.equal(sample.roundTrip.value, 3);
      assert.equal(sample.roundTrip.after.status, 'passed');
      assert(sample.roundTrip.after.objects.every(
        (object: { defined: boolean }) => object.defined,
      ));
    }
    const preview = await openPreview(result.delivery, false);
    await preview.close();
    assert.equal(sha256(await readFile(result.file)), digest);
    const { stdout } = await promisify(execFile)(process.execPath, [
      join(root, 'dist/src/cli.js'), 'preview',
      '--delivery', result.delivery, '--headless', '--once',
    ], { timeout: 10_000 });
    const receipt = JSON.parse(stdout);
    assert.equal(receipt.ok, true);
    await assert.rejects(fetch(receipt.data.url));
    assert.equal(sha256(await readFile(result.file)), digest);
    const saved = await readFile(result.report, 'utf8');
    delete report.interaction.samples[0].roundTrip;
    await writeFile(result.report, JSON.stringify(report));
    await assert.rejects(openPreview(result.delivery, false), /round-trip/);
    await writeFile(result.report, saved);
  });

test('overlapping movable points reject before the long movement timeout',
  { timeout: 15_000 }, async () => {
    const request = await input(
      'examples/geometry-benchmark/10-midpoint-locus.json',
    );
    const radiusPoint = request.plan.program.find(
      (step: { id: string }) => step.id === 'R');
    radiusPoint.source = 'R=(3,0)';
    request.plan.interactions = [{ point: 'R', dx: 25, dy: 25 }];
    const started = performance.now();
    await assert.rejects(build(request), (error: unknown) => {
      assert(error instanceof ToolError);
      assert.match(error.message, /overlapping movable points/);
      assert(JSON.stringify(error.details).includes('target'));
      assert(JSON.stringify(error.details).includes('overlaps'));
      return true;
    });
    assert(performance.now() - started < 10_000);
    const [run] = await readdir(request.outputDir);
    assert(run);
    const files = await readdir(join(request.outputDir, run));
    assert(files.includes('interaction-failure-0.png'));
    assert(!files.includes('delivery'));
  });

test('fractional samples fail before the applet value setter', {
  timeout: 30_000,
}, async () => {
  const request = await input('examples/v2-cases/slider-polygon.json');
  request.plan.interactions = [{ parameter: 'n', value: 3.5 }];
  await assert.rejects(build(request), (error: unknown) => {
    assert(error instanceof ToolError);
    assert.equal(error.code, 'verification_failed');
    assert.match(error.message, /slider step grid/);
    return true;
  });
  const [run] = await readdir(request.outputDir);
  assert(run);
  assert(!(await readdir(join(request.outputDir, run))).includes('delivery'));
});

for (const fixture of [
  { name: 'variable', source: 'a', step: 0.5, valid: 1 },
  { name: 'pi', source: 'pi/6', step: Math.PI / 6, valid: Math.PI / 3 },
]) {
  test(`${fixture.name} slider step rejects off-grid samples and updates`, {
    timeout: 30_000,
  }, async () => {
    const directory = join(root, 'output/interaction-regressions');
    await mkdir(directory, { recursive: true });
    const session = await openBrowser(false);
    try {
      const page = await session.page();
      await page.evaluate(async source => {
        await window.ggb.asyncEvalCommandGetLabels('a=0.5');
        await window.ggb.asyncEvalCommandGetLabels(`m=Slider(0,5,${source})`);
      }, fixture.source);
      const facts = await snapshot(page);
      const slider = facts.find(fact => fact.name === 'm');
      const step = slider?.slider?.step;
      assert(typeof step === 'number');
      assert(Math.abs(step - fixture.step) < 1e-12);
      const values = new Map(facts.map(fact => [fact.name, fact]));
      validateUpdates([{ object: 'm', value: fixture.valid }], values);
      assert.throws(() => validateUpdates([
        { object: 'm', value: 0.3 },
      ], values), /step grid/);
      await assert.rejects(interact(page, { parameter: 'm', value: 0.3 }),
        /step grid/);
      assert.equal(await page.evaluate(() => window.ggb.getValue('m')), 0);
      await interact(page, { parameter: 'm', value: fixture.valid });
      if (fixture.name === 'variable') {
        await page.evaluate(() => window.ggb.setValue('a', 0.25));
        const updated = await snapshot(page);
        assert.equal(updated.find(fact => fact.name === 'm')?.slider?.step,
          0.25);
        await interact(page, { parameter: 'm', value: 0.75 });
      }
      await page.screenshot({ path: join(directory,
        `${fixture.name}-step.png`) });
    } finally {
      await session.close();
    }
  });
}

function roundedPolygonRequest(outputDir: string): Request {
  const source = '画一个圆，并在圆内作内接正多边形，用整数滑块控制边数 n';
  return {
    protocolVersion: 2, prompt: source, locale: 'zh-CN', outputDir,
    plan: {
      program: [
        { id: 'O', op: 'native', mode: 'algebra', source: 'O=(0,0)' },
        { id: 'A', op: 'native', mode: 'algebra', source: 'A=(3,0)' },
        { id: 'c', op: 'native', mode: 'algebra', source: 'c=Circle(O,A)' },
        { id: 'n', op: 'native', mode: 'algebra', source: 'n=Slider(3,12,1)' },
        { id: 'poly', op: 'native', mode: 'algebra', outputs: ['poly'],
          source: 'poly=Polygon(Sequence(Rotate(A, 2*pi*k/round(n), O), k, 0, round(n)-1))' },
      ],
      requirements: [{ id: 'shape', source, checks: [
        { kind: 'type', subjects: ['poly'], objectType: 'polygon',
          scope: 'initial' },
        { kind: 'expression', subjects: ['poly', 'n'],
          expression: 'Length(Sequence(Vertex(poly,j),j,1,round(n)))-round(n)', mode: 'algebra',
          expected: 0, scope: 'initial' },
        { kind: 'expression', subjects: ['poly', 'n', 'O', 'A'],
          expression: 'Area(poly)-round(n)/2*Distance(O,A)^2*sin(2*pi/round(n))',
          mode: 'algebra', expected: 0, scope: 'initial' },
      ] }],
      interactions: [],
    },
  };
}

test('rounded side count keeps every applet value regular', {
  timeout: 60_000,
}, async () => {
  const directory = join(root, 'output/interaction-regressions');
  await mkdir(directory, { recursive: true });
  const outputDir = await mkdtemp(join(directory, 'rounded-'));
  try {
    const result = await build(roundedPolygonRequest(outputDir));
    const preview = await openPreview(result.delivery, false);
    try {
      const facts = await snapshot(preview.page);
      assert.equal(facts.find(fact => fact.name === 'n')?.slider?.step, 1);
      for (const value of [4, 5, 6, 7, 8, 9, 10, 11, 12,
        3.5, 4.5, 7.5, 3]) {
        const observed = await preview.page.evaluate((requested: number) => {
          const api = window.ggb;
          const before = api.getValue('n');
          api.setValue('n', requested);
          return new Promise<PolygonSample>(resolve => {
            setTimeout(() => {
              const read = (name: string, expression: string) => {
                const probe = `GgbProbe_${name}`;
                api.evalCommand(`${probe}=${expression}`);
                const result = api.getValue(probe);
                api.deleteObject(probe);
                return result;
              };
              const current = api.getValue('n');
              resolve({
                value: current,
                count: read('count', 'Length(Sequence(Vertex(poly,j),j,1,round(n)))'),
                radius: read('radius', 'Max(Sequence(abs(Distance(O,Vertex(poly,j))-Distance(O,A)),j,1,round(n)))'),
                side: read('side', 'Max(Sequence(abs(Distance(Vertex(poly,j),Vertex(poly,Mod(j,round(n))+1))-2*Distance(O,A)*sin(pi/round(n))),j,1,round(n)))'),
                area: read('area', 'Area(poly)-round(n)/2*Distance(O,A)^2*sin(2*pi/round(n))'),
                changed: Math.abs(current - before) > 1e-8,
              });
            }, 50);
          });
        }, value);
        assert(Number.isFinite(observed.value), String(value));
        assert(observed.changed, `setValue did not take effect for ${value}`);
        assert.equal(observed.count, Math.round(observed.value), String(value));
        assert(Math.abs(observed.radius) < 1e-8, String(value));
        assert(Math.abs(observed.side) < 1e-8, String(value));
        assert(Math.abs(observed.area) < 1e-8, String(value));
      }
    } finally {
      await preview.close();
    }
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});
