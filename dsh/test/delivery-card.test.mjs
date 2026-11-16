/** @fileoverview The DSH delivery card reads bounded facts and registers safely. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readDeliveryCard, registerDeliveryTool, registerPreviewCommand }
  from '../delivery-card.js';

const dshRoot = fileURLToPath(new URL('../', import.meta.url));
const scratch = [];
const directory = async () => {
  const value = await mkdtemp(join(tmpdir(), 'ggb-card-'));
  scratch.push(value);
  return value;
};
after(async () => {
  for (const value of scratch) await rm(value, { recursive: true, force: true });
});

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nGkAAAAASUVORK5CYII=',
  'base64');

/** Write a minimal committed delivery. */
async function deliveryFixture({ failure = false } = {}) {
  const root = await directory();
  const results = failure
    ? [{ status: 'failed', requirementId: 'r1', checkId: 'c1', method: 'expression',
      evidence: { message: 'expected 1, got 2' } }]
    : [{ status: 'passed', requirementId: 'r1', checkId: 'c1', method: 'expression' }];
  await writeFile(join(root, 'verification.json'), JSON.stringify({
    construction: { status: failure ? 'failed' : 'passed', results },
    reload: { status: 'passed', results: [{ status: 'passed' }] },
    interaction: { status: 'not_sampled', samples: [] },
  }));
  await writeFile(join(root, 'manifest.json'), JSON.stringify({
    file: 'demo.ggb', runtimeVersion: '5.4.932.1',
  }));
  await writeFile(join(root, 'request.json'), JSON.stringify({ plan: { title: 'Demo' } }));
  await writeFile(join(root, 'preview.png'), png);
  return root;
}

test('reads a committed delivery without inventing status', async () => {
  const root = await deliveryFixture();
  const card = await readDeliveryCard(root, root);
  assert.equal(card.title, 'demo');
  assert.equal(card.verified, true);
  assert.equal(card.phases.construction.passed, 1);
  assert.equal(card.phases.interaction.status, 'not_sampled');
  assert.equal(card.failures.length, 0);
  assert.match(card.previewPath, /preview\.png$/u);
});

test('reports failed conditions and rejects paths outside the workspace', async () => {
  const root = await deliveryFixture({ failure: true });
  const card = await readDeliveryCard(root, root);
  assert.equal(card.verified, false);
  assert.equal(card.failures.length, 1);
  assert.equal(card.failureTotal, 1);
  assert.match(card.failures[0].reason, /expected 1/u);
  await assert.rejects(() => readDeliveryCard(root, join(root, 'other')), /inside the session workspace/u);
});

test('the Host tool saves the preview as an attachment', async () => {
  const root = await deliveryFixture();
  let definition;
  const attachments = {
    async saveImage(input) {
      return { attachmentId: 'a', mediaType: 'image/png',
        bytes: input.data.length, width: 1, height: 1 };
    },
  };
  const ctx = {
    get(name) {
      if (name === 'tools') return { register(value) { definition = value; return () => {}; } };
      if (name === 'attachments') return attachments;
      if (name === 'workingDirectory') return { get: () => root };
      return undefined;
    },
    effect(callback) { callback(); },
  };
  registerDeliveryTool(ctx, dshRoot);
  assert.deepEqual(definition.parameters.required, ['delivery']);
  assert.equal('required' in definition.parameters.properties.delivery, false);
  const result = await definition.execute({ delivery: root },
    { agent: { session: {} }, signal: new AbortController().signal });
  assert.equal(result.preview.attachmentId, 'a');
  assert.equal(result.previewPath, join(root, 'preview.png'));
});

test('the preview command refuses a path without a delivery report', async () => {
  let definition;
  const ctx = {
    get(name) {
      return name === 'commands'
        ? { register(value) { definition = value; return () => {}; } }
        : undefined;
    },
    effect(callback) { callback(); },
  };
  registerPreviewCommand(ctx, dshRoot);
  const result = await definition.handler({ rawInput: '/definitely/missing-delivery' });
  assert.equal(result.kind, 'error');
});

test('the client module registers both tool cards', async () => {
  const source = await readFile(join(dshRoot, 'client.js'), 'utf8');
  let module;
  const context = {
    window: { __ModuleLoader__: { load(value) { module = value; } } },
    require(name) {
      if (name !== 'react') throw new Error('unexpected module ' + name);
      return { createElement: () => null, useState: () => [null, () => {}],
        useEffect: () => {} };
    },
  };
  vm.runInNewContext(source, context);
  assert.equal(module.id, 'ggb-plugins-dsh');
  const keys = [];
  const ctx = {
    effect(callback) { callback(); },
    locale: { register: () => () => {}, bind: () => key => key },
    slots: {
      inject(_name, callback) { callback(); },
      register(_registration, _component) { keys.push(_registration.key); return () => {}; },
    },
    remote: { commands: { execute: async () => ({ ok: true }) } },
  };
  const plugin = module.factory(context.require);
  plugin.apply(ctx);
  assert.deepEqual(keys.sort(), ['ggb_build', 'ggb_delivery']);
});

test('the client module is valid JavaScript', () => {
  execFileSync(process.execPath, ['--check', join(dshRoot, 'client.js')], { stdio: 'ignore' });
});

test('the preview command resolves Node instead of the Electron host', async () => {
  const source = await readFile(join(dshRoot, 'delivery-card.js'), 'utf8');
  assert.match(source, /DSH_GGB_NODE/u);
  assert.doesNotMatch(source, /execFileAsync\(process\.execPath/u);
});
