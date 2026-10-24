/** @fileoverview Versioned contracts for the installed DSH host boundary. */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { isAbsolute } from 'node:path';
import {parseDraftArguments, REQUEST_ARGUMENT_BYTES}
  from './draft-arguments.js';

export type Json = null | boolean | number | string | Json[] |
    {[key: string]: Json};
export const HOST_PROTOCOL_VERSION = 3;
export const RECEIPT_SCHEMA_VERSION = 2;
export const SUPPORTED_DSH_VERSIONS = ['0.2.1-rc.2'] as const;
export const REFERENCE_TOPICS = ['request', 'program', 'verification',
  'interactions', 'patterns', 'naming'] as const;
export const TOOL_NAMES = ['ggb_inspect', 'ggb_request', 'ggb_check', 'ggb_build'] as const;
export type ToolName = typeof TOOL_NAMES[number];
export const LIMITS = Object.freeze({
  requestBytes: REQUEST_ARGUMENT_BYTES, frameBytes: 256 * 1024,
  referenceBytes: 24 * 1024,
  stdoutBytes: 1024 * 1024, stderrBytes: 64 * 1024,
  reportBytes: 1024 * 1024, manifestBytes: 1024 * 1024,
  ggbBytes: 6 * 1024 * 1024, previewBytes: 3 * 1024 * 1024,
});
const HEX = /^[a-f0-9]{64}$/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;

export interface ToolRequest {
  protocolVersion: 3;
  requestId: string;
  toolCallId: string;
  runId: string;
  turnId: string;
  epoch: number;
  toolName: ToolName;
  arguments: Json;
  argumentsDigest: string;
  issuedAt: string;
  nonce: string;
  authentication: string;
}
export interface ToolResponse {
  protocolVersion: 3;
  requestId: string;
  type: 'tool.result' | 'tool.error';
  result: Json;
  error: string | null;
}
export interface RuntimeIdentity {
  geogebraVersion: string;
  geogebraSha256: string;
  playwrightVersion: string;
}
export interface ExecutionContext {
  protocolVersion: 2;
  runId: string;
  turnId: string;
  epoch: number;
  requestId: string;
  toolCallId: string;
  buildId: string;
  domainRequestDigest: string;
  baseRef: string | null;
  baseSha256: string | null;
  outputRoot: string;
  deadline: string;
}
export interface Artifact {
  kind: 'result_ggb' | 'verification' | 'manifest' | 'preview';
  ref: string;
  bytes: number;
  sha256: string;
  contentType: string;
}
export interface BuildReceipt {
  receiptSchemaVersion: 2;
  runId: string;
  turnId: string;
  epoch: number;
  requestId: string;
  toolCallId: string;
  buildId: string;
  domainRequestDigest: string;
  baseSha256: string | null;
  pluginName: string;
  pluginVersion: string;
  packageIntegrity: string;
  runtimeIdentity: RuntimeIdentity;
  status: 'succeeded' | 'rejected';
  issues: {code: string; message: string; path?: string}[];
  verification: Json;
  artifacts: Artifact[];
}

/** Reject malformed or unsupported messages without coercion or downgrade. */
export class ProtocolError extends Error {
  constructor(readonly field: string) {
    super(`ggb_host_protocol_invalid:${field}`);
    this.name = 'ProtocolError';
  }
}

function requireValue(ok: boolean, field: string): void {
  if (!ok) throw new ProtocolError(field);
}
function object(value: unknown, keys: string[]): Record<string, unknown> {
  requireValue(value !== null && typeof value === 'object' &&
      !Array.isArray(value), 'object');
  // The external boundary was narrowed above; all fields are checked below.
  const record = value as Record<string, unknown>;
  requireValue(Object.keys(record).every(key => keys.includes(key)), 'keys');
  return record;
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
function matches(value: unknown, pattern: RegExp): boolean {
  return typeof value === 'string' && pattern.test(value);
}
function identity(value: Record<string, unknown>): void {
  requireValue(matches(value.runId, /^run_[a-f0-9-]{36}$/u) &&
      UUID.test(String(value.runId).slice(4)), 'runId');
  for (const key of ['turnId', 'requestId', 'toolCallId']) {
    requireValue(matches(value[key], UUID), key);
  }
  requireValue(Number.isSafeInteger(value.epoch) &&
      Number(value.epoch) > 0, 'epoch');
}
function timestamp(value: unknown): boolean {
  return typeof value === 'string' &&
      /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/u.test(value) &&
      Number.isFinite(Date.parse(value));
}

/** Canonical JSON used for request digests and authentication. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' ||
      typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(item => canonicalJson(item)).join(',') + ']';
  }
  requireValue(value !== null && typeof value === 'object' &&
      Object.getPrototypeOf(value) === Object.prototype, 'json');
  const record = value as Record<string, unknown>;
  return '{' + Object.keys(record).sort().map(key =>
    JSON.stringify(key) + ':' + canonicalJson(record[key])).join(',') + '}';
}

/** SHA-256 of the exact JSON value, without host path normalization. */
export function digestJson(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

/** Sign the complete envelope; callers must never persist the token. */
export function signRequest(token: string,
    value: Omit<ToolRequest, 'authentication'>): string {
  requireValue(HEX.test(token), 'token');
  return createHmac('sha256', Buffer.from(token, 'hex'))
      .update(canonicalJson(value)).digest('hex');
}

/** Validate fixed topics; null means inspect the attached base. */
export function parseReferenceTopics(input: unknown): string[] | null {
  const args = object(input, ['reference', 'references']);
  requireValue(args.reference === undefined || args.references === undefined,
    'reference_mode');
  if (args.reference !== undefined) {
    requireValue(REFERENCE_TOPICS.some(topic => topic === args.reference),
      'reference');
    // Equality with the fixed string enum proves the external value's type.
    return [args.reference as string];
  }
  if (args.references === undefined) return null;
  requireValue(Array.isArray(args.references) && args.references.length >= 1
    && args.references.length <= REFERENCE_TOPICS.length
    && args.references.every(value =>
      REFERENCE_TOPICS.some(topic => topic === value)), 'references');
  // Every array entry was matched against the fixed string enum above.
  return [...new Set(args.references as string[])];
}

/** Separate model arguments from host paths and execution identity. */
function toolArguments(toolName: unknown, input: unknown): void {
  if (toolName === 'ggb_inspect') parseReferenceTopics(input);
  else parseDraftArguments(String(toolName), input);
}

/** Parse a transport request, including version and argument digest. */
export function parseToolRequest(input: unknown): ToolRequest {
  const value = object(input, ['protocolVersion', 'requestId', 'toolCallId',
    'runId', 'turnId', 'epoch', 'toolName', 'arguments', 'argumentsDigest',
    'issuedAt', 'nonce', 'authentication']);
  requireValue(value.protocolVersion === 3, 'protocolVersion');
  identity(value);
  requireValue(TOOL_NAMES.some(name => name === value.toolName), 'toolName');
  toolArguments(value.toolName, value.arguments);
  requireValue(timestamp(value.issuedAt), 'issuedAt');
  requireValue(matches(value.nonce, /^[a-f0-9]{32}$/u), 'nonce');
  requireValue(matches(value.authentication, HEX), 'authentication');
  requireValue(Buffer.byteLength(canonicalJson(value.arguments)) <=
      LIMITS.requestBytes, 'arguments_size');
  requireValue(value.argumentsDigest === digestJson(value.arguments),
      'argumentsDigest');
  requireValue(Buffer.byteLength(canonicalJson(value)) <=
      LIMITS.frameBytes, 'frame_size');
  return value as unknown as ToolRequest;
}

/** Authenticate after structural parsing; the host owns policy checks. */
export function authenticateRequest(token: string, input: unknown): boolean {
  const parsed = parseToolRequest(input);
  const {authentication, ...unsigned} = parsed;
  return timingSafeEqual(Buffer.from(authentication, 'hex'),
      Buffer.from(signRequest(token, unsigned), 'hex'));
}

/** Parse the correlated gateway response; tool errors remain distinct. */
export function parseToolResponse(input: unknown): ToolResponse {
  const value = object(input,
      ['protocolVersion', 'requestId', 'type', 'result', 'error']);
  requireValue(value.protocolVersion === 3, 'protocolVersion');
  requireValue(matches(value.requestId, UUID), 'requestId');
  if (value.type === 'tool.result') {
    requireValue(value.result !== null && value.error === null, 'result');
  } else {
    requireValue(value.type === 'tool.error' && value.result === null &&
        text(value.error), 'error');
  }
  canonicalJson(value);
  return value as unknown as ToolResponse;
}

/** Parse host build identity and resource bounds, never model paths. */
export function parseExecutionContext(input: unknown): ExecutionContext {
  const value = object(input, ['protocolVersion', 'runId', 'turnId', 'epoch',
    'requestId', 'toolCallId', 'buildId', 'domainRequestDigest', 'baseRef',
    'baseSha256', 'outputRoot', 'deadline']);
  requireValue(value.protocolVersion === 2, 'protocolVersion');
  identity(value);
  requireValue(matches(value.buildId, UUID), 'buildId');
  requireValue(matches(value.domainRequestDigest, HEX), 'domainRequestDigest');
  requireValue(text(value.outputRoot) && isAbsolute(value.outputRoot),
      'outputRoot');
  requireValue(timestamp(value.deadline), 'deadline');
  requireValue(value.baseRef === null && value.baseSha256 === null ||
      text(value.baseRef) && isAbsolute(value.baseRef) &&
      matches(value.baseSha256, HEX), 'base');
  return value as unknown as ExecutionContext;
}

function runtimeIdentity(input: unknown): void {
  const value = object(input,
      ['geogebraVersion', 'geogebraSha256', 'playwrightVersion']);
  requireValue(text(value.geogebraVersion) &&
      matches(value.geogebraSha256, HEX) && text(value.playwrightVersion),
  'runtimeIdentity');
}
function artifact(input: unknown): Artifact {
  const value = object(input,
    ['kind', 'ref', 'bytes', 'sha256', 'contentType']);
  requireValue(['result_ggb', 'verification', 'manifest', 'preview']
      .includes(String(value.kind)), 'kind');
  requireValue(text(value.ref) && !value.ref.includes('\\') &&
      !value.ref.includes(':') && !/[\u0000-\u001f]/u.test(value.ref) &&
      value.ref.split('/').every(part =>
        part !== '' && part !== '.' && part !== '..'), 'ref');
  requireValue(Number.isSafeInteger(value.bytes) &&
      Number(value.bytes) > 0, 'bytes');
  const limit = value.kind === 'result_ggb' ? LIMITS.ggbBytes :
    value.kind === 'preview' ? LIMITS.previewBytes : LIMITS.reportBytes;
  requireValue(Number(value.bytes) <= limit, 'artifact_size');
  requireValue(matches(value.sha256, HEX) && text(value.contentType),
    'artifact');
  return value as unknown as Artifact;
}

/** Validate receipts; the plugin owns geometric report semantics. */
export function parseBuildReceipt(input: unknown): BuildReceipt {
  const value = object(input, ['receiptSchemaVersion', 'runId', 'turnId',
    'epoch', 'requestId', 'toolCallId', 'buildId', 'domainRequestDigest',
    'baseSha256', 'pluginName', 'pluginVersion', 'packageIntegrity',
    'runtimeIdentity', 'status', 'issues', 'verification', 'artifacts']);
  requireValue(value.receiptSchemaVersion === 2, 'receiptSchemaVersion');
  identity(value);
  requireValue(matches(value.buildId, UUID), 'buildId');
  requireValue(matches(value.domainRequestDigest, HEX) &&
      (value.baseSha256 === null || matches(value.baseSha256, HEX)), 'digests');
  requireValue(text(value.pluginName) && text(value.pluginVersion) &&
      matches(value.packageIntegrity, HEX), 'pluginIdentity');
  runtimeIdentity(value.runtimeIdentity);
  requireValue(Array.isArray(value.issues) && value.issues.length <= 256,
      'issues');
  for (const input of value.issues as unknown[]) {
    const issue = object(input, ['code', 'message', 'path']);
    requireValue(text(issue.code) && text(issue.message) &&
        (issue.path === undefined || typeof issue.path === 'string'), 'issue');
  }
  requireValue(Array.isArray(value.artifacts) &&
      value.artifacts.length <= 4, 'artifacts');
  const artifacts = (value.artifacts as unknown[]).map(artifact);
  const kinds = new Set(artifacts.map(item => item.kind));
  requireValue(kinds.size === artifacts.length, 'duplicate_kind');
  validateReceiptStatus(value, artifacts);
  requireValue(Buffer.byteLength(canonicalJson(value)) <=
      LIMITS.stdoutBytes, 'receipt_size');
  return value as unknown as BuildReceipt;
}

/** Match the report reference to its artifact without copying content. */
function validateReceiptStatus(value: Record<string, unknown>,
  artifacts: Artifact[]): void {
  if (value.status !== 'succeeded') {
    requireValue(value.status === 'rejected' && artifacts.length === 0 &&
      (value.issues as unknown[]).length > 0 && value.verification === null,
    'rejection');
    return;
  }
  const report = object(value.verification,
    ['reportSha256', 'reportBytes', 'summary']);
  const fact = artifacts.find(item => item.kind === 'verification');
  requireValue(fact !== undefined && report.reportSha256 === fact.sha256 &&
    report.reportBytes === fact.bytes && report.summary !== undefined &&
    Buffer.byteLength(canonicalJson(report.summary)) <= 2048,
  'report_reference');
  const kinds = new Set(artifacts.map(item => item.kind));
  requireValue((value.issues as unknown[]).length === 0 &&
    ['result_ggb', 'verification', 'manifest'].every(kind =>
      [...kinds].some(value => value === kind)), 'success');
}

/** Exact supported combination until additional SDK releases are validated. */
export function assertDshCompatibility(version: string): void {
  requireValue(SUPPORTED_DSH_VERSIONS.some(item => item === version),
      'dsh_version_unsupported');
}
