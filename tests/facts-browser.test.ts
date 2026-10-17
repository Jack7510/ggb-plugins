/** @fileoverview Real engine counterexamples for identity and sample coverage. */
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { exportGgb, openBrowser, snapshot } from '../src/browser.js';
import { build, openPreview, sha256 } from '../src/delivery.js';
import { ToolError, type Request } from '../src/schema.js';
import { root } from '../src/server.js';

const output = join(root, 'output/unified-validation/regressions');

function midpointRequest(outputDir: string): Request {
  return {
    protocolVersion: 2, prompt: '取 AB 的中点 M，拖动 A 观察联动。',
    locale: 'zh-CN', outputDir, plan: {
      program: [['A', 'A=(-2,0)'], ['B', 'B=(2,0)'], ['U', 'U=(0,4)'],
        ['M', 'M=Midpoint(A,B)']].map(([id = '', source = '']) => ({
        id, source, op: 'native', mode: 'algebra',
      })),
      requirements: [{ id: 'mid', source: '取 AB 的中点 M',
        purpose: 'interaction', checks: [{ kind: 'midpoint',
          subjects: ['M', 'A', 'B'], scope: 'sampled' }] }],
      interactions: [{ point: 'U', dx: 40, dy: 30 }],
    },
  };
}

test('unrelated native movement cannot deliver; relevant input passes',
  { timeout: 30_000 }, async () => {
    const directory = join(output, 'coverage');
    await mkdir(directory, { recursive: true });
    const request = midpointRequest(directory);
    await assert.rejects(build(request), (error: unknown) =>
      error instanceof ToolError
        && /No relevant interaction/.test(error.message));
    for (const run of await readdir(directory)) {
      const file = join(directory, run, 'delivery/result.ggb');
      await assert.rejects(readFile(file),
        /ENOENT/);
    }
    request.outputDir = join(output, 'coverage-positive');
    request.plan.interactions = [{ point: 'A', dx: 40, dy: -30 }];
    const result = await build(request);
    const session = await openPreview(result.delivery, false);
    try {
      await session.page.screenshot({
        path: join(output, 'coverage-positive.png'), fullPage: true,
      });
    } finally { await session.close(); }
  });

/** Creates a base with distinct global and locally-bound identities. */
async function primedBase(): Promise<Buffer> {
  const engine = await openBrowser(false);
  const page = await engine.page();
  try {
    await page.evaluate(async () => {
      for (const source of ['n=99', 'values=Sequence(5,n,1,3)',
        'P=(0,0)', "P'=(3,1)", 'B=(3,5)',
        "Q=Midpoint(P',B)"]) {
        await window.ggb.asyncEvalCommandGetLabels(source);
      }
    });
    const facts = await snapshot(page);
    const q = facts.find(fact => fact.name === 'Q');
    assert.deepEqual(q?.inputs, ['B', "P'"]);
    assert.equal(q?.referenceState, 'direct');
    const local = facts.find(fact => fact.name === 'values');
    assert(local?.defined);
    assert.deepEqual(local.inputs, []);
    return Buffer.from(await exportGgb(page), 'base64');
  } finally { await engine.close(); }
}

test('primed input identity survives base updates and reload',
  { timeout: 45_000 }, async () => {
    await mkdir(output, { recursive: true });
    const bytes = await primedBase();
    const base = join(output, 'primed-base.ggb');
    await writeFile(base, bytes);
    const request = {
      protocolVersion: 2, locale: 'zh-CN', prompt: "把 P' 移到 (4,2)",
      outputDir: join(output, 'primed-update'),
      base: { path: base, sha256: sha256(bytes) },
      plan: { updates: [{ object: "P'", coords: [4, 2] }],
        requirements: [{ id: 'move', source: "把 P' 移到 (4,2)", checks: [{
          kind: 'coordinate', subjects: ["P'"], coordinates: [4, 2],
          scope: 'initial',
        }, { kind: 'expression', subjects: ['Q', "P'"],
          expression: "Distance(Q,P')^2-2.5", expected: 0,
          mode: 'algebra', scope: 'initial',
        }] }], interactions: [] },
    };
    const result = await build(request);
    const session = await openPreview(result.delivery, false);
    try {
      const q = (await snapshot(session.page)).find(fact => fact.name === 'Q');
      assert.equal(q?.x, 3.5);
      assert.equal(q?.y, 3.5);
      await session.page.screenshot({
        path: join(output, 'primed-update.png'),
      });
    } finally { await session.close(); }
  });


test('removing an unrelated geometric sample cannot claim algebra coverage',
  { timeout: 60_000 }, async () => {
    const request: Request = JSON.parse(await readFile(
      join(root, 'tests/fixtures/functions.json'), 'utf8'));
    request.outputDir = join(output, 'missing-path-sample');
    request.plan.display = 'algebra';
    request.plan.interactions = request.plan.interactions.filter(sample =>
      'parameter' in sample);
    await assert.rejects(build(request), (error: unknown) =>
      error instanceof ToolError
        && /No relevant interaction/.test(error.message));
  });
