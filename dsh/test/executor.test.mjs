/** @fileoverview Offline executor phase tests; no provider or browser. */
import assert from 'node:assert/strict';
import {randomUUID, createHash} from 'node:crypto';
import {readFile, mkdtemp, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {digestJson} from '../../dist/src/host-protocol.js';
// A source checkout has a desktop package name; package tests extract the DSH
// archive and use that public entry instead. This test uses the same extraction.
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'executor-phase-'));
  const pkg = JSON.parse(execFileSync(process.execPath,
    ['scripts/package-plugin.mjs', root, '--target=dsh'], {encoding: 'utf8'}));
  execFileSync('tar', ['-xzf', pkg.archive, '-C', root]);
  await symlink(new URL('../../node_modules', import.meta.url).pathname,
    join(root, 'package/node_modules'), 'dir');
  const {executeHostOperation} = await import(pathToFileURL(
    join(root, 'package/dsh/executor.js')));
  const {ToolError: InstalledError} = await import(pathToFileURL(
    join(root, 'package/dist/src/schema.js')));
  const request = JSON.parse(await readFile(new URL(
    '../../examples/v2-cases/triangle.json', import.meta.url)));
  delete request.outputDir;
  const context = {protocolVersion: 2, runId: 'run_' + randomUUID(),
    turnId: randomUUID(), requestId: randomUUID(), toolCallId: randomUUID(),
    buildId: randomUUID(), epoch: 1, domainRequestDigest: digestJson(request),
    baseRef: null, baseSha256: null, outputRoot: root,
    deadline: new Date(Date.now() + 30000).toISOString()};
  return {root, request, context, executeHostOperation, InstalledError};
}

test('preflight rejects before build dispatch; the same check uses envelope 3',
  async () => {
    const f = await fixture();
    try {
      let builds = 0;
      const invalid = {protocolVersion: 2, prompt: 'missing plan'};
      const context = {...f.context, domainRequestDigest: digestJson(invalid)};
      const result = await f.executeHostOperation('build', invalid, context,
        'a'.repeat(64), undefined, {build: async () => { builds++; }});
      assert.equal(builds, 0);
      assert.equal(result.protocolVersion, 3);
      assert.equal(result.phase, 'preflight');
      assert.equal(result.receipt.status, 'rejected');
      const check = await f.executeHostOperation('check', f.request,
        f.context, 'a'.repeat(64));
      assert.equal(check.ok, true);
      assert.equal(check.data.validation, 'structural');
      assert.equal(check.receipt, null);
      const path = join(f.root, 'desktop-request.json');
      await writeFile(path, JSON.stringify({...f.request, outputDir: f.root}));
      const cli = JSON.parse(execFileSync(process.execPath, [
        join(f.root, 'package/dist/src/cli.js'), 'check', '--request', path,
      ], {encoding: 'utf8'}));
      assert.equal(cli.protocolVersion, 1);
      assert.deepEqual(check.data, cli.data);
    } finally { await rm(f.root, {recursive: true, force: true}); }
  });

test('the same error code after dispatch is execution, never preflight',
  async () => {
    const f = await fixture();
    try {
      const result = await f.executeHostOperation('build', f.request,
        f.context, 'a'.repeat(64), undefined, {build: async () => {
          throw new f.InstalledError('invalid_input', 'runtime input error');
        }});
      assert.equal(result.ok, false);
      assert.equal(result.phase, 'execution');
      assert.equal(result.error.code, 'invalid_input');
      await assert.rejects(f.executeHostOperation('build', f.request,
        f.context, 'a'.repeat(64), undefined, {build: async () => {
          throw new Error('unexpected runtime fault');
        }}), /unexpected runtime fault/);
    } finally { await rm(f.root, {recursive: true, force: true}); }
  });

test('unexpected preflight faults reject instead of becoming invalid_input',
  async () => {
    const f = await fixture();
    try {
      await assert.rejects(f.executeHostOperation('build', f.request,
        f.context, 'a'.repeat(64), undefined, {check: async () => {
          throw new TypeError('preflight program fault');
        }}), /preflight program fault/);
    } finally { await rm(f.root, {recursive: true, force: true}); }
  });


test('inspect uses the declared base and strips paths from public data',
  async () => {
    const f = await fixture();
    try {
      const base = Buffer.from('synthetic base for injected inspect');
      const path = join(f.root, 'host-base.ggb');
      await writeFile(path, base);
      const sha256 = createHash('sha256').update(base).digest('hex');
      const context = {...f.context, domainRequestDigest: digestJson({}),
        baseRef: path, baseSha256: sha256};
      const result = await f.executeHostOperation('inspect', {}, context,
        'a'.repeat(64), undefined, {inspect: async received => {
          assert.equal(received, path);
          return {path, sha256, bytes: base.length, version: '5.0',
            entries: ['geogebra.xml'], view: null, objects: []};
        }});
      assert.equal(result.ok, true);
      assert.equal(result.operation, 'inspect');
      assert.equal(result.data.sha256, sha256);
      assert.equal(Object.hasOwn(result.data, 'path'), false);
      await assert.rejects(f.executeHostOperation('inspect', {},
        {...context, baseSha256: '0'.repeat(64)}, 'a'.repeat(64)),
      /Expected values to be strictly equal/);
    } finally { await rm(f.root, {recursive: true, force: true}); }
  });


test('rejects baseline mutation during an otherwise successful inspect',
  async () => {
    const f = await fixture();
    try {
      const path = join(f.root, 'base.ggb');
      const bytes = Buffer.from('original');
      await writeFile(path, bytes);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const context = {...f.context, domainRequestDigest: digestJson({}),
        baseRef: path, baseSha256: sha256};
      await assert.rejects(f.executeHostOperation('inspect', {}, context,
        'a'.repeat(64), undefined, {inspect: async () => {
          await writeFile(path, 'modified');
          return {sha256, bytes: bytes.length, version: '5.0',
            entries: [], view: null, objects: []};
        }}), /Input baseline changed/);
    } finally { await rm(f.root, {recursive: true, force: true}); }
  });
