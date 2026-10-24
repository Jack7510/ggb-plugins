/** @fileoverview Resolves fixed input references; preserves literal sources. */
import {DraftError, requireDraft} from './draft-arguments.js';

/** Only the current turn's complete trusted input is addressable; no paths. */
export function resolveRequirementSources(value: unknown,
  input: string): unknown {
  if (!Array.isArray(value)) return value;
  return value.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
      !('sourceRef' in item)) return item;
    const {sourceRef, ...requirement} = item as Record<string, unknown>;
    if (sourceRef !== 'input' || 'source' in requirement) {
      throw new DraftError('draft_source_reference',
        'Use sourceRef:"input" alone, or copy an exact source excerpt.');
    }
    requireDraft(input.trim().length > 0, 'draft_source_reference_empty');
    return {...requirement, source: input};
  });
}
