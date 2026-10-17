/**
 * @fileoverview Exercises attribute editing of an existing GGB file and its
 * delivery evidence against the real applet.
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

async function editRequest(directory: string) {
  const bytes = await readFile(basePath);
  return {
    protocolVersion: 2, locale: 'zh-CN',
    prompt: '把圆改成红色实线并填充 30%',
    outputDir: directory,
    base: { path: basePath, sha256: sha256(bytes) },
    plan: {
      edits: [{
        object: 'circ',
        properties: { color: '#D92B2B', lineStyle: 0, filling: 0.3 },
      }],
      requirements: [{
        id: 'appearance', source: '改成红色实线并填充 30%',
        checks: [{
          kind: 'style', subjects: ['circ'], scope: 'initial',
          properties: { color: '#D92B2B', lineStyle: 0, filling: 0.3 },
        }],
      }],
      interactions: [],
    },
  };
}

test('attribute edits change only declared fields and keep the base',
  { timeout: 60_000 }, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ggb-edit-'));
    try {
      const input = await editRequest(directory);
      const result = await build(input);
      const manifest = JSON.parse(await readFile(
        join(result.delivery, 'manifest.json'), 'utf8'));
      const diff = JSON.parse(await readFile(
        join(result.delivery, 'diff.json'), 'utf8')) as {
        baseSha256: string; changes: { object: string; field: string }[];
      };
      const baseBytes = await readFile(join(result.delivery, 'base.ggb'));
      assert.equal(manifest.base.sha256, sha256(baseBytes));
      assert.equal(manifest.base.sha256, input.base.sha256);
      assert.equal(diff.baseSha256, input.base.sha256);
      assert.deepEqual(diff.changes.map(change =>
        `${change.object}.${change.field}`).sort(),
      ['circ.color', 'circ.filling', 'circ.lineStyle']);
      // The base file itself is never rewritten.
      assert.equal(sha256(await readFile(basePath)), input.base.sha256);
      assert((await readdir(result.delivery)).includes('preview.png'));
      const preview = await openPreview(result.delivery, false);
      await preview.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

test('a delivery cannot understate its own diff', { timeout: 60_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ggb-edit-tamper-'));
    try {
      const input = await editRequest(directory);
      const result = await build(input);
      const tampered = join(directory, 'tampered');
      await cp(result.delivery, tampered, { recursive: true });
      const reportPath = join(tampered, 'verification.json');
      const report = JSON.parse(await readFile(reportPath, 'utf8'));
      report.edit.changes = report.edit.changes.slice(0, 1);
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
