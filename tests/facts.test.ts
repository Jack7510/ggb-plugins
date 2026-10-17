/** @fileoverview Counterexamples for shared identity and authorization facts. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dependents, dependsOn, dependencyFacts, presentationOwner,
  requireSampleCoverage, type ObjectMetadata,
} from '../src/facts.js';
import { diffViolations } from '../src/edit.js';
import { mathTokens, parseRequest, type Request } from '../src/schema.js';

function metadata(args: string[]): ObjectMetadata {
  return {
    name: 'M', xmlType: 'point', expression: null,
    definition: { name: 'Midpoint', args }, outputs: ['M'],
    coords: null, matrix: null, fixed: false, slider: null,
  };
}

test('exact engine identities never alias a prefix, prime or Unicode name', () => {
  const names = ['P', "P'", 'θ1', 'A_{1}', 'M'];
  const graph = dependencyFacts(names, names.map(target => ({
    target, removed: [target, ...(["P'", 'θ1', 'A_{1}'].includes(target)
      ? ['M'] : [])],
  })));
  assert.deepEqual(graph.get('M'), ["P'", 'θ1', 'A_{1}']);
  const links = [...graph].map(([name, inputs]) => ({ name, inputs,
    referenceState: 'direct' as const }));
  assert.equal(dependents(links, ['P']).size, 0);
  assert.deepEqual([...dependents(links, ["P'"])], ['M']);
});

test('partial or ambiguous evidence cannot authorize dependencies', () => {
  assert.throws(() => dependencyFacts(['A', 'B'], [
    { target: 'A', removed: ['A'] },
  ]), /Incomplete native dependency/);
  const links = [{ name: 'M', inputs: ['n'],
    referenceState: 'ambiguous' as const }];
  assert.equal(dependents(links, ['n']).size, 0);
  assert.throws(() => dependsOn(links, 'M', 'n'), /semantic resolution/);
});

test('mathematical dependency does not grant appearance propagation', () => {
  const links = [{ name: 'B', inputs: ['A'],
    referenceState: 'direct' as const }];
  for (const field of ['visible', 'color', 'filling', 'labelVisible']) {
    const value = field === 'color' ? '#112233' : false;
    const edits = [{ object: 'A', properties: { [field]: value } }];
    const difference = { object: 'B', field, expected: true, actual: value };
    assert.equal(diffViolations(edits, [difference], links).length, 1);
  }
});

test('only engine-owned stroke fields propagate, not visibility or filling', () => {
  const material = metadata(['P', 'Q', 'R']);
  material.name = 'edge';
  material.definition = { name: 'Polygon', args: ['P', 'Q', 'R'] };
  material.outputs = ['shape', 'edge'];
  const owner = presentationOwner(material,
    new Map([['shape', 'polygon'], ['edge', 'segment']]));
  const links = [{ name: 'edge', inputs: ['P', 'Q', 'R'], ...owner }];
  const edits = [{ object: 'shape', properties: {
    color: '#112233', visible: false, filling: 0.5,
  } }];
  const differences = [
    { object: 'edge', field: 'color', expected: '#FFFFFF', actual: '#112233' },
    { object: 'edge', field: 'visible', expected: true, actual: false },
    { object: 'edge', field: 'filling', expected: 0, actual: 0.5 },
  ];
  assert.deepEqual(diffViolations(edits, differences, links)
    .map(item => item.field), ['visible', 'filling']);
  differences[0]!.actual = '#556677';
  assert.equal(diffViolations(edits, differences, links).length, 3);
});

test('coverage uses dependency facts and cannot be waived by purpose', () => {
  const request: Request = {
    protocolVersion: 2, prompt: 'midpoint', locale: 'en', outputDir: '/tmp/x',
    plan: { program: [], requirements: [{ id: 'mid', source: 'midpoint',
      purpose: 'construction', checks: [{ kind: 'midpoint',
        subjects: ['M', 'A', 'B'], scope: 'sampled' }] }],
    interactions: [{ point: 'U', dx: 40, dy: 30 }] },
  };
  const facts = ['A', 'B', 'U', 'M'].map(name => ({
    name, inputs: name === 'M' ? ['A', 'B'] : [],
    referenceState: 'direct' as const, type: 'point',
    moveable: name !== 'M', independent: name !== 'M', fixed: false,
    slider: null,
  }));
  assert.throws(() => requireSampleCoverage(request, facts),
    /No relevant interaction/);
  request.plan.interactions = [{ point: 'A', dx: 40, dy: 30 }];
  assert.doesNotThrow(() => requireSampleCoverage(request, facts));
  request.plan.program = [{ id: 'A', op: 'native', source: 'A=(1,2)',
    mode: 'algebra' }, { id: 'B', op: 'native', source: 'B=(3,4)',
    mode: 'algebra' }, { id: 'M', op: 'native', source: 'M=Midpoint(A,B)',
    mode: 'algebra' }];
  assert.equal(parseRequest(request).plan.requirements[0]?.purpose,
    'construction');
  assert.throws(() => parseRequest({ ...request, plan: { ...request.plan,
    requirements: [{ ...request.plan.requirements[0], purpose: 'passed' }],
  } }), /Invalid evidence purpose/);
});


test('source sanity checks preserve complete native label tokens', () => {
  const tokens = mathTokens("Distance(P',θ1)+x(A_{1})+P\u0301");
  assert(tokens.includes("P'") && tokens.includes('θ1'));
  assert(tokens.includes('A_{1}'));
  assert(tokens.includes('P\u0301'));
  assert(!tokens.includes('P'));
});


test('fixed assertions stay sampled without pretending to prove interaction', () => {
  const request: Request = {
    protocolVersion: 2, prompt: 'fixed and movable', locale: 'en',
    outputDir: '/tmp/x', plan: { program: [], requirements: [{
      id: 'constant', source: 'fixed', purpose: 'constraint', checks: [{
        kind: 'coordinate', subjects: ['F'], coordinates: [0, 0],
        scope: 'sampled',
      }],
    }, { id: 'dynamic', source: 'movable', checks: [{ kind: 'midpoint',
      subjects: ['M', 'A', 'B'], scope: 'sampled' }] }],
    interactions: [{ point: 'A', dx: 40, dy: 30 }] },
  };
  const facts = ['F', 'A', 'B', 'M'].map(name => ({
    name, type: 'point', moveable: name !== 'M', fixed: name === 'F',
    independent: name !== 'M', slider: null,
    inputs: name === 'M' ? ['A', 'B'] : [],
    referenceState: 'direct' as const,
  }));
  assert.doesNotThrow(() => requireSampleCoverage(request, facts));
  assert.equal(request.plan.requirements[0]?.checks[0]?.scope, 'sampled');
  request.plan.requirements[0]!.purpose = 'interaction';
  assert.throws(() => requireSampleCoverage(request, facts),
    /No controllable input/);
});
