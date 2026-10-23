import assert from 'node:assert/strict';
import test from 'node:test';
import { parseNativeLabels } from '../src/browser.js';

test('normalizes native output labels from GeoGebra command results', () => {
  assert.deepEqual(parseNativeLabels('F,undefined'), ['F']);
  assert.deepEqual(parseNativeLabels('d,d'), ['d']);
  assert.deepEqual(parseNativeLabels('A, B, null, undefined'), ['A', 'B']);
  assert.deepEqual(parseNativeLabels(''), []);
  assert.equal(parseNativeLabels(null), null);
});
