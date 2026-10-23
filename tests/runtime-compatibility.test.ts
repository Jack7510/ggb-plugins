/** @fileoverview Rejects mismatched engine assets without executing GeoGebra. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {compatibleRuntimeAsset, runtimeCompatibility}
  from '../src/runtime-compatibility.js';

test('compatibility repairs only pinned engine assets', () => {
  const data = Buffer.from('unrelated resource');
  assert.equal(compatibleRuntimeAsset('asset.js', data), data);
  for (const version of ['5.4.929.3', '5.4.932.1']) {
    const identity = runtimeCompatibility(version);
    assert.match(identity.sha256, /^[a-f0-9]{64}$/u);
    assert.throws(() => compatibleRuntimeAsset(identity.asset, data),
      /geogebra_compatibility_asset_mismatch/u);
  }
  assert.throws(() => runtimeCompatibility('5.4.999.1'),
    /geogebra_compatibility_version_unsupported/u);
});
