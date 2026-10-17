/**
 * @fileoverview Unit tests for construction-guaranteed check detection.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { tautologies } from '../src/tautology.js';
import type { Step } from '../src/schema.js';

const step = (id: string, source: string): Step =>
  ({ id, op: 'native', source, mode: 'algebra' });
const check = (kind: string, subjects: string[], extra = {}) =>
  ({ kind, subjects, scope: 'initial', ...extra });
const requirements = (checks: any[]) =>
  [{ id: 'r', source: 'x', checks }];

test('path points, intersections and midpoints are construction-guaranteed',
  () => {
    const program = [
      step('el', 'el: x^2/9 + y^2/5 = 1'),
      step('P', 'P=Point(el)'),
      step('a', 'a: y=1'),
      step('Q', 'Q=Intersect(a,el)'),
      step('A', 'A=(-2,0)'),
      step('B', 'B=(2,0)'),
      step('M', 'M=Midpoint(A,B)'),
    ];
    const found = tautologies(program, requirements([
      check('pointOn', ['P', 'el']),
      check('pointOn', ['Q', 'el']),
      check('pointOn', ['Q', 'a']),
      check('midpoint', ['M', 'A', 'B']),
      check('midpoint', ['A', 'M', 'B']),
      check('pointOn', ['A', 'el']),
    ]) as any);
    assert.deepEqual(found.map(item => `${item.requirement}:${item.check}`),
      ['r:0', 'r:1', 'r:2', 'r:3']);
    assert.match(found[0]!.message, /Point\(el\)/);
    assert.match(found[1]!.message, /Intersect/);
  });

test('centres, parallels and perpendiculars report their command', () => {
  const program = [
    step('O', 'O=(0,0)'),
    step('c', 'c=Circle(O,3)'),
    step('l', 'l: y=1'),
    step('p', 'p=Line(O,l)'),
    step('n', 'n=OrthogonalLine(O,l)'),
  ];
  const found = tautologies(program, requirements([
    check('center', ['c', 'O']),
    check('parallel', ['l', 'p']),
    check('perpendicular', ['l', 'n']),
    check('center', ['c', 'O2']),
  ]) as any);
  assert.deepEqual(found.map(item => item.kind),
    ['center', 'parallel', 'perpendicular']);
  assert.match(found[1]!.message, /Line\(\.\.\., l\)/);
});

test('independent objects and equation steps are not flagged', () => {
  const program = [
    step('A', 'A=(1,2)'),
    step('el', 'el: x^2+y^2=1'),
    step('g', 'g(x)=x^2'),
    step('k', 'k=3'),
  ];
  assert.deepEqual(tautologies(program, requirements([
    check('pointOn', ['A', 'el']),
    check('parallel', ['g', 'el']),
  ]) as any), []);
});
