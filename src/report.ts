/** @fileoverview Render a standalone printable HTML verification report. */
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const MAX_REASON = 400;

/** Escape untrusted report text before placing it in HTML. */
function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/gu, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}

/** Narrow an untrusted JSON value to an object. */
function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object'
    ? value as Record<string, unknown> : {};
}

/** Read JSON with a path-specific error. */
async function readJson(path: string): Promise<Record<string, unknown>> {
  try {
    const value: unknown = JSON.parse(await readFile(path, 'utf8'));
    if (Array.isArray(value)) throw new Error('not an object');
    return asRecord(value);
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot read ${path}: ${cause}`);
  }
}

interface PhaseCount {
  status: string;
  total: number;
  passed: number;
  failed: number;
  unverified: number;
}

/** Count one phase without trusting its status alone. */
function countPhase(value: unknown): PhaseCount {
  const phase = asRecord(value);
  const results = Array.isArray(phase.results) ? phase.results : [];
  const status = (item: unknown): string => {
    if (item === null || typeof item !== 'object') return 'unverified';
    const value = (item as Record<string, unknown>).status;
    return typeof value === 'string' ? value : 'unverified';
  };
  return {
    status: typeof phase.status === 'string' ? phase.status : 'unverified',
    total: results.length,
    passed: results.filter(item => status(item) === 'passed').length,
    failed: results.filter(item => status(item) === 'failed').length,
    unverified: results.filter(item => status(item) === 'unverified').length,
  };
}

/** One bounded reason from a check's stored evidence. */
function reasonOf(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return typeof value === 'string' ? value.slice(0, MAX_REASON) : '';
  }
  const evidence = asRecord(value);
  for (const key of ['message', 'reason', 'expected', 'actual']) {
    const actual = evidence[key];
    if (typeof actual === 'string') return actual.slice(0, MAX_REASON);
  }
  try { return JSON.stringify(evidence).slice(0, MAX_REASON); }
  catch { return ''; }
}

interface FailureRow {
  phase: string;
  requirementId: string;
  checkId: string;
  method: string;
  status: string;
  reason: string;
}

/** Failure rows from one phase. */
function phaseFailures(label: string, value: unknown): FailureRow[] {
  const phase = asRecord(value);
  const results = Array.isArray(phase.results) ? phase.results : [];
  return results.flatMap(item => {
    if (item === null || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    if (row.status === 'passed') return [];
    return [{
      phase: label,
      requirementId: typeof row.requirementId === 'string'
        ? row.requirementId : '',
      checkId: typeof row.checkId === 'string' ? row.checkId : '',
      method: typeof row.method === 'string' ? row.method : '',
      status: typeof row.status === 'string' ? row.status : 'unverified',
      reason: reasonOf(row.evidence),
    }];
  });
}

/** All failures, including interaction samples. */
function allFailures(report: Record<string, unknown>): FailureRow[] {
  const rows = [
    ...phaseFailures('construction', report.construction),
    ...phaseFailures('reload', report.reload),
  ];
  const interaction = asRecord(report.interaction);
  const samples = Array.isArray(interaction.samples) ? interaction.samples : [];
  for (const [index, sample] of samples.entries()) {
    if (sample === null || typeof sample !== 'object') continue;
    rows.push(...phaseFailures(`sample.${index + 1}`,
      (sample as Record<string, unknown>).after));
  }
  return rows;
}

/** Read a preview image as a bounded data URL. */
async function previewData(delivery: string): Promise<string | undefined> {
  try {
    const path = join(delivery, 'preview.png');
    const info = await stat(path);
    if (!info.isFile() || info.size > 3 * 1024 * 1024) return undefined;
    return `data:image/png;base64,${(await readFile(path)).toString('base64')}`;
  } catch { return undefined; }
}

/** Table for the three verification phases. */
function phaseTable(rows: [string, PhaseCount][]): string {
  return '<table><thead><tr><th>阶段</th><th>状态</th>'
    + '<th>通过/总数</th><th>失败</th>'
    + '<th>未验证</th></tr></thead><tbody>'
    + rows.map(([label, value]) =>
      `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value.status)}</td>`
      + `<td>${value.passed}/${value.total}</td><td>${value.failed}</td>`
      + `<td>${value.unverified}</td></tr>`).join('')
    + '</tbody></table>';
}

/** Failure table, or a positive empty state. */
function failureTable(failures: FailureRow[]): string {
  if (failures.length === 0) {
    return '<p class="ok">没有失败或未验证的条件。</p>';
  }
  return `<table><thead><tr><th>阶段</th><th>requirement</th><th>check</th>`
    + '<th>方法</th><th>状态</th><th>原因</th></tr></thead><tbody>'
    + failures.map(item => `<tr><td>${escapeHtml(item.phase)}</td>`
      + `<td>${escapeHtml(item.requirementId)}</td>`
      + `<td>${escapeHtml(item.checkId)}</td>`
      + `<td>${escapeHtml(item.method)}</td>`
      + `<td class="bad">${escapeHtml(item.status)}</td>`
      + `<td>${escapeHtml(item.reason)}</td></tr>`).join('')
    + '</tbody></table>';
}

/** Standalone document around the computed sections. */
function reportPage(input: {
  title: string; file: string; runtime: string; phases: [string, PhaseCount][];
  failures: FailureRow[]; preview?: string; delivery: string;
}): string {
  const { title, file, runtime, phases, failures, preview, delivery } = input;
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>${escapeHtml(title)} · 核验报告</title>
<style>
:root{color-scheme:light dark}body{font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;max-width:900px;margin:32px auto;padding:0 20px;color:#1f2937;background:#fff}
h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin-top:24px;border-bottom:1px solid #d1d5db;padding-bottom:4px}
table{border-collapse:collapse;width:100%;margin-top:8px}th,td{border:1px solid #d1d5db;padding:6px 8px;text-align:left}
th{background:#f3f4f6}.muted{color:#6b7280;font-size:13px}.ok{color:#047857}.bad{color:#b91c1c}
img{max-width:100%;max-height:360px;border:1px solid #d1d5db;border-radius:8px;margin-top:8px}
@media print{body{margin:0;max-width:none}.muted{color:#444}button{display:none}}
</style></head><body>
<h1>${escapeHtml(title)}</h1>
<p class="muted">GeoGebra 核验报告 · ${escapeHtml(file)} · runtime ${escapeHtml(runtime)}</p>
<h2>逐阶段结果</h2>
${phaseTable(phases)}
<p class="muted">状态来自交付目录的 verification.json；报告只展示实际执行的检查。有限交互样本不是数学证明。</p>
${preview === undefined ? '' : `<h2>交付截图</h2><img alt="交付截图" src="${preview}">`}
<h2>${failures.length === 0 ? '失败条件' : `失败条件（${failures.length}）`}</h2>
${failureTable(failures)}
<p class="muted">交付目录：${escapeHtml(delivery)}</p>
</body></html>`;
}

/** Render the report body; callers own writing and packaging. */
export async function renderReport(delivery: string): Promise<string> {
  const report = await readJson(join(delivery, 'verification.json'));
  const manifest = await readJson(join(delivery, 'manifest.json'));
  const request = await readJson(join(delivery, 'request.json'));
  const file = typeof manifest.file === 'string'
    ? manifest.file : 'delivery.ggb';
  const plan = request.plan !== null && typeof request.plan === 'object'
    ? request.plan as Record<string, unknown> : {};
  const title = typeof plan.title === 'string'
    ? plan.title : file.replace(/\.ggb$/iu, '');
  const interaction = asRecord(report.interaction);
  const samples = Array.isArray(interaction.samples) ? interaction.samples : [];
  const sampleResults = samples.flatMap(sample => {
    const after = asRecord(asRecord(sample).after);
    return Array.isArray(after.results) ? after.results : [];
  });
  const interactionStatus = samples.length === 0
    && interaction.status === 'passed' ? 'not_sampled' : interaction.status;
  const phases: [string, PhaseCount][] = [
    ['构造', countPhase(report.construction)],
    ['重载', countPhase(report.reload)],
    ['交互', countPhase({
      status: interactionStatus, results: sampleResults,
    })],
  ];
  return reportPage({
    title, file,
    runtime: typeof manifest.runtimeVersion === 'string'
      ? manifest.runtimeVersion : 'unknown',
    phases, failures: allFailures(report),
    preview: await previewData(delivery), delivery,
  });
}

/** Render a report and write it as UTF-8 HTML. */
export async function writeReport(
  delivery: string,
  output: string,
): Promise<{ output: string; bytes: number }> {
  const html = await renderReport(delivery);
  await writeFile(output, html, 'utf8');
  return { output, bytes: Buffer.byteLength(html) };
}
