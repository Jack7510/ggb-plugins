/** @fileoverview Resolves the installed bundle's public server resources. */
import {createHash} from 'node:crypto';
import {readFileSync, realpathSync, statSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertDshCompatibility, HOST_PROTOCOL_VERSION,
  RECEIPT_SCHEMA_VERSION, SUPPORTED_DSH_VERSIONS, TOOL_NAMES,
} from '../dist/src/host-protocol.js';

/** Resolve only this complete installed bundle; never another client's cache.
 * @returns {{root: string, pluginName: string, pluginVersion: string,
 * serverAdapter: string, serverPatch: string, executor: string, cli: string,
 * schemas: string, workerSkill: string, workerSkillSha256: string,
 * hostProtocolVersion: number, receiptSchemaVersion: number,
 * requestProtocolVersion: number, supportedDshVersions: readonly string[],
 * modelFacingTools: readonly string[], runtimeIdentity: object}}
 */
export function loadInstallation() {
  const root = realpathSync(dirname(dirname(fileURLToPath(import.meta.url))));
  const read = file => JSON.parse(readFileSync(join(root, file), 'utf8'));
  const pkg = read('package.json');
  const capabilities = read('capabilities.json');
  const runtime = read('runtime.lock.json');
  const workerSkill = join(root, 'skills/ggb-construction/worker.md');
  const workerSkillSha256 = createHash('sha256')
      .update(readFileSync(workerSkill)).digest('hex');
  if (pkg.name !== 'ggb-plugins-dsh' ||
      capabilities.toolVersion !== pkg.version ||
      typeof runtime.version !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(runtime.sha256) ||
      workerSkillSha256 !== capabilities.workerSkillSha256 ||
      capabilities.requestProtocolVersion !== 2 ||
      JSON.stringify(capabilities.modelFacingTools) !==
          JSON.stringify(TOOL_NAMES)) {
    throw new Error('ggb_installation_identity_invalid');
  }
  const paths = {serverAdapter: 'dsh/server.js',
    serverPatch: 'dsh/server.patch.yml', executor: 'dsh/executor.js',
    cli: 'dist/src/cli.js',
    schemas: 'dist/src/host-protocol.js'};
  for (const path of Object.values(paths)) {
    if (!statSync(join(root, path)).isFile()) {
      throw new Error('ggb_installation_resource_missing');
    }
  }
  return {root, pluginName: pkg.name, pluginVersion: pkg.version,
    ...Object.fromEntries(Object.entries(paths)
        .map(([key, path]) => [key, join(root, path)])),
    workerSkill, workerSkillSha256,
    hostProtocolVersion: HOST_PROTOCOL_VERSION,
    receiptSchemaVersion: RECEIPT_SCHEMA_VERSION,
    requestProtocolVersion: 2, supportedDshVersions: SUPPORTED_DSH_VERSIONS,
    modelFacingTools: TOOL_NAMES,
    runtimeIdentity: {geogebraVersion: runtime.version,
      geogebraSha256: runtime.sha256,
      playwrightVersion: pkg.dependencies.playwright}};
}

/** Load the immutable Worker Skill before the first model request.
 * @returns {string} Worker body, without YAML frontmatter or CLI injection.
 */
export function loadWorkerSkill() {
  const installation = loadInstallation();
  const raw = readFileSync(installation.workerSkill, 'utf8');
  const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, '').trim();
  if (body === raw.trim() || Buffer.byteLength(body) > 16384 || !body) {
    throw new Error('ggb_worker_skill_invalid');
  }
  return body;
}

export {assertDshCompatibility};

/** Check prepared runtime resources without launching a browser or installing. */
export async function assertRuntimeReady() {
  const installation = loadInstallation();
  const runtime = JSON.parse(readFileSync(
    join(installation.root, '.runtime/runtime.json'), 'utf8'));
  if (runtime.version !== installation.runtimeIdentity.geogebraVersion ||
      runtime.sha256 !== installation.runtimeIdentity.geogebraSha256) {
    throw new Error('ggb_runtime_identity_mismatch');
  }
  const runtimeFile = join(installation.root,
    '.runtime/GeoGebra/HTML5/5.0/web3d/web3d.nocache.js');
  const loader = join(installation.root, '.runtime/GeoGebra/deployggb.js');
  for (const file of [runtimeFile, loader]) {
    if (!statSync(file).isFile() || statSync(file).size === 0) {
      throw new Error('ggb_runtime_resource_missing');
    }
  }
  const {createRequire} = await import('node:module');
  const require = createRequire(join(installation.root, 'package.json'));
  const playwright = require('playwright/package.json');
  if (playwright.version !== installation.runtimeIdentity.playwrightVersion) {
    throw new Error('ggb_playwright_identity_mismatch');
  }
  const {chromium} = await import('playwright');
  const browser = chromium.executablePath();
  if (!statSync(browser).isFile()) throw new Error('ggb_chromium_missing');
  return {...installation.runtimeIdentity, browserExecutable: browser};
}
