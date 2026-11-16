/**
 * @fileoverview The printable report renders stored evidence without inventing it.
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { renderReport } from '../src/report.js';

const report = (status: string, results: unknown[]) => ({ status, results });
const passed = { status: 'passed', results: [{ status: 'passed', requirementId: 'r1', checkId: 'c1' }] };

test('renders phase counts and an empty failure state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ggb-report-'));
  try {
    await writeFile(join(directory, 'verification.json'), JSON.stringify({
      construction: passed,
      reload: passed,
      interaction: { status: 'not_sampled', samples: [] },
    }));
    await writeFile(join(directory, 'manifest.json'), JSON.stringify({
      file: 'demo.ggb', runtimeVersion: '5.4.932.1',
    }));
    await writeFile(join(directory, 'request.json'), JSON.stringify({ plan: { title: 'Demo' } }));
    const html = await renderReport(directory);
    assert.match(html, /Demo/);
    assert.match(html, /1\/1/);
    assert.match(html, /没有失败或未验证的条件/);
    assert.match(html, /5\.4\.932\.1/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('lists and escapes failed conditions without claiming a proof', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ggb-report-fail-'));
  try {
    await writeFile(join(directory, 'verification.json'), JSON.stringify({
      construction: report('failed', [{ status: 'failed', requirementId: 'r1', checkId: '<c1>',
        method: 'expression', evidence: { message: 'expected < 1 & actual 2' } }]),
      reload: passed,
      interaction: { status: 'not_sampled', samples: [] },
    }));
    await writeFile(join(directory, 'manifest.json'), JSON.stringify({
      file: 'demo.ggb', runtimeVersion: '5.4.932.1',
    }));
    await writeFile(join(directory, 'request.json'), JSON.stringify({
      plan: { title: 'Demo <script>alert(1)</script>' },
    }));
    const html = await renderReport(directory);
    assert.match(html, /0\/1/);
    assert.match(html, /expected &lt; 1 &amp; actual 2/);
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.match(html, /有限交互样本不是数学证明/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
