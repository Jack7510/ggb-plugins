import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { build, openPreview, sha256 } from '../src/delivery.js';
import { root } from '../src/server.js';
import { parseRequest } from '../src/schema.js';
import { compile } from '../src/compile.js';

const fixture = async (name: string) => JSON.parse(await readFile(join(root, `examples/${name}.json`), 'utf8'));

test('native program contract accepts new mathematical commands without wrappers and rejects effects', async () => {
  const input = await fixture('algebra');
  input.plan.program[0].source = 'FutureMathematicalCommand(x)';
  assert(compile(parseRequest(input)).native, 'GeoGebra, not a tool whitelist, resolves mathematical syntax');
  for (const source of ['Execute({"Delete(A)"})', 'RunUpdateScript(A)', 'ExportImage("filename","x")', 'SetValue(A,2)', 'x=1\ny=2', 'x=1; y=2']) {
    const changed = await fixture('algebra'); changed.plan.program[0].source = source;
    assert.throws(() => parseRequest(changed));
  }
  const constant = await fixture('algebra'); constant.plan.requirements[0].checks[0].expression = 'true';
  assert.throws(() => parseRequest(constant), /reference/);
});

test('M5 uses the same delivery pipeline for conics, CAS, M1 and an independent new combination', { timeout: 120_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'ggb-native-'));
  try {
    for (const name of ['parabola', 'algebra', 'triangle']) await t.test(name, async () => {
      const input = await fixture(name); input.outputDir = directory;
      const result = await build(input);
      const before = await readFile(result.file);
      const report = JSON.parse(await readFile(result.report, 'utf8'));
      assert.equal(report.milestone, 'M5'); assert.equal(report.reload.status, 'passed');
      assert.equal(report.interaction.samples.length, input.plan.interactions.length);
      const session = await openPreview(result.delivery, false);
      try {
        if (name === 'algebra') {
          assert(await session.page.locator('.algebraPanel').isVisible());
          for (const id of ['factored', 'expanded', 'solutions', 'matrixA', 'detA']) assert(report.reload.objects.find((o: any) => o.name === id)?.valueString.includes(id));
          assert.equal(report.interaction.zoom.method, 'not_applicable');
          assert(report.reload.observations.every((o: any) => o.defined));
        }
        if (name === 'parabola') {
          assert(report.reload.objects.some((o: any) => o.type === 'parabola'));
          assert.equal(report.interaction.samples[0].point, 'A', 'Path points, not only independent points, are draggable');

        }
      } finally { await session.close(); }
      assert.equal(sha256(await readFile(result.file)), sha256(before));
      if (name === 'algebra') {
        const path = join(result.delivery, 'verification.json');
        const saved = await readFile(path, 'utf8');
        report.reload.observations[0].value = 900;
        await writeFile(path, JSON.stringify(report));
        await assert.rejects(openPreview(result.delivery, false)); await writeFile(path, saved);
      }
    });
    await t.test('derivative and sequence reuse the frozen native interface', async () => {
      const input = await fixture('algebra'); input.outputDir = directory;
      input.prompt = '对 h(x)=x^3+2x 求导，并生成数列 1,3,5,7，验证导数和数列和。';
      input.plan.program = [
        { id: 'curve', op: 'native', mode: 'algebra', source: 'curve(x)=x^3+2x' },
        { id: 'slope', op: 'native', mode: 'algebra', source: 'slope=Derivative(curve)' },
        { id: 'numbers', op: 'native', mode: 'algebra', source: 'numbers=Sequence(2j+1,j,0,3)' },
      ];
      input.plan.requirements = [{ id: 'results', source: input.prompt, checks: [
        { kind: 'expression', subjects: ['slope'], expression: 'Simplify(slope(x)-(3x^2+2))', mode: 'cas', expected: 0, scope: 'initial' },
        { kind: 'dependsOn', subjects: ['slope', 'curve'], scope: 'initial' },
        { kind: 'expression', subjects: ['numbers'], expression: 'Sum(numbers)', mode: 'algebra', expected: 16, scope: 'initial' },
      ] }];
      const result = await build(input); const preview = await openPreview(result.delivery, false); await preview.close();
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('native failures and unresolved probes never commit delivery', { timeout: 120_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'ggb-native-failure-'));
  try {
    const cases: [string, (r: any) => void, string][] = [
      ['wrong result', r => { r.plan.requirements[0].checks[0].expected = 1; }, 'verification_failed'],
      ['undefined probe', r => { r.plan.requirements[0].checks[0] = { kind: 'expression', subjects: ['factored'], expression: 'factored(0)/0', mode: 'algebra', expected: 0, scope: 'initial' }; }, 'verification_unverified'],
      ['missing probe input', r => { r.plan.requirements[0].checks[0] = { kind: 'expression', subjects: ['factored'], expression: 'factored(0)+MissingProbeInput', mode: 'algebra', expected: 0, scope: 'initial' }; }, 'verification_unverified'],
      ['numeric zero is not boolean false', r => { r.plan.requirements[0].checks[0] = { kind: 'expression', subjects: ['factored'], expression: '0*factored(0)', mode: 'algebra', expected: false, scope: 'initial' }; }, 'verification_unverified'],
      ['unknown math command', r => { r.plan.program[0].source = 'FutureMathematicalCommand(x)'; }, 'execution_failed'],
      ['spatial object', r => { r.plan.program[0] = { id: 'factored', op: 'native', mode: 'algebra', source: 'factored=(1,2,3)' }; }, 'execution_failed'],
      ['CAS syntax', r => { r.plan.program[0].source = 'Factor('; }, 'execution_failed'],
      ['missing declared output', r => { r.plan.program[0] = { id: 'factored', op: 'native', mode: 'algebra', source: 'other=1' }; }, 'execution_failed'],
    ];
    await t.test('native fixed coordinates cannot counterfeit a dependency', async () => {
      const input = await fixture('parabola'); input.outputDir = join(directory, 'fake-dependent-point');
      input.plan.program.find((step: any) => step.id === 'T').source = 'T=(1,2)';
      await assert.rejects(build(input), (e: any) => e.code === 'verification_failed');
    });
    await t.test('local binding cannot counterfeit a global dependency', async () => {
      const input = await fixture('algebra'); input.outputDir = join(directory, 'local-binding');
      input.plan.program = [{id:'n',op:'native',mode:'algebra',source:'n=99'}, {id:'values',op:'native',mode:'algebra',source:'values=Sequence(n,n,1,3)'}];
      input.plan.requirements = [{id:'dependency',source:input.prompt,checks:[{kind:'dependsOn',subjects:['values','n'],scope:'initial'}]}];
      await assert.rejects(build(input), (e: any) => e.code === 'verification_unverified');
    });
    await t.test('function parameter shadowing cannot certify a global dependency', async () => {
      const input = await fixture('algebra'); input.outputDir = join(directory, 'function-binding');
      input.plan.program = [{id:'t',op:'native',mode:'algebra',source:'t=99'}, {id:'offset',op:'native',mode:'algebra',source:'offset=3'}, {id:'func',op:'native',mode:'algebra',source:'func(t)=t+offset'}];
      input.plan.requirements = [{id:'dependency',source:input.prompt,checks:[{kind:'dependsOn',subjects:['func','t'],scope:'initial'}]}];
      await assert.rejects(build(input), (e: any) => ['verification_unverified', 'verification_failed'].includes(e.code));
    });
    for (const [name, mutate, code] of cases) await t.test(name, async () => {
      const input = await fixture('algebra'); input.outputDir = join(directory, name); mutate(input);
      await assert.rejects(build(input), (e: any) => e.code === code);
      for (const run of await readdir(input.outputDir)) assert(!(await readdir(join(input.outputDir, run))).includes('delivery'));
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
