import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { compile } from '../src/compile.js';
import { build } from '../src/delivery.js';
import { parseRequest } from '../src/schema.js';
import { root } from '../src/server.js';
import { equivalent } from '../src/verify.js';

const fixture = JSON.parse(await readFile(join(root, 'examples/triangle.json'), 'utf8'));
test('programs can reference later declarations and compile in dependency order', () => {
  const input = structuredClone(fixture);
  input.plan.program.reverse();
  const result = compile(parseRequest(input));
  const index = (id: string) => result.program.findIndex(s => s.step.id === id);
  assert(index('M') > index('A') && index('M') > index('B'));
  assert(index('median') > index('M') && index('median') > index('C'));
});

test('unsafe inputs, invalid graphs and unsupported verification are rejected before browser execution', async t => {
  const cases: [string, (input: any) => void][] = [
    ['raw script', r => { r.script = 'alert(1)'; }],
    ['external GGB', r => { r.initialGgbPath = '/tmp/unknown.ggb'; }],
    ['injected reference', r => { r.plan.program[4].args[0].ref = 'A)\nDelete(B)'; }],
    ['unsupported command', r => { r.plan.program[4].name = 'Execute'; }],
    ['duplicate object', r => { r.plan.program[1].id = 'A'; }],
    ['missing reference', r => { r.plan.program[4].args[0].ref = 'Missing'; }],
    ['dependency cycle', r => { r.plan.program[4].args[0].ref = 'M'; }],
    ['invalid argument type', r => { r.plan.program[4].args[0] = 2; }],
    ['empty requirements', r => { r.plan.requirements = []; }],
    ['empty checks', r => { r.plan.requirements[0].checks = []; }],
    ['invented source', r => { r.plan.requirements[0].source = 'Not in prompt'; }],
    ['unsupported method', r => { r.plan.requirements[0].checks[0].kind = 'proveEverything'; }],
    ['forged result', r => { r.plan.requirements[0].checks[0].status = 'passed'; }],
    ['caller tolerance', r => { r.plan.requirements[0].checks[0].tolerance = 10; }],
    ['unknown check subject', r => { r.plan.requirements[0].checks[0].subjects = ['Unknown']; }],
    ['dependent drag point', r => { r.plan.interactions[0].point = 'M'; }],
    ['invalid style target', r => { r.plan.styles[0].object = 'Missing'; }],
    ['invalid line thickness', r => { r.plan.styles[1].properties.lineThickness = 0; }],
  ];
  const directory = await mkdtemp(join(tmpdir(), 'ggb-reject-'));
  try {
    for (const [name, mutate] of cases) await t.test(name, async () => {
      const input = structuredClone(fixture); input.outputDir = join(directory, name);
      mutate(input);
      await assert.rejects(build(input));
      await assert.rejects(stat(input.outputDir), /ENOENT/, 'Invalid input must not write artifacts');
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('consistency comparison tolerates numerical noise but preserves identity and dependency', () => {
  assert(equivalent({ x: 1 }, { x: 1 + 1e-9 }));
  assert(!equivalent({ x: 1 }, { x: 1 + 5e-8 }));
  assert(!equivalent({ x: 1 }, { x: 1.001 }));
  assert(!equivalent({ ref: 'A' }, { ref: 'B' }));
  assert(!equivalent({ x: 1 }, { x: '1' }));
});
