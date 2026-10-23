/** @fileoverview Regression tests for untrusted installed-plugin messages. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {authenticateRequest, assertDshCompatibility, digestJson,
  parseBuildReceipt, parseExecutionContext, parseToolRequest,
  parseToolResponse, signRequest, type BuildReceipt,
  type ToolRequest} from '../src/host-protocol.js';

const digest = 'a'.repeat(64);
const token = 'b'.repeat(64);
const identity = {runId: 'run_' + randomUUID(), turnId: randomUUID(),
  requestId: randomUUID(), toolCallId: randomUUID(), epoch: 1};

function request(): ToolRequest {
  const args = {checkedRequestId: identity.requestId};
  const unsigned = {...identity, protocolVersion: 3 as const,
    toolName: 'ggb_build' as const, arguments: args,
    argumentsDigest: digestJson(args), issuedAt: new Date().toISOString(),
    nonce: 'c'.repeat(32)};
  return {...unsigned, authentication: signRequest(token, unsigned)};
}
function receipt(): BuildReceipt {
  return {...identity, receiptSchemaVersion: 2, buildId: randomUUID(),
    domainRequestDigest: digest, baseSha256: null,
    pluginName: 'ggb-plugins-dsh', pluginVersion: '0.8.3',
    packageIntegrity: digest, runtimeIdentity: {geogebraVersion: '5.4',
      geogebraSha256: digest, playwrightVersion: '1.64.1'},
    status: 'succeeded', issues: [], verification: {reportSha256: digest, reportBytes: 10,
      summary: {status: 'passed'}},
    artifacts: ['result_ggb', 'verification', 'manifest'].map(kind => ({
      kind: kind as 'result_ggb' | 'verification' | 'manifest',
      ref: kind + '.bin', bytes: 10, sha256: digest,
      contentType: 'application/octet-stream'}))};
}

test('authentication covers identity and canonical arguments', () => {
  const value = request();
  assert.equal(authenticateRequest(token, value), true);
  assert.equal(authenticateRequest('d'.repeat(64), value), false);
  assert.equal(authenticateRequest(token,
      {...value, turnId: randomUUID()}), false);
  assert.throws(() => parseToolRequest({...value,
    arguments: {checkedRequestId: randomUUID()}}), /argumentsDigest/);
  assert.equal(digestJson({a: 1, b: 2}), digestJson({b: 2, a: 1}));
});

test('unknown versions, injected identities and oversized calls fail closed', () => {
  const value = request();
  for (const patch of [{protocolVersion: 1}, {protocolVersion: 2}, {epoch: 0}, {runId: 'other'},
    {outputDir: '/tmp/injected'}, {toolName: 'bash'},
    {nonce: ''}, {issuedAt: 'yesterday'}, {authentication: 'short'}]) {
    assert.throws(() => parseToolRequest({...value, ...patch}));
  }
  const args = {checkedRequestId: 'x'.repeat(128 * 1024)};
  assert.throws(() => parseToolRequest({...value,
    arguments: args, argumentsDigest: digestJson(args)}), /draft_chunk_too_large/);
});

test('host execution context requires paired base facts and absolute roots', () => {
  const value = {...identity, protocolVersion: 2, buildId: randomUUID(),
    domainRequestDigest: digest, baseRef: null, baseSha256: null,
    outputRoot: '/tmp/run/build', deadline: new Date().toISOString()};
  assert.deepEqual(parseExecutionContext(value), value);
  assert.throws(() => parseExecutionContext({...value,
    baseRef: '/tmp/base.ggb'}), /base/);
  assert.throws(() => parseExecutionContext({...value,
    outputRoot: 'relative'}), /outputRoot/);
});

test('success requires complete unique artifacts and exact receipt version', () => {
  const value = receipt();
  assert.deepEqual(parseBuildReceipt(value), value);
  for (const patch of [{receiptSchemaVersion: 1}, {verification: null},
    {artifacts: value.artifacts.slice(1)},
    {artifacts: [...value.artifacts, value.artifacts[0]]},
    {issues: [{code: 'failed', message: 'failed'}]},
    {runtimeIdentity: {geogebraVersion: '5.4'}}]) {
    assert.throws(() => parseBuildReceipt({...value, ...patch}));
  }
  for (const ref of ['/tmp/result.ggb', '../result.ggb', 'a/../b',
    'C:\\result.ggb', 'a\u0000b']) {
    assert.throws(() => parseBuildReceipt({...value,
      artifacts: value.artifacts.map(item => ({...item, ref}))}), /ref/);
  }
});

test('structured rejection and transport errors cannot claim delivery', () => {
  const value = {...receipt(), status: 'rejected', artifacts: [],
    issues: [{code: 'bad_request', message: 'plan required', path: 'plan'}],
    verification: null};
  assert.deepEqual(parseBuildReceipt(value), value);
  assert.throws(() => parseBuildReceipt({...value, issues: []}));
  const response = {protocolVersion: 3, requestId: identity.requestId,
    type: 'tool.error', result: null, error: 'unauthorized'};
  assert.deepEqual(parseToolResponse(response), response);
  assert.throws(() => parseToolResponse({...response, result: {ok: true}}));
});

test('only the verified DSH combination is accepted', () => {
  assert.doesNotThrow(() => assertDshCompatibility('0.2.1-rc.2'));
  for (const version of ['0.2.0-rc.2', '0.2.1-rc.3', 'latest', '']) {
    assert.throws(() => assertDshCompatibility(version), /unsupported/);
  }
});


test('model arguments cannot choose paths or alter the domain version', () => {
  const value = request();
  for (const args of [{request: {protocolVersion: 2, outputDir: '/tmp'}},
    {request: {protocolVersion: 2, base: '/tmp/base.ggb'}},
    {request: {protocolVersion: 1}}, {request: {}, buildId: randomUUID()}]) {
    assert.throws(() => parseToolRequest({...value, arguments: args,
      argumentsDigest: digestJson(args)}));
  }
  const args = {};
  assert.doesNotThrow(() => parseToolRequest({...value,
    toolName: 'ggb_inspect', arguments: args,
    argumentsDigest: digestJson(args)}));
});


test('inspect permits only fixed bundled reference topics', () => {
  for (const reference of ['patterns', 'interactions', undefined]) {
    const value = request();
    value.toolName = 'ggb_inspect';
    value.arguments = reference === undefined ? {} : {reference};
    value.argumentsDigest = digestJson(value.arguments);
    value.authentication = signRequest(token, value);
    assert.doesNotThrow(() => parseToolRequest(value));
  }
  for (const reference of ['/etc/passwd', '../run.json', 'https://example.com']) {
    const value = request();
    value.toolName = 'ggb_inspect';
    value.arguments = {reference};
    value.argumentsDigest = digestJson(value.arguments);
    assert.throws(() => parseToolRequest(value), /reference/);
  }
});
