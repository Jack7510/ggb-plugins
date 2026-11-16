/**
 * @fileoverview The template index must stay small, unique and runnable.
 */
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { root } from '../src/server.js';

const directory = join(root, 'examples/templates');
const index = JSON.parse(await readFile(join(directory, 'templates.json'), 'utf8')) as {
  format?: unknown;
  templates?: Array<Record<string, unknown>>;
};

test('the template index has ten unique runnable entries', async () => {
  assert.equal(index.format, 1);
  assert.equal(index.templates?.length, 10);
  const ids = new Set<string>();
  for (const template of index.templates ?? []) {
    const id = template.id;
    if (typeof id !== 'string') throw new Error('template id must be a string');
    assert.ok(!ids.has(id), `duplicate template id: ${id}`);
    ids.add(id);
    const source = template.source;
    const caseFile = template.case;
    if (typeof source !== 'string') throw new Error(`${id} needs a source`);
    if (typeof caseFile !== 'string') throw new Error(`${id} needs a case document`);
    const sourcePath = resolve(directory, source);
    const casePath = resolve(directory, caseFile);
    await access(sourcePath);
    await access(casePath);
    const request = JSON.parse(await readFile(sourcePath, 'utf8')) as {
      plan?: { program?: unknown[]; requirements?: unknown[] };
    };
    assert.ok(Array.isArray(request.plan?.program) && request.plan.program.length > 0,
      `${id} source has no program`);
    assert.ok(Array.isArray(request.plan?.requirements) && request.plan.requirements.length > 0,
      `${id} source has no requirements`);
  }
  assert.equal(ids.size, 10);
});

test('template labels and focus stay bilingual and non-empty', () => {
  for (const template of index.templates ?? []) {
    const title = template.title as Record<string, unknown>;
    const focus = template.focus as Record<string, unknown>;
    assert.equal(typeof title.zh, 'string');
    assert.equal(typeof title.en, 'string');
    assert.equal(typeof focus.zh, 'string');
    assert.equal(typeof focus.en, 'string');
    assert.ok((title.zh as string).length > 0 && (title.en as string).length > 0);
  }
});
