/** @fileoverview Real applet regressions for reviewed delivery boundaries. */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { exportGgb, openBrowser, snapshot } from '../src/browser.js';
import { build, openPreview, sha256 } from '../src/delivery.js';
import { inspectGgb } from '../src/inspect.js';
import { ToolError, type Request } from '../src/schema.js';

async function noDelivery(directory: string): Promise<void> {
  for (const run of await readdir(directory)) {
    const path = join(directory, run, 'delivery');
    await assert.rejects(readFile(join(path, 'manifest.json')), /ENOENT/);
  }
}

test('native scalar values cannot deliver an equal-segment requirement',
  { timeout: 30_000 }, async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'ggb-equal-types-'));
    try {
      const request: Request = {
        protocolVersion: 2, prompt: 'Equal segments', locale: 'en',
        outputDir, plan: {
          program: ['a', 'b'].map(id => ({
            id, op: 'native', source: `${id}=3`, mode: 'algebra',
          })),
          requirements: [{ id: 'equal', source: 'Equal segments', checks: [
            { kind: 'equalLength', subjects: ['a', 'b'], scope: 'initial' },
          ] }], interactions: [],
        },
      };
      await assert.rejects(build(request), (error: unknown) =>
        error instanceof ToolError && error.code === 'verification_unverified'
        && /Expected a segment/.test(JSON.stringify(error.details)));
      await noDelivery(outputDir);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

async function spatialFile(directory: string): Promise<string> {
  const session = await openBrowser(false);
  try {
    const page = await session.page();
    assert(await page.evaluate(() => window.ggb.evalCommand('A=(1,2,3)')));
    assert.equal(await page.evaluate(() => window.ggb.getObjectType('A')),
      'point');
    await assert.rejects(snapshot(page), /Unsupported spatial object/);
    const path = join(directory, 'spatial.ggb');
    await writeFile(path, Buffer.from(await exportGgb(page), 'base64'));
    return path;
  } finally {
    await session.close();
  }
}

test('3D API aliases cannot enter inspect, edit or modify deliveries',
  { timeout: 30_000 }, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ggb-spatial-base-'));
    try {
      const path = await spatialFile(directory);
      const base = { path, sha256: sha256(await readFile(path)) };
      const reject = (error: unknown) => error instanceof ToolError
        && error.code === 'base_unsupported';
      await assert.rejects(inspectGgb(path), reject);
      for (const mode of ['edit', 'modify']) {
        const request: Request = {
          protocolVersion: 2, prompt: 'Color A red', locale: 'en',
          outputDir: join(directory, mode), base, plan: {
            program: [], interactions: [], requirements: [{
              id: 'red', source: 'Color A red', checks: [{ kind: 'style',
                subjects: ['A'], scope: 'initial',
                properties: { color: '#FF0000' } }],
            }],
          },
        };
        if (mode === 'edit') request.plan.edits = [
          { object: 'A', properties: { color: '#FF0000' } }];
        else request.plan.styles = [
          { object: 'A', properties: { color: '#FF0000' } }];
        await assert.rejects(build(request), reject);
        await assert.rejects(readdir(request.outputDir), /ENOENT/);
      }
      assert.equal(sha256(await readFile(path)), base.sha256);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

function ellipseRequest(outputDir: string): Request {
  return {
    protocolVersion: 2, prompt: 'Draw ellipse', locale: 'en', outputDir,
    plan: {
      program: ([['F1', 'F1=(-2,0)'], ['F2', 'F2=(2,0)'],
        ['el', 'el=Ellipse(F1,F2,3)']] as const).map(([id, source]) => ({
        id, source, op: 'native', mode: 'algebra',
      })),
      requirements: [{ id: 'ellipse', source: 'ellipse', checks: [{
        kind: 'type', subjects: ['el'], objectType: 'ellipse',
        scope: 'initial',
      }] }], interactions: [],
    },
  };
}

test('moving an ellipse focus retains conic dependency through reload',
  { timeout: 45_000 }, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ggb-conic-update-'));
    try {
      const original = await build(ellipseRequest(directory));
      const base = { path: original.file,
        sha256: sha256(await readFile(original.file)) };
      const request: Request = {
        protocolVersion: 2, prompt: 'Move F1 to (-1,0)', locale: 'en',
        outputDir: directory, base, plan: {
          program: [], updates: [{ object: 'F1', coords: [-1, 0] }],
          requirements: [{ id: 'move', source: 'Move F1 to (-1,0)',
            checks: [{ kind: 'coordinate', subjects: ['F1'],
              coordinates: [-1, 0], scope: 'initial' }] }],
          interactions: [],
        },
      };
      const result = await build(request);
      const report = JSON.parse(await readFile(result.report, 'utf8'));
      assert.equal(report.construction.status, 'passed');
      assert.equal(report.reload.status, 'passed');
      assert(report.modify.changes.some((change: { object: string;
        field: string }) => change.object === 'el'
        && change.field === 'conic'));
      const session = await openPreview(result.delivery, false);
      await session.close();
      assert.equal(sha256(await readFile(original.file)), base.sha256);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
