/** @fileoverview Publishes complete files through same-directory atomic rename. */
import {randomUUID} from 'node:crypto';
import {lstat, open, rename, rm} from 'node:fs/promises';
import {basename, dirname, join} from 'node:path';

/** Replacement is visible, but crash durability was not confirmed. */
export class AtomicFileDurabilityError extends Error {
  readonly committed = true;
  readonly durabilityConfirmed = false;
  readonly phase = 'parent-sync';

  constructor(cause: unknown) {
    super('atomic_file_committed_durability_unconfirmed', {cause});
    this.name = 'AtomicFileDurabilityError';
  }
}

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
      try {
        const parent = await open(directory, 'r');
        try {await parent.sync();} finally {await parent.close();}
      } catch (cause) {
        throw new AtomicFileDurabilityError(cause);
      }
    }
  } finally {
    await handle.close().catch(() => {});
    await rm(temporary, {force: true}).catch(() => {});
  }
}
