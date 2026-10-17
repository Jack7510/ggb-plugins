/** @fileoverview Tests structural CLI validation without construction. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { root } from '../src/server.js';

test('check validates structure and rejects source drift', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ggb-preflight-'));
  try {
    const request = JSON.parse(await readFile(
      join(root, 'examples/geometry-benchmark/01-circumcircle.json'), 'utf8',
    ));
    request.outputDir = join(directory, 'must-not-exist');
    const path = join(directory, 'request.json');
    await writeFile(path, JSON.stringify(request));
    const run = () => spawnSync(process.execPath, [
      join(root, 'dist/src/cli.js'), 'check', '--request', path,
    ], { encoding: 'utf8' });
    const valid = run();
    assert.equal(valid.status, 0, valid.stderr);
    assert.equal(JSON.parse(valid.stdout).data.validation, 'structural');
    request.prompt = 'Changed prompt';
    await writeFile(path, JSON.stringify(request));
    const invalid = run();
    assert.equal(invalid.status, 1);
    assert.match(JSON.parse(invalid.stdout).error.message, /source/);
    assert.deepEqual(await readdir(directory), ['request.json']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('once requires a headless preview and cannot open a visible session', () => {
  for (const args of [['doctor', '--once'], ['preview', '--once']]) {
    const result = spawnSync(process.execPath, [
      join(root, 'dist/src/cli.js'), ...args,
    ], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(JSON.parse(result.stdout).error.message, /requires/);
  }
});
