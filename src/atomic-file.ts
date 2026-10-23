/** @fileoverview Publishes complete files through same-directory atomic rename. */
import {randomUUID} from 'node:crypto';
import {lstat, open, rename, rm} from 'node:fs/promises';
import {basename, dirname, join} from 'node:path';

/** Sync file bytes before replacement; preserve an existing regular file's mode. */
export async function writeAtomicFile(
  path: string, data: string | Uint8Array,
): Promise<void> {
  const previous = await lstat(path).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return undefined;
  });
  if (previous && !previous.isFile()) {
    throw new Error('atomic_file_target_not_regular');
  }
  const directory = dirname(path);
  const temporary = join(directory, `.${basename(path)}.${randomUUID()}.tmp`);
  const handle = await open(temporary, 'wx', previous
    ? previous.mode & 0o777 : 0o644);
  try {
    await handle.writeFile(data);
    await handle.sync();
    await handle.close();
    await rename(temporary, path);
    if (process.platform !== 'win32') {
      const parent = await open(directory, 'r');
      try {await parent.sync();} finally {await parent.close();}
    }
  } finally {
    await handle.close().catch(() => {});
    await rm(temporary, {force: true}).catch(() => {});
  }
}
