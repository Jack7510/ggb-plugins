/**
 * @fileoverview Validates delivery naming: filesystem-safe titles, bounded
 * length, reserved-name handling, and unique directory claims that never
 * overwrite an earlier delivery.
 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { claimRunDirectory, requestedName, safeName } from '../src/naming.js';

test('keeps readable titles and removes unsafe characters', () => {
  assert.equal(safeName('三角形外接圆 与中线', 60), '三角形外接圆 与中线');
  assert.equal(safeName('a/b\\c:d*e?f"g<h>i|j', 60), 'a b c d e f g h i j');
  assert.equal(safeName('a\u0000b\tc', 60), 'a b c');
  assert.equal(safeName('  ..name..  ', 60), 'name');
  assert.equal(safeName('三角形.ggb', 60), '三角形');
});

test('bounds length by code points and falls back when empty', () => {
  assert.equal(Array.from(safeName('题'.repeat(100), 10)).length, 10);
  assert.equal(safeName('😀😀😀😀', 3), '😀😀😀');
  assert.equal(safeName('///', 60), 'ggb-construction');
  assert.equal(safeName('con', 60), 'ggb-con');
});

test('prefers the host title and falls back to the prompt', () => {
  assert.equal(requestedName({ title: '外接圆', prompt: 'x' }, 60), '外接圆');
  assert.equal(requestedName({ prompt: '作三角形 ABC' }, 60), '作三角形 ABC');
});

test('claims unique run directories without overwriting deliveries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ggb-naming-'));
  try {
    const first = await claimRunDirectory(root, '三角形');
    assert.deepEqual(first, { directory: join(root, '三角形'), name: '三角形' });
    await writeFile(join(first.directory, 'keep.txt'), 'existing');
    assert.equal((await claimRunDirectory(root, '三角形')).name, '三角形-2');
    assert.equal((await claimRunDirectory(root, '三角形')).name, '三角形-3');
    assert.equal(await readFile(join(first.directory, 'keep.txt'), 'utf8'),
      'existing');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('reports a missing output root instead of creating it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ggb-naming-missing-'));
  try {
    await assert.rejects(claimRunDirectory(join(root, 'absent'), 'x'),
      /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
