import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const lock = JSON.parse(await readFile(join(root, 'runtime.lock.json'), 'utf8'));
const temp = await mkdtemp(join(root, '.runtime-'));
try {
  const archive = process.argv[2] ? resolve(process.argv[2]) : join(temp, 'runtime.zip');
  if (!process.argv[2]) {
    execFileSync('curl', ['--fail', '--location', '--retry', '2', '--max-time', '180', lock.url, '-o', archive], { stdio: 'inherit' });
  }
  const digest = createHash('sha256').update(await readFile(archive)).digest('hex');
  if (digest !== lock.sha256) throw new Error('GeoGebra archive SHA-256 mismatch');
  execFileSync('unzip', ['-q', archive, '-d', join(temp, 'unpacked')]);
  await writeFile(join(temp, 'unpacked', 'runtime.json'), JSON.stringify(lock, null, 2) + '\n');
  await rename(join(temp, 'unpacked'), join(root, '.runtime'));
  console.log(`Installed GeoGebra ${lock.version} locally (not committed).`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
