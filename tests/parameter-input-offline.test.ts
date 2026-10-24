/** @fileoverview Exercises the parameter setter guard in an isolated VM. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import type {Page} from 'playwright';
import {interact} from '../src/browser.js';

function harness(options: {type?: string; independent?: boolean;
  movable?: boolean; fixed?: boolean; slider?: boolean;
  ignored?: boolean} = {}) {
  let current = 3;
  const writes: number[] = [];
  const api = {getXML: () => '',
    getObjectType: () => options.type ?? 'numeric',
    isIndependent: () => options.independent ?? true,
    isMoveable: () => options.movable ?? true,
    getValue: (id: string) => id === 'n' ? current : Number(id),
    setValue: (_id: string, value: number) => {
      writes.push(value);
      if (!options.ignored) current = value;
    }};
  class DOMParser {
    parseFromString() {return {querySelector(selector: string) {
      if (selector === 'slider') return options.slider === false ? null :
        {getAttribute: (key: string) => key === 'min' ? '3' : '12'};
      if (selector === 'fixed') return {getAttribute: () =>
        options.fixed ? 'true' : 'false'};
      return {getAttribute: () => '1'};
    }};}
  }
  // Serialize as Playwright does; no browser or GeoGebra is started.
  const page = {evaluate: async (callback: Function, input: unknown) =>
    runInNewContext(`(${callback.toString()})(input)`,
      {window: {ggb: api}, DOMParser, input})} as unknown as Page;
  return {page, writes};
}

test('setter validates slider capability before mutation', async () => {
  for (const options of [{type: 'point'}, {independent: false},
    {movable: false}, {fixed: true}, {slider: false}]) {
    const h = harness(options);
    await assert.rejects(interact(h.page, {parameter: 'n', value: 7}),
      /independent movable numeric slider/);
    assert.deepEqual(h.writes, []);
  }
});
test('setter enforces change, range, grid and observed effect', async () => {
  for (const value of [3, 2, 13, 3.5, 4.5, 7.5, Infinity, NaN]) {
    const h = harness();
    await assert.rejects(interact(h.page, {parameter: 'n', value}));
    assert.deepEqual(h.writes, []);
  }
  const h = harness();
  assert.equal(await interact(h.page, {parameter: 'n', value: 12}),
    'native_value');
  assert.equal(await interact(h.page, {parameter: 'n', value: 3}),
    'native_value');
  assert.deepEqual(h.writes, [12, 3]);
  const ignored = harness({ignored: true});
  await assert.rejects(interact(ignored.page, {parameter: 'n', value: 7}),
    /did not reach/);
});
