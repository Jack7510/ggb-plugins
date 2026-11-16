/** @fileoverview Bounded delivery facts and DSH card/preview entry points. */
import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MAX_FAILURES = 12;
const MAX_MESSAGE = 240;

/** Read a regular file, returning undefined when it is absent. */
async function fileOrUndefined(path) {
  try {
    const info = await stat(path);
    return info.isFile() ? path : undefined;
  } catch { return undefined; }
}

/** Stable text for an unknown failure. */
function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

/** Read JSON with a path-specific error. */
async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) {
    throw new Error(`Cannot read ${path}: ${errorText(error)}`);
  }
}

/** Compact one verification phase. */
function phase(value) {
  const results = Array.isArray(value?.results) ? value.results : [];
  return {
    status: typeof value?.status === 'string' ? value.status : 'unverified',
    total: results.length,
    passed: results.filter(item => item?.status === 'passed').length,
    failed: results.filter(item => item?.status === 'failed').length,
    unverified: results.filter(item => item?.status === 'unverified').length,
  };
}

/** Clip a reason and mark the truncation. */
function clip(value) {
  return value.length > MAX_MESSAGE ? value.slice(0, MAX_MESSAGE) + '…' : value;
}

/** One bounded reason from stored evidence. */
function reason(evidence) {
  if (typeof evidence === 'string') return clip(evidence);
  if (evidence && typeof evidence === 'object') {
    for (const key of ['message', 'reason', 'expected', 'actual']) {
      const value = evidence[key];
      if (typeof value === 'string') return clip(value);
    }
    try { return clip(JSON.stringify(evidence)); }
    catch { return ''; }
  }
  return '';
}

/** Failure rows from one phase; bounded in the caller. */
function phaseFailures(label, value) {
  const results = Array.isArray(value?.results) ? value.results : [];
  return results.filter(item => item?.status !== 'passed').map(item => ({
    phase: label,
    requirementId: item?.requirementId ?? '',
    checkId: item?.checkId ?? '',
    method: item?.method ?? '',
    status: item?.status ?? 'unverified',
    reason: reason(item?.evidence),
  }));
}

/** Aggregate interaction samples, including their after-state checks. */
function interactionPhase(interaction) {
  const samples = Array.isArray(interaction?.samples)
    ? interaction.samples : [];
  const rows = samples.flatMap(sample =>
    Array.isArray(sample?.after?.results) ? sample.after.results : []);
  const counts = phase({ status: interaction?.status, results: rows });
  return {
    ...counts,
    status: samples.length === 0 && counts.status === 'passed'
      ? 'not_sampled' : counts.status,
    samples: samples.length,
  };
}

/** Collect the first bounded failures across construction, reload and samples. */
function failuresOf(report) {
  const rows = [
    ...phaseFailures('construction', report?.construction),
    ...phaseFailures('reload', report?.reload),
  ];
  const samples = Array.isArray(report?.interaction?.samples)
    ? report.interaction.samples : [];
  for (const [index, sample] of samples.entries()) {
    rows.push(...phaseFailures(`sample.${index + 1}`, sample?.after));
  }
  return rows;
}

/** Reject a delivery outside the caller's session workspace. */
function assertInside(root, cwd) {
  if (cwd === undefined) return;
  const rel = relative(resolve(cwd), root);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('delivery must be inside the session workspace');
  }
}

/** Re-derive the display status without inventing evidence. */
function isVerified(phases) {
  return phases.construction.status === 'passed'
    && phases.reload.status === 'passed'
    && (phases.interaction.status === 'passed'
      || phases.interaction.status === 'not_sampled');
}

/** Read a committed delivery directory, or a failed build's run directory. */
export async function readDeliveryCard(delivery, cwd) {
  const root = resolve(delivery);
  assertInside(root, cwd);
  const reportPath = await fileOrUndefined(join(root, 'verification.json'));
  if (reportPath === undefined) {
    throw new Error(`No verification.json in ${root}`);
  }
  const report = await readJson(reportPath);
  const manifestPath = await fileOrUndefined(join(root, 'manifest.json'));
  const manifest = manifestPath === undefined
    ? {} : await readJson(manifestPath);
  const requestPath = await fileOrUndefined(join(root, 'request.json'));
  const request = requestPath === undefined ? {} : await readJson(requestPath);
  const rawFile = manifest.file;
  const file = typeof rawFile === 'string' && rawFile !== ''
    && !rawFile.includes('/') && !rawFile.includes('\\')
    && rawFile !== '.' && rawFile !== '..' ? rawFile : undefined;
  const previewPath = await fileOrUndefined(join(root, 'preview.png'));
  const phases = {
    construction: phase(report.construction),
    reload: phase(report.reload),
    interaction: interactionPhase(report.interaction),
  };
  const failures = failuresOf(report);
  return {
    delivery: root,
    title: file?.replace(/\.ggb$/iu, '')
      ?? (typeof request?.plan?.title === 'string'
        ? request.plan.title : 'GeoGebra'),
    file: file ?? null,
    ggb: file === undefined ? null : join(root, file),
    previewPath: previewPath ?? null,
    report: reportPath,
    manifest: manifestPath ?? null,
    verified: isVerified(phases),
    phases,
    failures: failures.slice(0, MAX_FAILURES),
    failureTotal: failures.length,
  };
}

/** Check a path names a delivery this command may open. */
async function assertDelivery(delivery) {
  for (const name of ['verification.json', 'manifest.json']) {
    const path = join(delivery, name);
    const info = await stat(path).catch(() => undefined);
    if (info === undefined || !info.isFile()) {
      throw new Error(`Not a committed delivery directory: ${delivery}`);
    }
  }
}

/** Register the in-chat delivery tool on the desktop bundle. */
export function registerDeliveryTool(ctx, pluginRoot) {
  if (typeof ctx?.get !== 'function') return;
  const tools = ctx.get('tools');
  if (tools === undefined) return;
  const attachments = ctx.get('attachments');
  const workingDirectory = ctx.get('workingDirectory');
  const register = () => tools.register({
    name: 'ggb_delivery',
    description: 'Summarize a committed GeoGebra delivery for the in-chat card. '
      + 'Call once after a successful build, or to inspect an existing delivery; '
      + 'this only reads verification.json, manifest.json, request.json and preview.png.',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        delivery: { type: 'string',
          description: 'Absolute delivery directory written by build.' },
      },
      required: ['delivery'],
    },
    output: {
      schema: {},
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args, execution) {
      const cwd = workingDirectory === undefined
        || execution.agent === undefined
        ? undefined : workingDirectory.get(execution.agent.session);
      const card = await readDeliveryCard(args.delivery, cwd);
      if (attachments === undefined || card.previewPath === null) return card;
      try {
        const data = await readFile(card.previewPath);
        card.preview = await attachments.saveImage({
          data, mediaType: 'image/png', name: 'preview.png',
        });
      } catch (error) {
        card.previewError = errorText(error);
      }
      return card;
    },
  });
  if (typeof ctx.effect === 'function') {
    ctx.effect(register, 'ggb-delivery-tool');
  } else register();
}

/** Register `/ggb-preview <delivery>` for the desktop bundle. */
export function registerPreviewCommand(ctx, pluginRoot) {
  if (typeof ctx?.get !== 'function') return;
  const commands = ctx.get('commands');
  if (commands === undefined) return;
  const workingDirectory = ctx.get('workingDirectory');
  const cli = join(pluginRoot, 'dist/src/cli.js');
  const node = process.env.DSH_GGB_NODE?.trim() || 'node';
  const handler = async invocation => {
    const raw = invocation.rawInput.trim().replace(/^["']|["']$/gu, '');
    if (raw === '') {
      return { kind: 'error',
        text: 'Usage: /ggb-preview <delivery-directory>' };
    }
    const delivery = resolve(raw);
    try {
      const cwd = workingDirectory === undefined || invocation.agent === undefined
        ? undefined : workingDirectory.get(invocation.agent.session);
      assertInside(delivery, cwd);
      await assertDelivery(delivery);
    }
    catch (error) {
      return { kind: 'error', text: errorText(error) };
    }
    try {
      await execFileAsync(node,
        [cli, 'preview', '--delivery', delivery],
        { timeout: 30000, maxBuffer: 1024 * 1024 });
      return { kind: 'success',
        text: `Opened the interactive preview for ${delivery}` };
    } catch (error) {
      const detail = error?.stderr?.trim()
        || error?.stdout?.trim() || String(error);
      const hint = error?.code === 'ENOENT'
        ? 'Node.js 22+ was not found; put node on PATH or set DSH_GGB_NODE. '
        : '';
      return { kind: 'error', text: (hint + detail).slice(0, 1024) };
    }
  };
  const register = () => commands.register({
    name: 'ggb-preview',
    description: 'Open a GeoGebra delivery in the interactive preview',
    input: { hint: '<delivery-directory>' },
    handler,
  });
  if (typeof ctx.effect === 'function') {
    ctx.effect(register, 'ggb-preview-command');
  } else register();
}
