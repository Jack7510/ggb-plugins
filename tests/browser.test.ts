import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { dragPoint, loadGgb, snapshot, zoom } from '../src/browser.js';
import { build, openPreview, sha256 } from '../src/delivery.js';
import { parseRequest, type Request } from '../src/schema.js';
import { root } from '../src/server.js';
import { compareSnapshots, verify } from '../src/verify.js';

const fixture = async (name: string) => parseRequest(JSON.parse(await readFile(join(root, `examples/${name}.json`), 'utf8')));
const cli = join(root, 'dist/src/cli.js');

test('different constructions use one execution, verification and delivery pipeline', { timeout: 120_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'ggb-browser-'));
  try {
    for (const name of ['triangle', 'bisector', 'circle', 'transfer']) await t.test(name, async t => {
      const request = await fixture(name); request.outputDir = join(directory, name);
      const path = join(directory, name + '.json'); await writeFile(path, JSON.stringify(request));
      const { stdout } = await promisify(execFile)(process.execPath, [cli, 'build', '--request', path], { timeout: 60_000 });
      const result = JSON.parse(stdout); assert.equal(result.ok, true, stdout);
      const { delivery, file } = result.data;
      const bytes = await readFile(file), hash = sha256(bytes);
      const reportPath = join(delivery, 'verification.json');
      const report = JSON.parse(await readFile(reportPath, 'utf8'));
      for (const key of ['construction', 'reload', 'interaction']) assert.equal(report[key].status, 'passed');
      const handlers = ['SIGINT', 'SIGTERM'].map(signal => process.listeners(signal));
      const exitCode = process.exitCode;
      const session = await openPreview(delivery, process.env.GGB_HEADED === '1');
      try {
        assert.deepEqual(['SIGINT', 'SIGTERM'].map(signal => process.listeners(signal)), handlers);
        assert.equal(process.exitCode, exitCode);
        assert.equal(verify(request, await snapshot(session.page), 'initial').status, 'passed');
        if (name === 'triangle') await t.test('M1 presentation regressions are rejected', async () => {
          const reset = () => loadGgb(session.page, bytes.toString('base64'));
          for (const object of ['M', 'median']) {
            await session.page.evaluate(id => window.ggb.setVisible(id, false), object);
            assert.equal(verify(request, await snapshot(session.page), 'initial').status, 'failed'); await reset();
          }
          await session.page.evaluate(() => window.ggb.setLabelVisible('M', false));
          assert.equal(verify(request, await snapshot(session.page), 'initial').status, 'failed'); await reset();
          await session.page.evaluate(() => window.ggb.setLineThickness('median', 1));
          assert.equal(verify(request, await snapshot(session.page), 'initial').status, 'failed'); await reset();
          await session.page.evaluate(() => window.ggb.setColor('M', 0, 0, 255));
          assert.equal(verify(request, await snapshot(session.page), 'initial').status, 'failed'); await reset();
        });
        await dragPoint(session.page, request.plan.interactions[0]!);
        assert.equal(verify(request, await snapshot(session.page), 'sampled').status, 'passed');
        const z = await zoom(session.page); assert.notEqual(z.before, z.after);
      } finally { await session.close(); await session.close(); }
      await assert.rejects(fetch(session.url));
      assert.equal(sha256(await readFile(file)), hash, 'Preview must not overwrite the file');
      assert.deepEqual(['SIGINT', 'SIGTERM'].map(signal => process.listeners(signal)), handlers);
      assert.equal(process.exitCode, exitCode);

      if (name === 'triangle') {
        await t.test('missing files and invalid reports cannot bypass delivery gates', async () => {
          for (const filename of ['request.json', 'verification.json', 'preview.png']) {
            const path = join(delivery, filename), contents = await readFile(path);
            try {
              await rm(path); await assert.rejects(openPreview(delivery, false));
              await writeFile(path, ''); await assert.rejects(openPreview(delivery, false));
            } finally { await writeFile(path, contents); }
          }
          const contents = await readFile(reportPath);
          try {
            for (const mutate of [
              (r: any) => { delete r.interaction; },
              (r: any) => { r.interaction.status = 'failed'; },
              (r: any) => { r.interaction.status = 'unverified'; },
              (r: any) => { r.interaction.samples = []; },
              (r: any) => { r.construction.results = []; },
              (r: any) => { r.interaction.samples[0].after.objects = [null]; },
            ]) {
              const changed = structuredClone(report); mutate(changed);
              await writeFile(reportPath, JSON.stringify(changed)); await assert.rejects(openPreview(delivery, false));
            }
          } finally { await writeFile(reportPath, contents); }
        });
        await t.test('CLI cancellation closes the preview and releases its port', async () => {
          const child = spawn(process.execPath, [cli, 'preview', '--delivery', delivery], { stdio: ['ignore', 'pipe', 'pipe'] });
          const lines = createInterface({ input: child.stdout });
          const timer = setTimeout(() => child.kill('SIGKILL'), 20_000);
          try {
            const [line] = await Promise.race([once(lines, 'line'), once(child, 'exit').then(() => { throw new Error('Preview exited before ready'); })]);
            const ready = JSON.parse(line); assert.equal(ready.ok, true, line);
            const exited = once(child, 'exit'); child.kill('SIGTERM');
            const [code] = await exited; assert.equal(code, 130); await assert.rejects(fetch(ready.data.url));
          } finally { clearTimeout(timer); lines.close(); if (child.exitCode === null) child.kill('SIGKILL'); }
        });
      }
      await writeFile(file, 'corrupted'); await assert.rejects(openPreview(delivery, false), /checksum mismatch/);
    });

    await t.test('renaming and rotating a construction only changes input data', async () => {
      const request = await fixture('triangle');
      const names: Record<string, string> = { A: 'J', B: 'K', C: 'L', M: 'N', shape: 'surface', median: 'connector' };
      const rename = (name: string) => names[name] ?? name;
      const renameText = (text: string) => text.replace(/[ABCM]/g, rename);
      request.prompt = renameText(request.prompt); request.outputDir = join(directory, 'renamed');
      for (const step of request.plan.program) {
        step.id = rename(step.id);
        if (step.op === 'freePoint') [step.x, step.y] = [-step.y + 10, step.x - 4];
        else step.args = step.args.map(arg => typeof arg === 'number' ? arg : { ref: rename(arg.ref) });
      }
      for (const requirement of request.plan.requirements) {
        requirement.source = renameText(requirement.source);
        for (const check of requirement.checks) check.subjects = check.subjects.map(rename);
      }
      for (const style of request.plan.styles ?? []) style.object = rename(style.object);
      for (const sample of request.plan.interactions) sample.point = rename(sample.point);
      const result = await build(request);
      const report = JSON.parse(await readFile(result.report, 'utf8'));
      assert.equal(report.reload.status, 'passed'); assert.equal(report.interaction.status, 'passed');
      assert(!report.reload.objects.some((o: any) => ['A', 'B', 'C', 'M', 'shape', 'median'].includes(o.name)));
    });

    await t.test('false relationships, counterfeit dependencies, gray zones and degenerate geometry do not produce deliveries', async () => {
      for (const [name, mutate] of [
        ['fixedMidpoint', (r: Request) => { r.plan.program[4] = { id: 'M', op: 'freePoint', x: 3, y: 0 }; }],
        ['wrongRelation', (r: Request) => { r.plan.requirements[1]!.checks[0] = { kind: 'perpendicular', subjects: ['base', 'b'], scope: 'sampled' }; r.plan.program[4] = { id: 'b', op: 'command', name: 'Line', args: [{ ref: 'N' }, { ref: 'base' }] }; }],
        ['degenerate', (r: Request) => { r.plan.program[2] = { id: 'C', op: 'freePoint', x: 3, y: 0 }; }],
        ['gray', (r: Request) => {
          r.prompt += 'A的初始横坐标为0.00000002。';
          r.plan.requirements.push({ id: 'initialA', source: 'A的初始横坐标为0.00000002', checks: [{ kind: 'coordinate', subjects: ['A'], coordinates: [2e-8, 0], scope: 'initial' }] });
        }],
      ] as const) {
        const request = await fixture(name === 'wrongRelation' ? 'bisector' : 'triangle');
        request.outputDir = join(directory, name); mutate(request);
        await assert.rejects(build(request), (e: any) => name === 'gray' ? e.code === 'verification_unverified' : e.code === 'verification_failed' || e.code === 'execution_failed');
        for (const run of await readdir(request.outputDir)) {
          await assert.rejects(readFile(join(request.outputDir, run, 'delivery/manifest.json')), /ENOENT/);
          const state = JSON.parse(await readFile(join(request.outputDir, run, 'run.json'), 'utf8'));
          assert.equal(state.state, 'failed');
        }
      }
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
