/** @fileoverview Provision the pinned GeoGebra runtime with resumable download. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const lock = JSON.parse(await readFile(join(root, 'runtime.lock.json'), 'utf8'));

/** Reuses an installed runtime that matches the lock file. */
async function installed() {
  try {
    const current = JSON.parse(await readFile(join(root, '.runtime', 'runtime.json'), 'utf8'));
    return current.sha256 === lock.sha256 && current.url === lock.url;
  } catch { return false; }
}

/** Download or reuse a partial archive; SHA-256 still decides acceptance. */
async function fetchArchive(cache, destination) {
  await mkdir(cache, { recursive: true });
  const source = process.env.GGB_RUNTIME_URL?.trim() || lock.url;
  try {
    execFileSync('curl', ['--fail', '--location', '--retry', '5',
      '--retry-delay', '2', '--retry-all-errors', '--max-time', '600',
      '--continue-at', '-', source, '-o', destination], { stdio: 'inherit' });
  } catch (error) {
    throw new Error(`GeoGebra download failed; partial archive kept at ${destination}. `
      + 'Retry the installer to resume, or pass the official ZIP absolute path. '
      + `Cause: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (!process.argv[2] && await installed()) {
  console.log(`GeoGebra ${lock.version} already installed.`);
  process.exit(0);
}
const temp = await mkdtemp(join(root, '.runtime-'));
const cache = join(root, '.runtime-download');
let archive;
try {
  archive = process.argv[2]
    ? resolve(process.argv[2])
    : join(cache, 'runtime.zip');
  if (!process.argv[2]) await fetchArchive(cache, archive);
  const digest = createHash('sha256').update(await readFile(archive)).digest('hex');
  if (digest !== lock.sha256) {
    if (!process.argv[2]) await rm(archive, { force: true });
    throw new Error('GeoGebra archive SHA-256 mismatch');
  }
  execFileSync('unzip', ['-q', archive, '-d', join(temp, 'unpacked')]);
  await writeFile(join(temp, 'unpacked', 'runtime.json'),
    JSON.stringify(lock, null, 2) + '\n');
  await rename(join(temp, 'unpacked'), join(root, '.runtime'));
  await rm(cache, { recursive: true, force: true });
  console.log(`Installed GeoGebra ${lock.version} locally (not committed).`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
