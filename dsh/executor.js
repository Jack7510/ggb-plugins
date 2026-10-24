/** @fileoverview Installed host executor; owns receipts and artifact names. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, lstat} from 'node:fs/promises';
import {relative, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {parseExecutionContext, parseBuildReceipt, digestJson, LIMITS}
  from '../dist/src/host-protocol.js';
import {validateHostDelivery, summarizeHostVerification}
  from '../dist/src/delivery-contract.js';
import {ToolError, toolError, parseRequest} from '../dist/src/schema.js';
import {checkRequest} from '../dist/src/check.js';
import {parseExecutionResult} from '../dist/src/execution-contract.js';
import {loadInstallation} from './installation.js';

/**
 * @typedef {import('../dist/src/execution-contract.js').ExecutionResult} Result
 */
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async path => JSON.parse(await readFile(path, 'utf8'));

/** Bound producer reads before hashing; a present preview must be valid. */
async function readMaterial(path, kind) {
  const limit = kind === 'result_ggb' ? LIMITS.ggbBytes :
    kind === 'preview' ? LIMITS.previewBytes :
    kind === 'manifest' ? LIMITS.manifestBytes :
    kind === 'request' ? LIMITS.requestBytes : LIMITS.reportBytes;
  const info = await lstat(path);
  assert(info.isFile() && info.size > 0 && info.size <= limit,
    `Artifact size exceeds delivery contract: ${kind} `
    + `${info.size} > ${limit}`);
  const bytes = await readFile(path);
  assert.equal(bytes.length, info.size, 'Artifact size changed');
  return bytes;
}

/** Compute facts from this build's committed files, including renamed GGBs. */
async function material(context, result, request) {
  const report = JSON.parse((await readMaterial(result.report,
    'verification')).toString('utf8'));
  const manifestPath = join(result.delivery, 'manifest.json');
  const manifest = JSON.parse((await readMaterial(manifestPath,
    'manifest')).toString('utf8'));
  validateHostDelivery(request, report, manifest);
  const ggb = await readMaterial(result.file, 'result_ggb');
  assert.equal(hash(ggb), manifest.sha256);
  assert.equal(hash(await readMaterial(
    join(result.delivery, 'request.json'), 'request')), manifest.requestSha256);
  const entries = [
    ['result_ggb', result.file, 'application/octet-stream'],
    ['verification', result.report, 'application/json'],
    ['manifest', manifestPath, 'application/json'],
  ];
  const preview = join(result.delivery, 'preview.png');
  try {
    const info = await lstat(preview);
    assert(info.isFile(), 'Preview must be a regular file');
    entries.push(['preview', preview, 'image/png']);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const artifacts = [];
  for (const [kind, path, contentType] of entries) {
    const bytes = await readMaterial(path, kind);
    artifacts.push({kind, ref: relative(context.outputRoot, path)
      .split('\\').join('/'), bytes: bytes.length,
    sha256: hash(bytes), contentType});
  }
  const reference = artifacts.find(item => item.kind === 'verification');
  return {verification: {reportSha256: reference.sha256,
    reportBytes: reference.bytes, summary: summarizeHostVerification(report)},
  artifacts};
}

/** Construct a build receipt with host-owned identities. */
function receipt(context, installation, integrity, status, issues, facts = {}) {
  const identity = {...context, pluginName: installation.pluginName,
    pluginVersion: installation.pluginVersion, packageIntegrity: integrity,
    runtimeIdentity: installation.runtimeIdentity, receiptSchemaVersion: 2};
  for (const key of ['protocolVersion', 'baseRef', 'outputRoot', 'deadline']) {
    delete identity[key];
  }
  return parseBuildReceipt({...identity, status, issues,
    verification: null, artifacts: [], ...facts});
}

/** Use the managed browser for server execution. */
async function managedBrowser() {
  const {chromium} = await import('playwright');
  process.env.DSH_GGB_BROWSER = chromium.executablePath();
}

/** Run check/inspect/build through one public versioned contract.
 * Preflight completes before browser configuration or build dispatch.
 * @returns {Promise<Result>}
 */
export async function executeHostOperation(operation, input, contextInput,
  packageIntegrity, signal, operations = {}) {
  const context = parseExecutionContext(contextInput);
  assert(['check', 'inspect', 'build'].includes(operation));
  assert.match(packageIntegrity, /^[a-f0-9]{64}$/u);
  assert.equal(digestJson(input), context.domainRequestDigest);
  assert(Date.parse(context.deadline) > Date.now(),
    'Execution deadline expired');
  const installation = loadInstallation();
  const running = AbortSignal.any([AbortSignal.timeout(
    Math.max(1, Date.parse(context.deadline) - Date.now())),
  ...(signal ? [signal] : [])]);
  const request = {...input, outputDir: context.outputRoot};
  delete request.base;
  if (context.baseRef !== null) {
    assert.equal(hash(await readFile(context.baseRef)), context.baseSha256);
    request.base = {path: context.baseRef, sha256: context.baseSha256};
  }
  const response = {protocolVersion: 3, operation,
    contextSha256: digestJson(context), packageIntegrity,
    phase: operation === 'inspect' ? 'execution' : 'preflight',
    ok: false, data: null, receipt: null, error: null};
  try {
    running.throwIfAborted();
    await dispatch(response, request, context, running, operations);
    if (context.baseRef !== null) {
      assert.equal(hash(await readFile(context.baseRef)), context.baseSha256,
        'Input baseline changed during execution');
    }
  } catch (error) {
    running.throwIfAborted();
    if (!(error instanceof ToolError)) throw error;
    const failure = toolError(error, 'invalid_input', running);
    response.error = {code: failure.code,
      message: failure.message.slice(0, 2048),
      ...(failure.details === undefined ? {} :
        {details: JSON.parse(JSON.stringify(failure.details))})};
  }
  if (operation === 'build') {
    const issues = response.ok ? [] : [{code: response.error.code,
      message: response.error.message}];
    response.receipt = receipt(context, installation, packageIntegrity,
      response.ok ? 'succeeded' : 'rejected', issues, response.facts);
  }
  delete response.facts;
  return parseExecutionResult(response);
}

/** Only this preflight branch can produce a refundable build rejection. */
async function dispatch(response, request, context, signal, operations) {
  if (response.operation !== 'inspect') {
    const parsed = parseRequest(request);
    const result = operations.check
      ? await operations.check(parsed)
      : await checkRequest(parsed);
    if (response.operation === 'check') {
      response.data = result;
      response.ok = true;
      return;
    }
  }
  response.phase = 'execution';
  signal.throwIfAborted();
  if (response.operation === 'inspect') {
    if (!context.baseRef) throw new ToolError('base_missing', 'No host base');
    if (!operations.inspect) await managedBrowser();
    const inspect = operations.inspect ??
      (await import('../dist/src/inspect.js')).inspectGgb;
    const {path: _path, ...data} = await inspect(context.baseRef, signal);
    response.data = data;
  } else {
    if (!operations.build) await managedBrowser();
    const build = operations.build ??
      (await import('../dist/src/delivery.js')).build;
    const result = await build(request, signal);
    response.facts = await material(context, result, request);
  }
  signal.throwIfAborted();
  response.ok = true;
}

/** Domain rejection exits zero; a process fault never carries phase proof. */
async function main() {
  const {values} = parseArgs({options: {operation: {type: 'string'},
    request: {type: 'string'}, context: {type: 'string'},
    'package-integrity': {type: 'string'}}});
  assert(values.operation && values.request && values.context &&
    values['package-integrity']);
  const stop = new AbortController();
  const abort = () => stop.abort(new Error('cancelled'));
  process.once('SIGTERM', abort);
  process.once('SIGINT', abort);
  try {
    const result = await executeHostOperation(values.operation,
      await json(resolve(values.request)), await json(resolve(values.context)),
      values['package-integrity'], stop.signal);
    process.stdout.write(JSON.stringify(result) + '\n');
  } finally {
    process.removeListener('SIGTERM', abort);
    process.removeListener('SIGINT', abort);
  }
}
if (process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(String(error?.stack ?? error) + '\n');
    process.exitCode = 1;
  });
}
