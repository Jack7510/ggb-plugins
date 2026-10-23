/**
 * @fileoverview Repairs the pinned engine's uninitialized directrix path origin.
 * The archive stays unmodified. Served or provisioned assets are hash checked.
 */
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {writeAtomicFile} from './atomic-file.js';
export {writeAtomicFile} from './atomic-file.js';
import {join} from 'node:path';

const compatibilityId = 'directrix-path-origin-v1';
const patches = [
  {
    version: '5.4.932.1',
    permutation: 'A235CC712983FA478D93F2A05A5A8D23',
    original: 'a8d4d8ca7b456c777ae015fa333b737001910650fb5ab9978c6875818d80e743',
    patched: '73e64f70be068aab9733e95ceef6515472792b3ac07a4b18978fc7e44ac8e702',
    undefined: 'dSh', coords: 'jTh',
  },
  {
    version: '5.4.929.3',
    permutation: '38DDB4543208AF14503E6553B520534C',
    original: 'd37c92166104a55237c321aacfe2aca8e26e85aeecff4f9c48fb6c1437c4188a',
    patched: 'd515d707d1972ce2f587fb0d72ba8f098b6e5ca4f50dcc0f940ff4f66028c810',
    undefined: 'VBh', coords: '_Ch',
  },
] as const;
const digest = (data: Uint8Array): string =>
  createHash('sha256').update(data).digest('hex');
const assetPath = (permutation: string): string =>
  `HTML5/5.0/web3d/deferredjs/${permutation}/6.cache.js`;

/** Audit record shared by provisioning, startup checks and doctor. */
export interface RuntimeCompatibility {
  patchId: string;
  sourceVersion: string;
  asset: string;
  originalSha256: string;
  patchedSha256: string;
}

/** Public identity for the compatibility recipe, in addition to archive SHA. */
export function runtimeCompatibility(version: string): RuntimeCompatibility {
  const patch = patches.find(item => item.version === version);
  if (!patch) throw new Error('geogebra_compatibility_version_unsupported');
  return {patchId: compatibilityId, sourceVersion: version,
    asset: assetPath(patch.permutation), originalSha256: patch.original,
    patchedSha256: patch.patched};
}

/** Only exact pinned bytes can change; an unknown asset fails closed. */
export function compatibleRuntimeAsset(path: string, data: Buffer): Buffer {
  const patch = patches.find(item => path === assetPath(item.permutation));
  if (!patch) return data;
  const actual = digest(data);
  if (actual === patch.patched) return data;
  if (actual !== patch.original) {
    throw new Error('geogebra_compatibility_asset_mismatch');
  }
  // AlgoDirectrix.compute() initializes P for ellipses and hyperbolas, but
  // omits it for parabolas. GeoLine uses P to compute the path parameter.
  const before = `a.n.ib=-(a.n.gb*d+a.n.hb*f);${patch.undefined}(a.o)`;
  const after = `a.n.ib=-(a.n.gb*d+a.n.hb*f);`
    + `${patch.coords}(a.g,d,f,1,true);${patch.undefined}(a.o)`;
  const source = data.toString('utf8');
  if (source.split(before).length !== 2) {
    throw new Error('geogebra_compatibility_patch_mismatch');
  }
  const result = Buffer.from(source.replace(before, after));
  if (digest(result) !== patch.patched) {
    throw new Error('geogebra_compatibility_result_mismatch');
  }
  return result;
}

/** Prepare Client assets using the same public recipe as the plugin server. */
export async function prepareRuntimeCompatibility(
  geogebraRoot: string, version: string,
): Promise<ReturnType<typeof runtimeCompatibility>> {
  const identity = runtimeCompatibility(version);
  const path = join(geogebraRoot, identity.asset);
  const original = await readFile(path);
  const prepared = compatibleRuntimeAsset(identity.asset, original);
  if (prepared !== original) await writeAtomicFile(path, prepared);
  return identity;
}
