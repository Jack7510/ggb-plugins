/** @fileoverview Negative tests for the browser-free public executor schema. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {parseExecutionResult, parseInspectData, projectInspect}
  from '../src/execution-contract.js';
import type {InspectData} from '../src/execution-contract.js';

const inspected: InspectData = {sha256: 'a'.repeat(64), bytes: 10,
  version: '5.0', entries: ['geogebra.xml'], view: null, objects: [{
    name: 'A', type: 'point', defined: true, dependent: false,
    moveable: true, fixed: false, visible: true, color: '#000000',
    lineThickness: 1, lineStyle: 0, filling: null, labelVisible: true,
    caption: '', definition: 'x'.repeat(800), value: null,
    x: 0, y: 0, slider: null}]};
const checked = {protocolVersion: 3, operation: 'check',
  contextSha256: 'b'.repeat(64), packageIntegrity: 'c'.repeat(64),
  phase: 'preflight', ok: true, receipt: null, error: null,
  data: {validation: 'structural', mode: 'create', programSteps: 1,
    requirements: 1, samples: 0}};

test('public response rejects old CLI, bad operation, phase and check shape', () => {
  assert.doesNotThrow(() => parseExecutionResult(checked));
  for (const value of [{...checked, protocolVersion: 1},
    {...checked, protocolVersion: 2}, {...checked, phase: 'execution'},
    {...checked, operation: 'shell'}, {...checked, contextSha256: 'bad'},
    {...checked, data: {ok: true}}, {...checked, data: {...checked.data,
      programSteps: '1'}}]) {
    assert.throws(() => parseExecutionResult(value), /executor_/);
  }
});

test('inspect has a complete public schema and a bounded plugin projection', () => {
  assert.doesNotThrow(() => parseInspectData(inspected));
  const output = projectInspect(inspected) as unknown as InspectData;
  assert.equal(output.objects[0]?.definition.length, 500);
  for (const value of [{...inspected, path: '/private/base.ggb'},
    {...inspected, sha256: 'bad'}, {...inspected, objects: [{}]},
    {...inspected, objects: [{...inspected.objects[0], defined: 'yes'}]},
    {...inspected, view: {xZero: 0, yZero: 0, scale: 0}}]) {
    assert.throws(() => parseInspectData(value), /executor_/);
  }
});
