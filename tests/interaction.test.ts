/** @fileoverview Tests real-engine round trips and ambiguous mouse targets. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { build, openPreview, sha256 } from '../src/delivery.js';
import { root } from '../src/server.js';
import { ToolError } from '../src/schema.js';

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
