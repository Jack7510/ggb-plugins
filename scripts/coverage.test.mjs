import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { commandCalls, inventory } from './command-coverage.mjs';

test('coverage inventories nested calls without counting string labels or unknown names', () => {
  assert.deepEqual(commandCalls('a=Mean(Zip(t,t,{1,2}))+Sum({3})+Unknown(1)+"Mean(2)"', ['Mean','Zip','Sum']), ['Mean','Sum','Zip']);
});
test('unexecuted catalog entries remain untested, with no inferred support', () => {
  assert.deepEqual(inventory(['Circle','Cone'], [{ name:'geometry', calls:['Circle'] }]), [
    { command:'Circle',status:'delivered_examples',evidence:['geometry'] },
    { command:'Cone',status:'not_tested',evidence:[] },
  ]);
});
test('official catalog snapshot has provenance and unique sorted names', async () => {
  const catalog = JSON.parse(await readFile(new URL('../docs/command-catalog.json', import.meta.url), 'utf8'));
  assert.match(catalog.source, /^https:\/\/geogebra.github.io\//);
  assert.match(catalog.htmlSha256, /^[a-f0-9]{64}$/);
  assert(catalog.commands.length > 400);
  assert.deepEqual(catalog.commands, [...new Set(catalog.commands)].sort());
});
