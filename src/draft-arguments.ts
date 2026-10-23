/** @fileoverview Closed, bounded model arguments for run-local request drafts. */
export const DRAFT_ARGUMENT_BYTES = 2048;
export const DRAFT_SECTIONS = ['program', 'requirements', 'checks',
  'interactions', 'styles', 'edits', 'updates', 'view', 'display',
  'clarifications', 'transcription'] as const;
export type DraftSection = typeof DRAFT_SECTIONS[number];
export type DraftArguments = Record<string, unknown>;

/** A recoverable draft error; it never contains submitted data or paths. */
export class DraftError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'DraftError';
  }
}

/** Reject open keys, invalid revisions and large blocks before state changes. */
export function parseDraftArguments(tool: string,
    input: unknown): DraftArguments {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new DraftError('draft_arguments_object');
  }
  const args = input as DraftArguments;
  if (Buffer.byteLength(JSON.stringify(args)) > DRAFT_ARGUMENT_BYTES) {
    throw new DraftError('draft_chunk_too_large');
  }
  if (tool === 'ggb_build') {
    keys(args, ['checkedRequestId']);
    requireDraft(typeof args.checkedRequestId === 'string' &&
      /^[a-f0-9-]{36}$/u.test(args.checkedRequestId), 'checked_request_id');
    return args;
  }
  if (tool === 'ggb_check') {
    keys(args, ['revision']);
  } else if (args.action === 'create') {
    keys(args, ['action', 'locale', 'title']);
    requireDraft(typeof args.locale === 'string' && args.locale.length > 0 &&
      args.locale.length <= 32, 'draft_locale');
    requireDraft(args.title === undefined || typeof args.title === 'string' &&
      args.title.length <= 60, 'draft_title');
    return args;
  } else {
    requireDraft(tool === 'ggb_request' &&
      ['read', 'append', 'replace', 'remove'].includes(String(args.action)),
    'draft_action');
    keys(args, ['action', 'revision', 'section', 'index', 'count', 'items']);
    requireDraft(DRAFT_SECTIONS.includes(args.section as DraftSection),
      'draft_section');
    validateEdit(args);
  }
  requireDraft(Number.isSafeInteger(args.revision) &&
    Number(args.revision) >= 1, 'draft_revision');
  return args;
}

/** Fail closed without echoing untrusted values. */
export function requireDraft(ok: boolean, code: string): asserts ok {
  if (!ok) throw new DraftError(code);
}
function keys(args: DraftArguments, allowed: string[]): void {
  requireDraft(Object.keys(args).every(key => allowed.includes(key)),
    'draft_unknown_field');
}
function validateEdit(args: DraftArguments): void {
  const read = args.action === 'read';
  const remove = args.action === 'remove';
  if (!read && !remove) {
    requireDraft(Array.isArray(args.items) && args.items.length >= 1 &&
      args.items.length <= 8, 'draft_items');
  } else requireDraft(args.items === undefined, 'draft_items_not_allowed');
  if (args.action === 'replace' || remove) {
    requireDraft(Number.isSafeInteger(args.index) &&
      Number(args.index) >= 0, 'draft_index');
  }
  requireDraft(args.index === undefined || Number.isSafeInteger(args.index) &&
    Number(args.index) >= 0, 'draft_index');
  requireDraft(args.count === undefined || Number.isSafeInteger(args.count) &&
    Number(args.count) >= 1 && Number(args.count) <= 8, 'draft_count');
  requireDraft(read || remove || args.count === undefined,
    'draft_count_not_allowed');
  requireDraft(args.action !== 'append' || args.index === undefined,
    'draft_index_not_allowed');
}
