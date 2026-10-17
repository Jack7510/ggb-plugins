import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { build, openPreview, sha256 } from '../src/delivery.js';
import { parseRequest } from '../src/schema.js';
import { root } from '../src/server.js';

const fixture = async (name: string) => JSON.parse(await readFile(join(root, `tests/fixtures/${name}.json`), 'utf8'));

test('nested native lists preserve small decimals, boolean types and empty lists', { timeout: 30_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ggb-m6-values-'));
  try {
    const input = await fixture('statistics'); input.outputDir = directory;
    input.plan.program = [{id:'matrixA',op:'native',mode:'algebra',source:'matrixA={{0.000000123456789,true},{false,-0.0000001},{}}'}];
    input.plan.requirements[0].checks = [{kind:'expression',subjects:['matrixA'],expression:'matrixA',expected:[[0.000000123456789,true],[false,-0.0000001],[]],mode:'algebra',scope:'initial'}];
    const result = await build(input), report = JSON.parse(await readFile(result.report, 'utf8'));
    assert.deepEqual(report.reload.objects[0].data, input.plan.requirements[0].checks[0].expected);
    const preview = await openPreview(result.delivery, false); await preview.close();
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('native generated subscript labels remain usable without command-specific renaming', { timeout: 30_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ggb-m6-labels-'));
  try {
    const input = await fixture('functions'); input.outputDir = directory;
    input.plan.program.at(-1).id = 'B_{1}'; input.plan.program.at(-1).source = 'B=Intersect(circleA,lineA)';
    input.plan.program.at(-1).outputs = ['B_{1}', 'B_{2}']; input.plan.interactions = [];
    input.plan.requirements[0].checks = [{kind:'expression',subjects:['B_{1}','B_{2}'],expression:'x(B_{1})+x(B_{2})',mode:'algebra',expected:0,scope:'initial'}];
    const result = await build(input);
    const preview = await openPreview(result.delivery, false); await preview.close();
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('new interpolation and list-statistics combination only changes native input', { timeout: 30_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ggb-m6-combination-'));
  try {
    const input = await fixture('statistics'); input.outputDir = directory;
    input.prompt = '对 {-2,1,3} 的平方求中位数；插值通过 (0,1)、(1,4)、(2,9) 的多项式并求 0 到 1 的积分。';
    input.plan.program = [
      {id:'squared',op:'native',mode:'algebra',source:'squared=Zip(t^2,t,{-2,1,3})'},
      {id:'middle',op:'native',mode:'algebra',source:'middle=Median(squared)'},
      {id:'fitted',op:'native',mode:'algebra',source:'fitted=Polynomial({(0,1),(1,4),(2,9)})'},
      {id:'integralA',op:'native',mode:'algebra',source:'integralA=Integral(fitted,0,1)'},
    ];
    input.plan.requirements = [{id:'result',source:input.prompt,checks:[
      {kind:'expression',subjects:['squared'],expression:'squared',mode:'algebra',expected:[4,1,9],scope:'initial'},
      {kind:'expression',subjects:['middle'],expression:'middle',mode:'algebra',expected:4,scope:'initial'},
      {kind:'expression',subjects:['fitted'],expression:'Simplify(fitted(x)-(x+1)^2)',mode:'cas',expected:0,scope:'initial'},
      {kind:'expression',subjects:['integralA'],expression:'integralA',mode:'algebra',expected:7/3,scope:'initial'},
    ]}];
    const result = await build(input);
    const preview = await openPreview(result.delivery, false); await preview.close();
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('M6 reuses native delivery for calculus, inequalities, sliders, paths, matrices and statistics', { timeout: 90_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'ggb-m6-'));
  try {
    for (const name of ['functions', 'statistics', 'parameters-algebra']) await t.test(name, async () => {
      const input = await fixture(name === 'parameters-algebra' ? 'functions' : name); input.outputDir = directory;
      if (name === 'parameters-algebra') { input.plan.display = 'algebra'; input.plan.interactions = input.plan.interactions.filter((s: any) => s.parameter); }
      const result = await build(input), before = sha256(await readFile(result.file));
      const report = JSON.parse(await readFile(result.report, 'utf8'));
      assert.equal(report.milestone, 'M6'); assert.equal(report.reload.status, 'passed');
      if (name === 'functions') {
        assert.deepEqual(report.interaction.samples.map((s: any) => s.method), ['native_value', 'native_value', 'mouse']);
        assert.deepEqual(report.interaction.samples.slice(0, 2).map((s: any) => s.after.objects.find((o: any) => o.name === 'a').value), [2.5, 3]);
        assert.equal(report.reload.objects.find((o: any) => o.name === 'a').value, 1, 'Samples cannot modify the delivery canvas');
        assert.deepEqual(report.reload.objects.find((o: any) => o.name === 'f').inputs, ['a']);
      } else if (name === 'statistics') {
        assert.deepEqual(report.reload.objects.find((o: any) => o.name === 'identityA').data, [[1, 0], [0, 1]]);
        assert(report.reload.observations.some((o: any) => o.assumptions.includes('x>0') && o.value === 0));
      } else {
        assert(report.interaction.samples.every((s: any) => s.method === 'native_value'));
        assert.equal(report.interaction.zoom.method, 'not_applicable');
      }
      const preview = await openPreview(result.delivery, false);
      try {
        assert(await preview.page.locator('#applet').isVisible());
        if (name === 'functions') {
          const scales = await preview.page.evaluate(() => {
            const view = new DOMParser().parseFromString(window.ggb.getXML(), 'text/xml').querySelector('euclidianView coordSystem')!;
            return [Number(view.getAttribute('scale')), Number(view.getAttribute('yscale') ?? view.getAttribute('scale'))];
          });
          assert(Math.abs(scales[0]! - scales[1]!) < 1e-8, 'Circle geometry must use equal axis scales');
        }
      } finally { await preview.close(); }
      assert.equal(sha256(await readFile(result.file)), before);
      const saved = await readFile(result.report, 'utf8');
      if (name !== 'statistics') report.interaction.samples[0].value = 2;
      else report.reload.observations.find((o: any) => o.assumptions.length).assumptions = [];
      await writeFile(result.report, JSON.stringify(report));
      await assert.rejects(openPreview(result.delivery, false));
      await writeFile(result.report, saved);
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('M6 rejects unresolved conditions, omitted outputs, typed-list errors and invalid interactions', { timeout: 90_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'ggb-m6-failures-'));
  try {
    const cases: [string, string, (r: any) => void, string][] = [
      ['unconditional symbolic claim', 'statistics', r => { delete r.plan.requirements[0].checks[5].assumptions; }, 'verification_unverified'],
      ['wrong matrix', 'statistics', r => { r.plan.requirements[0].checks[4].expected[0][0] = 2; }, 'verification_failed'],
      ['matrix numeric gray zone', 'statistics', r => { r.plan.requirements[0].checks[4].expected[0][0] += 5e-8; }, 'verification_unverified'],
      ['boolean is not numeric list value', 'statistics', r => { r.plan.requirements[0].checks[0].expected[0] = true; }, 'verification_unverified'],
      ['undefined list element', 'statistics', r => { r.plan.requirements[0].checks[0].expression = 'Append(samples,?)'; r.plan.requirements[0].checks[0].expected.push(0); }, 'verification_unverified'],
      ['omitted native output', 'functions', r => { r.plan.program.at(-1).outputs = ['A']; }, 'invalid_input'],
      ['native output omission reaches engine', 'functions', r => { r.plan.program.at(-1).outputs = ['A']; r.plan.requirements[0].checks = [{kind:'type',subjects:['A'],objectType:'point',scope:'initial'}]; }, 'execution_failed'],
      ['slider outside interval', 'functions', r => { r.plan.interactions[0].value = 4; }, 'verification_failed'],
      ['unchanged slider', 'functions', r => { r.plan.interactions[0].value = 1; }, 'verification_failed'],
      ['fixed slider', 'functions', r => { r.plan.styles = [{object:'a',properties:{fixed:true}}]; }, 'verification_failed'],
      ['dependent number is not slider', 'functions', r => { r.plan.interactions[0] = {parameter:'area',value:2}; }, 'verification_failed'],
      ['sampled degeneration', 'functions', r => { r.plan.program.splice(4,0,{id:'reciprocal',op:'native',mode:'algebra',source:'reciprocal=1/(a-3)'}); }, 'verification_failed'],
      ['sampled branch mismatch', 'functions', r => { r.plan.requirements[0].checks.push({kind:'expression',subjects:['a'],expression:'If(a<2,1,0)',mode:'algebra',expected:1,scope:'sampled'}); }, 'verification_failed'],
    ];
    for (const [name, source, change, code] of cases) await t.test(name, async () => {
      const input = await fixture(source); input.outputDir = join(directory, name); change(input);
      await assert.rejects(build(input), (error: any) => error.code === code);
      const runs = await readdir(input.outputDir).catch(() => []);
      for (const run of runs) assert(!(await readdir(join(input.outputDir, run))).includes('delivery'));
    });
    await t.test('assumptions cannot silently add a premise', async () => {
      const input = await fixture('statistics'); input.plan.requirements[0].checks[5].assumptions = ['x<0'];
      assert.throws(() => parseRequest(input), /Assumption is not in the input/);
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
