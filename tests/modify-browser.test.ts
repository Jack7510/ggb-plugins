/**
 * @fileoverview Exercises base construction modifications across three rounds
 * against the real applet, including add, style and controlled updates.
 */
import assert from 'node:assert/strict';
import {
  cp, mkdtemp, readFile, readdir, rm, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { build, openPreview, sha256 } from '../src/delivery.js';
import { root } from '../src/server.js';

const basePath = join(root, 'tests/fixtures/edit-base.ggb');

function request(outputDir: string, base: { path: string; sha256: string },
  prompt: string, plan: Record<string, unknown>) {
  return {
    protocolVersion: 2, locale: 'zh-CN', prompt, outputDir, base,
    plan: { interactions: [], ...plan },
  };
}

test('three construction-modification rounds preserve the base chain',
  { timeout: 180_000 }, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ggb-modify-chain-'));
    try {
      const originalSha = sha256(await readFile(basePath));
      const first = await build(request(directory,
        { path: basePath, sha256: originalSha },
        '在圆上添加点 P，并连接 O 到 P 的线段 s，把 s 改成红色，再添加数值滑块 n', {
          program: [
            { id: 'P', op: 'native', source: 'P=Point(circ)',
              mode: 'algebra', outputs: ['P'] },
            { id: 's', op: 'native', source: 's=Segment(O,P)',
              mode: 'algebra', outputs: ['s'] },
            { id: 'n', op: 'native', source: 'n=Slider(-5,5,1)',
              mode: 'algebra', outputs: ['n'] },
          ],
          styles: [{ object: 's', properties: {
            color: '#D92B2B', lineThickness: 6,
          } }],
          requirements: [
            { id: 'onCircle', source: '在圆上添加点 P', checks: [{
              kind: 'pointOn', subjects: ['P', 'circ'], scope: 'initial',
            }] },
            { id: 'segment', source: '连接 O 到 P 的线段 s', checks: [
              { kind: 'exists', subjects: ['s'], scope: 'initial' },
              { kind: 'style', subjects: ['s'], scope: 'initial',
                properties: { color: '#D92B2B', lineThickness: 6 } },
            ] },
            { id: 'slider', source: '添加数值滑块 n', checks: [
              { kind: 'exists', subjects: ['n'], scope: 'initial' },
              { kind: 'type', subjects: ['n'], scope: 'initial',
                objectType: 'numeric' },
            ] },
          ],
        }));
      const firstDiff = JSON.parse(await readFile(
        join(first.delivery, 'diff.json'), 'utf8'));
      assert.equal(firstDiff.mode, 'modify');
      assert.deepEqual(firstDiff.added, ['P', 's', 'n']);
      assert.equal(sha256(await readFile(basePath)), originalSha);
      assert((await readdir(first.delivery)).includes('base.ggb'));
      const firstPreview = await openPreview(first.delivery, false);
      await firstPreview.close();

      const firstBytes = await readFile(join(first.delivery, 'result.ggb'));
      const second = await build(request(directory,
        { path: join(first.delivery, 'result.ggb'),
          sha256: sha256(firstBytes) },
        '把圆心 O 移到 (0.5,0.5)，再在圆上添加点 T，连接 R 到 T 的线段 t，把圆改成绿色', {
          program: [
            { id: 'T', op: 'native', source: 'T=Point(circ)',
              mode: 'algebra', outputs: ['T'] },
            { id: 't', op: 'native', source: 't=Segment(R,T)',
              mode: 'algebra', outputs: ['t'] },
          ],
          updates: [{ object: 'O', coords: [0.5, 0.5] }],
          styles: [{ object: 'circ', properties: { color: '#1F8F3A' } }],
          requirements: [
            { id: 'moveO', source: '把圆心 O 移到 (0.5,0.5)', checks: [{
              kind: 'coordinate', subjects: ['O'], scope: 'initial',
              coordinates: [0.5, 0.5],
            }] },
            { id: 'onCircle', source: '在圆上添加点 T', checks: [{
              kind: 'pointOn', subjects: ['T', 'circ'], scope: 'initial',
            }] },
            { id: 'segment', source: '连接 R 到 T 的线段 t', checks: [{
              kind: 'exists', subjects: ['t'], scope: 'initial',
            }] },
            { id: 'green', source: '把圆改成绿色', checks: [{
              kind: 'style', subjects: ['circ'], scope: 'initial',
              properties: { color: '#1F8F3A' },
            }] },
          ],
        }));
      const secondDiff = JSON.parse(await readFile(
        join(second.delivery, 'diff.json'), 'utf8'));
      assert.deepEqual(secondDiff.added, ['T', 't']);
      const changed = new Set(secondDiff.changes.map(
        (change: { object: string; field: string }) =>
          `${change.object}.${change.field}`));
      assert(changed.has('O.x') && changed.has('O.y'));
      assert(changed.has('circ.circle') && changed.has('circ.color'));
      assert(!changed.has('R.x'), 'Undeclared base fields must not change');
      const secondPreview = await openPreview(second.delivery, false);
      await secondPreview.close();

      const secondBytes = await readFile(join(second.delivery, 'result.ggb'));
      const third = await build(request(directory,
        { path: join(second.delivery, 'result.ggb'),
          sha256: sha256(secondBytes) },
        '把 R 移到 (-2,1)，把滑块 n 的值设为 3，在圆上再添加点 U，连接 O 到 U 的线段 u 并改成蓝色，隐藏 P 的标签', {
          program: [
            { id: 'U', op: 'native', source: 'U=Point(circ)',
              mode: 'algebra', outputs: ['U'] },
            { id: 'u', op: 'native', source: 'u=Segment(O,U)',
              mode: 'algebra', outputs: ['u'] },
          ],
          updates: [
            { object: 'R', coords: [-2, 1] },
            { object: 'n', value: 3 },
          ],
          styles: [
            { object: 'u', properties: { color: '#1565C0' } },
            { object: 'P', properties: { labelVisible: false } },
          ],
          requirements: [
            { id: 'moveR', source: '把 R 移到 (-2,1)', checks: [{
              kind: 'coordinate', subjects: ['R'], scope: 'initial',
              coordinates: [-2, 1],
            }] },
            { id: 'value', source: '把滑块 n 的值设为 3', checks: [{
              kind: 'expression', subjects: ['n'], scope: 'initial',
              expression: 'n', mode: 'algebra', expected: 3,
            }] },
            { id: 'onCircle', source: '在圆上再添加点 U', checks: [{
              kind: 'pointOn', subjects: ['U', 'circ'], scope: 'initial',
            }] },
            { id: 'segment', source: '连接 O 到 U 的线段 u', checks: [
              { kind: 'exists', subjects: ['u'], scope: 'initial' },
              { kind: 'style', subjects: ['u'], scope: 'initial',
                properties: { color: '#1565C0' } },
            ] },
            { id: 'label', source: '隐藏 P 的标签', checks: [{
              kind: 'style', subjects: ['P'], scope: 'initial',
              properties: { labelVisible: false },
            }] },
          ],
        }));
      const thirdDiff = JSON.parse(await readFile(
        join(third.delivery, 'diff.json'), 'utf8'));
      assert.deepEqual(thirdDiff.added, ['U', 'u']);
      const changedThird = new Set(thirdDiff.changes.map(
        (change: { object: string; field: string }) =>
          `${change.object}.${change.field}`));
      assert(changedThird.has('R.x') && changedThird.has('R.y'));
      assert(changedThird.has('n.value'));
      assert(changedThird.has('P.labelVisible'));
      const report = JSON.parse(await readFile(
        join(third.delivery, 'verification.json'), 'utf8'));
      assert.equal(report.construction.status, 'passed');
      assert.equal(report.reload.status, 'passed');
      const thirdPreview = await openPreview(third.delivery, false);
      await thirdPreview.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

test('a modify delivery cannot understate its own diff',
  { timeout: 60_000 }, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ggb-modify-tamper-'));
    try {
      const bytes = await readFile(basePath);
      const result = await build(request(directory,
        { path: basePath, sha256: sha256(bytes) },
        '在圆上添加点 P', {
          program: [{ id: 'P', op: 'native', source: 'P=Point(circ)',
            mode: 'algebra', outputs: ['P'] }],
          requirements: [{ id: 'onCircle', source: '在圆上添加点 P',
            checks: [{ kind: 'pointOn', subjects: ['P', 'circ'],
              scope: 'initial' }] }],
        }));
      const tampered = join(directory, 'tampered');
      await cp(result.delivery, tampered, { recursive: true });
      const reportPath = join(tampered, 'verification.json');
      const report = JSON.parse(await readFile(reportPath, 'utf8'));
      report.modify.changes = [];
      await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
      await assert.rejects(openPreview(tampered, false), (error: any) => {
        assert.equal(error.code, 'preview_failed');
        assert.match(String(error.message), /diff does not match/);
        return true;
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
