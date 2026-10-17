/** @fileoverview Execution notes never infer independence from command names. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { verificationNotes } from '../src/tautology.js';
import type { Check } from '../src/schema.js';

test('every requirement retains its assertion and receives the same limit', () => {
  const checks: Check[] = [
    { kind: 'midpoint', subjects: ['M', 'A', 'B'], scope: 'initial' },
    { kind: 'expression', subjects: ['M'], expression: 'x(M)',
      mode: 'algebra', expected: 0, scope: 'initial' },
  ];
  const requirements = checks.map((check, index) => ({
    id: `r${index}`, source: 'original', checks: [check],
  }));
  const before = structuredClone(requirements);
  const notes = verificationNotes(requirements);
  assert.deepEqual(requirements, before);
  assert.equal(notes.length, 2);
  assert.equal(notes[0]?.message, notes[1]?.message);
  assert.match(notes[0]?.message ?? '', /not automatically certified/);
});
