/**
 * @fileoverview Derives the delivery directory and GGB file name from the
 * request title: removes filesystem-unsafe characters, bounds the length, and
 * claims a unique directory so an earlier delivery is never overwritten.
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

/** Path separators and characters Windows forbids in a name. */
const UNSAFE = /[\\/:*?"<>|]/gu;
/** Control characters never belong in a name. */
const CONTROL = /[\u0000-\u001f\u007f]/gu;
/** Windows device names cannot be used as a file or directory name. */
const RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu;
/** A trailing extension would otherwise be doubled in the GGB file name. */
const GGB_EXTENSION = /\.ggb$/iu;
/** Numbered variants tried before a repeated title is reported. */
const MAX_ATTEMPTS = 100;
/** Name used when the title carries no usable characters. */
const FALLBACK = 'ggb-construction';

/**
 * Turn a title into a safe, readable single path segment.
 * @param text - candidate title, normally the request title or prompt.
 * @param max - maximum number of characters to keep.
 * @returns a non-empty name without separators, control characters, or dot
 *   edges; a reserved name is prefixed instead of rejected.
 */
export const safeName = (text: string, max: number): string => {
  const cleaned = text
    .replace(CONTROL, ' ')
    .replace(UNSAFE, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/gu, '')
    .replace(GGB_EXTENSION, '')
    .trim();
  // Slice by code points so a surrogate pair is never split.
  const limit = Number.isFinite(max) && max > 0 ? Math.floor(max) : 60;
  const bounded = Array.from(cleaned).slice(0, limit).join('')
    .trim().replace(/[.\s]+$/gu, '');
  if (bounded === '') return FALLBACK;
  return RESERVED.test(bounded) ? `ggb-${bounded}` : bounded;
};

/**
 * Name requested for a delivery: the host title when present, else the prompt.
 * @param request - parsed request carrying an optional title.
 * @param max - maximum number of characters to keep.
 * @returns the sanitized delivery name.
 */
export const requestedName = (
  request: { title?: string; prompt: string },
  max: number,
): string => safeName(request.title ?? request.prompt, max);

/**
 * Claim a unique run directory under an existing output root.
 * @param outputDir - existing output root; the caller creates it first.
 * @param name - sanitized delivery name.
 * @returns the claimed absolute directory and the base name actually used,
 *   which the caller also uses for the GGB file inside the delivery.
 * @throws when a different filesystem error occurs, or when every numbered
 *   variant up to {@link MAX_ATTEMPTS} already exists.
 */
export const claimRunDirectory = async (
  outputDir: string,
  name: string,
): Promise<{ directory: string; name: string }> => {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const candidate = attempt === 1 ? name : `${name}-${attempt}`;
    const directory = join(outputDir, candidate);
    try {
      await mkdir(directory);
      return { directory, name: candidate };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
  throw new Error(
    `Too many deliveries named "${name}" under ${outputDir}`,
  );
};
