/**
 * @fileoverview The capability manifest is the contract between the plugin and
 * every host. It must be generated from the same schema and skill text that ship
 * in the package.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { root } from '../src/server.js';
import { commands, limits, predicates, parseRequest } from '../src/schema.js';
import {compile} from '../src/compile.js';

const manifest = JSON.parse(await readFile(join(root, 'capabilities.json'), 'utf8'));
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const worker = await readFile(join(root, 'skills/ggb-construction/worker.md'));
const hostSkill = await readFile(join(root, 'skills/ggb-construction/SKILL.md'), 'utf8');
const hostReference = await readFile(
  join(root, 'skills/ggb-construction/references/capabilities.md'), 'utf8');

test('capability manifest matches the compiled schema and worker skill', () => {
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.toolVersion, pkg.version);
  assert.equal(manifest.requestProtocolVersion, 2);
  assert.equal(manifest.workerProfileVersion, 'plugin-core-v2');
  assert.deepEqual(manifest.modelFacingTools, ['ggb_inspect', 'ggb_request', 'ggb_check', 'ggb_build']);
  assert.deepEqual(manifest.commands, commands);
  assert.deepEqual(manifest.limits, limits);
  assert.deepEqual(manifest.predicates, predicates);
  assert.equal(manifest.workerSkillSha256,
    createHash('sha256').update(worker).digest('hex'));
  assert.deepEqual(manifest.predicates.pointOn.types[1].split('|'),
    ['line', 'circle', 'conic', 'ellipse', 'hyperbola', 'parabola']);
});

test('worker skill states the rules that the manifest exposes', () => {
  const text = worker.toString('utf8');
  assert.match(text, /pointOn.*conic/s);
  assert.match(text, /expected.*derive/is);
  assert.match(text, /warnings/i);
  assert.match(text, /base_missing/);
});

test('host skill and reference state the same capability rules', () => {
  assert.match(hostSkill, /warnings/);
  assert.match(hostSkill, /期望值先算后写/);
  assert.match(hostReference, /pointOn.*圆锥曲线/s);
  assert.match(hostReference, /expected.*独立/s);
});

/** Bytes prevent a long line from bypassing the entrypoint line budget. */
function assertPromptBudget(text: string, bytes: number): void {
  assert(text.split('\n').length <= 100, 'Prompt exceeds 100 lines');
  assert(Buffer.byteLength(text) <= bytes, 'Prompt exceeds byte budget');
}

test('both prompt entrypoints and references stay within context budgets',
  async () => {
    assertPromptBudget(hostSkill, 9_000);
    assertPromptBudget(worker.toString('utf8'), 6_500);
    assert(Buffer.byteLength(hostSkill) + worker.length <= 14_000);
    assert(Buffer.byteLength(hostReference) <= 32_000);
    const patterns = await readFile(join(root,
      'skills/ggb-construction/references/patterns.md'));
    assert(patterns.length <= 6_000);
  });

test('long lines and extra lines cannot bypass prompt budgets', () => {
  assert.throws(() => assertPromptBudget('x'.repeat(9_001), 9_000));
  assert.throws(() => assertPromptBudget('中'.repeat(3_001), 9_000));
  assert.throws(() => assertPromptBudget('\n'.repeat(100), 9_000));
});

/** Matches generated Markdown heading anchors used by the entrypoint. */
function headingAnchor(heading: string): string {
  return heading.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-');
}

test('entrypoint references resolve to packaged files and section anchors',
  async () => {
    const skillPath = join(root, 'skills/ggb-construction/SKILL.md');
    for (const [, target] of hostSkill.matchAll(/\]\(([^)]+)\)/g)) {
      assert(target && !target.includes('://'), 'Use local skill resources');
      const [file, anchor] = target.split('#');
      assert(file);
      const text = await readFile(join(dirname(skillPath), file), 'utf8');
      if (!anchor) continue;
      const anchors = [...text.matchAll(/^#+ (.+)$/gm)]
        .map(([, heading]) => headingAnchor(heading ?? ''));
      assert(anchors.includes(anchor), `Missing section: ${target}`);
    }
  });

test('canonical reference examples compile with independent fixed expectations',
  () => {
    const section = hostReference.slice(hostReference.indexOf('常用检查的最小形式'));
    const block = /```json\n([\s\S]*?)\n```/u.exec(section);
    assert.ok(block?.[1]);
    const checks = JSON.parse(block[1]);
    assert.deepEqual(checks.map((check: {kind: string}) => check.kind),
      ['exists', 'coordinate', 'pointOn', 'expression', 'dependsOn']);
    const request = parseRequest({protocolVersion: 2,
      prompt: 'Canonical checks', locale: 'en', outputDir: '/tmp/unused',
      plan: {
        program: [['P', 'P=(1,0)'], ['p', 'p:y^2=4x'],
          ['d', 'd=Directrix(p)'], ['A', 'A=Point(d)']]
          .map(([id, source]) => ({id, op: 'native', source, mode: 'algebra'})),
        requirements: [{id: 'canonical', source: 'Canonical checks', checks}],
        interactions: [{point: 'A', dx: 0, dy: 30}],
      },
    });
    assert.doesNotThrow(() => compile(request));
  });


test('native reference examples compile with exact labels and nested checks',
  () => {
    const start = hostReference.indexOf('例如已创建椭圆 ell 后');
    const section = hostReference.slice(start);
    const blocks = [...section.matchAll(/```json\n([\s\S]*?)\n```/gu)];
    assert.ok(blocks[0]?.[1] && blocks[1]?.[1]);
    const program = JSON.parse(blocks[0][1]);
    const polygon = JSON.parse(blocks[1][1]);
    const input = parseRequest({protocolVersion: 2, prompt: 'Native examples',
      locale: 'en', outputDir: '/tmp/unused', plan: {
        program: [{id: 'ell', source: 'ell: 2x^2+3y^2=6',
          op: 'native', mode: 'algebra'}, ...program,
        ...['A', 'B', 'F2'].map((id, i) => ({id, source: `${id}=(${i},1)`,
          op: 'native', mode: 'algebra'})), polygon], interactions: [],
        requirements: [{id: 'example', source: 'Native examples', checks: [
          {kind: 'type', subjects: ['tri'], objectType: 'polygon',
            scope: 'initial'},
        ]}],
      }});
    assert.equal(compile(input).program.at(-1)?.command,
      'tri=Polygon({A,B,F2})');
    const mismatched = structuredClone(input);
    mismatched.plan.program[1] = {id: 'F_1', op: 'native', mode: 'algebra',
      source: 'F_1=Focus(ell)', outputs: ['F_{1}', 'F_{2}']};
    assert.throws(() => parseRequest(mismatched), /include step ID/u);
  });
