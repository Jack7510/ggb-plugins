/** @fileoverview Fault injection proves partial files never replace targets. */
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test, {mock} from 'node:test';

let fault: 'write' | 'sync' | 'rename' | undefined;
mock.module('node:fs/promises', {namedExports: {...fs,
  async open(...args: Parameters<typeof fs.open>) {
    const handle = await fs.open(...args);
    const write = handle.writeFile.bind(handle);
    const sync = handle.sync.bind(handle);
    handle.writeFile = async (...input) => {
      if (fault === 'write') {
        await write('partial');
        throw new Error('injected write');
      }
      return write(...input);
    };
    handle.sync = async () => {
      if (fault === 'sync') throw new Error('injected sync');
      await sync();
    };
    return handle;
  },
  async rename(...args: Parameters<typeof fs.rename>) {
    if (fault === 'rename') throw new Error('injected rename');
    await fs.rename(...args);
  },
}});
const {writeAtomicFile} = await import('../src/atomic-file.js');

for (const failure of ['write', 'sync', 'rename'] as const) {
  test(`atomic replacement preserves old bytes after ${failure} failure`,
    async () => {
      const directory = await fs.mkdtemp(join(tmpdir(), 'ggb-atomic-'));
      const path = join(directory, 'asset.js');
      try {
        await fs.writeFile(path, 'original', {mode: 0o640});
        fault = failure;
        await assert.rejects(writeAtomicFile(path, 'new bytes'),
          new RegExp(`injected ${failure}`));
        assert.equal(await fs.readFile(path, 'utf8'), 'original');
        assert.deepEqual(await fs.readdir(directory), ['asset.js']);
        fault = undefined;
        await writeAtomicFile(path, 'new bytes');
        assert.equal(await fs.readFile(path, 'utf8'), 'new bytes');
        assert.equal((await fs.stat(path)).mode & 0o777, 0o640);
      } finally {
        fault = undefined;
        await fs.rm(directory, {recursive: true, force: true});
      }
    });
}

test('atomic replacement refuses a symlink instead of replacing its referent',
  async () => {
    const directory = await fs.mkdtemp(join(tmpdir(), 'ggb-atomic-link-'));
    try {
      await fs.writeFile(join(directory, 'original'), 'original');
      await fs.symlink('original', join(directory, 'link'));
      await assert.rejects(writeAtomicFile(join(directory, 'link'), 'new'),
        /atomic_file_target_not_regular/u);
      assert.equal(await fs.readFile(join(directory, 'original'), 'utf8'),
        'original');
    } finally {await fs.rm(directory, {recursive: true, force: true});}
  });
