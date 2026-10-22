/** @fileoverview Installed host executor; owns receipts and artifact names. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {relative, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {parseExecutionContext, parseBuildReceipt, digestJson}
  from '../dist/src/host-protocol.js';
import {validateHostDelivery} from '../dist/src/delivery-contract.js';
import {ToolError} from '../dist/src/schema.js';
import {loadInstallation} from './installation.js';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async path => JSON.parse(await readFile(path, 'utf8'));

/** Compute facts from this build's committed files, including renamed GGBs. */
async function material(context, result, request) {
  const report = await json(result.report);
  const manifestPath = join(result.delivery, 'manifest.json');
  const manifest = await json(manifestPath);
  validateHostDelivery(request, report, manifest);
  const ggb = await readFile(result.file);
  assert.equal(hash(ggb), manifest.sha256);
  assert.equal(hash(await readFile(join(result.delivery, 'request.json'))),
    manifest.requestSha256);
  const entries = [
    ['result_ggb', result.file, 'application/octet-stream'],
    ['verification', result.report, 'application/json'],
    ['manifest', manifestPath, 'application/json'],
    ['preview', join(result.delivery, 'preview.png'), 'image/png'],
  ];
  const artifacts = [];
  for (const [kind, path, contentType] of entries) {
    const bytes = await readFile(path);
    artifacts.push({kind, ref: relative(context.outputRoot, path)
      .split('\\').join('/'), bytes: bytes.length,
    sha256: hash(bytes), contentType});
  }
  return {verification: report, artifacts};
}

/** Execute once; no retries, path negotiation or provider access. */
export async function executeHostBuild(input, contextInput, packageIntegrity,
  signal, buildOperation) {
  const context = parseExecutionContext(contextInput);
  assert.match(packageIntegrity, /^[a-f0-9]{64}$/u);
  assert.equal(digestJson(input), context.domainRequestDigest);
  assert(Date.parse(context.deadline) > Date.now(), 'Execution deadline expired');
  const install = loadInstallation();
  const request = {...input, outputDir: context.outputRoot};
  delete request.base;
  if (context.baseRef !== null) {
    assert.equal(hash(await readFile(context.baseRef)), context.baseSha256);
    request.base = {path: context.baseRef, sha256: context.baseSha256};
  }
  const running = AbortSignal.any([AbortSignal.timeout(
    Math.max(1, Date.parse(context.deadline) - Date.now())),
  ...(signal ? [signal] : [])]);
  const identity = {...context, pluginName: install.pluginName,
    pluginVersion: install.pluginVersion, packageIntegrity,
    runtimeIdentity: install.runtimeIdentity, receiptSchemaVersion: 1};
  // Host-only paths and deadline do not belong in the receipt.
  for (const key of ['protocolVersion', 'baseRef', 'outputRoot', 'deadline']) {
    delete identity[key];
  }
  if (!buildOperation) {
    const {chromium} = await import('playwright');
    // Server runs use the release's managed browser, never a desktop channel.
    process.env.DSH_GGB_BROWSER = chromium.executablePath();
  }
  const build = buildOperation ?? (await import('../dist/src/delivery.js')).build;
  let result;
  try {
    result = await build(request, running);
  } catch (error) {
    running.throwIfAborted();
    if (!(error instanceof ToolError) || ![
      'invalid_input', 'verification_failed', 'verification_unverified',
      'limit_exceeded', 'unsupported_command',
    ].includes(error.code)) throw error;
    return parseBuildReceipt({...identity, status: 'rejected',
      issues: [{code: error.code, message: error.message.slice(0, 2048)}],
      verification: null, artifacts: []});
  }
  running.throwIfAborted();
  const facts = await material(context, result, request);
  return parseBuildReceipt({...identity, status: 'succeeded', issues: [], ...facts});
}

/** Domain rejection is a valid receipt; unexpected execution errors exit nonzero. */
async function main() {
  const {values} = parseArgs({options: {request: {type: 'string'},
    context: {type: 'string'}, 'package-integrity': {type: 'string'}}});
  assert(values.request && values.context && values['package-integrity']);
  const stop = new AbortController();
  const abort = () => stop.abort(new Error('cancelled'));
  process.once('SIGTERM', abort);
  process.once('SIGINT', abort);
  try {
    const receipt = await executeHostBuild(await json(resolve(values.request)),
      await json(resolve(values.context)), values['package-integrity'], stop.signal);
    process.stdout.write(JSON.stringify({protocolVersion: 2, ok: true, receipt}) + '\n');
  } finally {
    process.removeListener('SIGTERM', abort);
    process.removeListener('SIGINT', abort);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(String(error?.stack ?? error) + '\n');
    process.exitCode = 1;
  });
}
