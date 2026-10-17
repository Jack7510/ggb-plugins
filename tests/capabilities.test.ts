/**
 * @fileoverview The capability manifest is the contract between the plugin and
 * every host. It must be generated from the same schema and skill text that ship
 * in the package.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { root } from '../src/server.js';
import { commands, limits, predicates } from '../src/schema.js';

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
  assert.equal(manifest.workerProfileVersion, 'plugin-core-v1');
  assert.deepEqual(manifest.modelFacingTools, ['ggb_inspect', 'ggb_check', 'ggb_build']);
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
