/** @fileoverview Verifies naming policy retains native execution gates. */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { build } from '../src/delivery.js';
import { ToolError } from '../src/schema.js';
import { root } from '../src/server.js';

/** Keeps screenshots and delivery evidence for this focused regression. */
async function outputDirectory(): Promise<string> {
  const directory = join(root, 'output/naming-validation');
  await mkdir(directory, { recursive: true });
  return mkdtemp(join(directory, 'run-'));
}

test('built-in commands work under ordinary object names', async () => {
  const outputDir = await outputDirectory();
  const result = await build({
    protocolVersion: 2, prompt: 'Draw a circle', locale: 'en-US', outputDir,
    plan: {
      program: [{
        id: 'circ', op: 'native', mode: 'algebra',
        source: 'circ=Circle((0,0),2)',
      }],
      requirements: [{ id: 'circle', source: 'circle', checks: [{
        kind: 'radius', subjects: ['circ'], value: 2, scope: 'initial',
      }] }], interactions: [],
    },
  });
  const report = JSON.parse(await readFile(result.report, 'utf8'));
  assert.equal(report.reload.status, 'passed');
  assert((await readdir(result.delivery)).includes('preview.png'));
});

test('source-level shadowing cannot bypass declared output identity',
  async () => {
    for (const source of ['Circle=1', 'sin=1']) {
      const outputDir = await outputDirectory();
      await assert.rejects(build({
        protocolVersion: 2, prompt: 'Create a number', locale: 'en-US',
        outputDir,
        plan: {
          program: [{ id: 'safe', op: 'native', mode: 'algebra', source }],
          requirements: [{ id: 'number', source: 'number', checks: [{
            kind: 'type', subjects: ['safe'], objectType: 'numeric',
            scope: 'initial',
          }] }], interactions: [],
        },
      }), (error: unknown) => {
        assert(error instanceof ToolError);
        assert.equal(error.code, 'execution_failed');
        return true;
      });
      for (const run of await readdir(outputDir)) {
        assert(!(await readdir(join(outputDir, run))).includes('delivery'));
      }
    }
  });
