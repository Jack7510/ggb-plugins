/** @fileoverview Bounded run-local drafts and immutable checked snapshots. */
import {randomUUID} from 'node:crypto';
import {resolveRequirementSources} from './draft-sources.js';
import {digestJson, LIMITS} from './host-protocol.js';
import {DRAFT_ARGUMENT_BYTES, DRAFT_SECTIONS, DraftError,
  parseDraftArguments, requireDraft, type DraftSection} from './draft-arguments.js';

type Item = Record<string, unknown>;
export interface DraftSnapshot {
  revision: number;
  domainRequestDigest: string;
  request: Record<string, unknown>;
}
interface Checked extends DraftSnapshot { checkedRequestId: string; }
const clone = <T>(value: T): T => structuredClone(value);
const REQUEST_SHAPE = 'Put only {plan,clarifications?} inside requestText; '
  + 'put locale/title/transcription in outer tool arguments.';

/** One authenticated turn owns this state. No filesystem or execution access. */
export class RequestDraft {
  private revision = 0;
  private document: Record<string, unknown> | null = null;
  private documentBytes = 0;
  private locale = '';
  private title: string | undefined;
  private sections: Record<DraftSection, unknown[]> = {
    program: [], requirements: [], checks: [], interactions: [], styles: [],
    edits: [], updates: [], view: [], display: [], clarifications: [],
    transcription: [],
  };
  private checked: Checked | null = null;
  constructor(private readonly prompt: string) {}

  /** Atomic writes invalidate checks; the first success fixes the input mode. */
  operate(input: unknown): Record<string, unknown> {
    const args = parseDraftArguments('ggb_request', input);
    if (args.requestText !== undefined) {
      requireDraft(this.revision === 0 || this.document !== null,
        'draft_mode_conflict');
      requireDraft(this.revision < 256, 'draft_revision_limit');
      const request = this.assembleText(String(args.requestText), args);
      this.document = request;
      this.documentBytes = Buffer.byteLength(JSON.stringify(request));
      this.revision++;
      this.checked = null;
      return this.summary();
    }
    requireDraft(this.document === null, 'draft_mode_conflict');
    if (args.action === 'create') {
      requireDraft(this.revision === 0, 'draft_already_exists');
      this.locale = String(args.locale);
      this.title = args.title as string | undefined;
      this.revision = 1;
      return this.summary();
    }
    this.match(args.revision);
    const section = args.section as DraftSection;
    if (args.action === 'read') return this.read(section, args);
    requireDraft(this.revision < 256, 'draft_revision_limit');
    const items = clone(this.sections[section]);
    const index = Number(args.index ?? items.length);
    const count = args.action === 'remove' ? Number(args.count ?? 1)
      : (args.items as unknown[]).length;
    requireDraft(index <= items.length && (args.action === 'append' ||
      index + count <= items.length), 'draft_index_range');
    if (args.action === 'remove') items.splice(index, count);
    else items.splice(index, args.action === 'replace' ? count : 0,
      ...clone(args.items as unknown[]));
    const next = {...this.sections, [section]: items};
    requireDraft(Buffer.byteLength(JSON.stringify(next)) <= LIMITS.requestBytes,
      'draft_request_too_large');
    this.sections = next;
    this.revision++;
    this.checked = null;
    return this.summary();
  }

  /** Assemble the exact complete domain request, preserving all check values. */
  forCheck(input: unknown): DraftSnapshot {
    const args = parseDraftArguments('ggb_check', input);
    this.match(args.revision);
    this.checked = null;
    const request = this.currentRequest();
    requireDraft(Buffer.byteLength(JSON.stringify(request)) <= LIMITS.requestBytes,
      'draft_request_too_large');
    return {revision: this.revision, request,
      domainRequestDigest: digestJson(request)};
  }

  /** Called only after the existing plugin checker has accepted the snapshot. */
  acceptCheck(snapshot: DraftSnapshot): Record<string, unknown> {
    this.match(snapshot.revision);
    requireDraft(digestJson(snapshot.request) === snapshot.domainRequestDigest &&
      digestJson(this.currentRequest()) === snapshot.domainRequestDigest,
      'draft_snapshot_changed');
    this.checked = {...clone(snapshot), checkedRequestId: randomUUID()};
    return {checkedRequestId: this.checked.checkedRequestId,
      revision: snapshot.revision,
      domainRequestDigest: snapshot.domainRequestDigest};
  }

  /** Never resolve an old, foreign or modified request to a build. */
  forBuild(input: unknown): DraftSnapshot {
    const args = parseDraftArguments('ggb_build', input);
    requireDraft(this.checked !== null &&
      this.checked.checkedRequestId === args.checkedRequestId,
    'draft_check_required');
    this.match(this.checked.revision);
    requireDraft(digestJson(this.currentRequest()) ===
      this.checked.domainRequestDigest, 'draft_snapshot_changed');
    return clone(this.checked);
  }

  private match(revision: unknown): void {
    requireDraft(this.revision > 0, 'draft_missing');
    requireDraft(revision === this.revision, 'draft_revision_conflict');
  }
  private summary(): Record<string, unknown> {
    if (this.document !== null) return {revision: this.revision,
      requestBytes: this.documentBytes,
      domainRequestDigest: digestJson(this.document)};
    return {revision: this.revision, counts: Object.fromEntries(
      DRAFT_SECTIONS.map(s => [s, this.sections[s].length])),
    maxArgumentBytes: DRAFT_ARGUMENT_BYTES};
  }
  private currentRequest(): Record<string, unknown> {
    return clone(this.document ?? this.assemble());
  }
  private assembleText(value: string, args: Record<string, unknown>): Record<string, unknown> {
    let parsed: unknown;
    try { parsed = JSON.parse(value); } catch (error) {
      throw new DraftError('draft_request_json',
        'requestText is not valid JSON. ' + REQUEST_SHAPE
        + ' Fix syntax/argument placement only; preserve construction, '
        + 'dependencies, requirements, checks and interactions.',
        jsonErrorLocation(value, error));
    }
    const body = record(parsed);
    if (Object.keys(body).some(k => !['plan', 'clarifications'].includes(k))) {
      throw new DraftError('draft_request_fields', REQUEST_SHAPE);
    }
    requireDraft(body.plan !== undefined, 'draft_request_plan');
    const plan = record(body.plan);
    // parseDraftArguments has validated an explicit transcription as string[].
    const prompt = args.transcription === undefined
      ? this.document?.prompt ?? this.prompt
      : [this.prompt, ...args.transcription as string[]].join('\n');
    const normalizedPlan = {...plan,
      ...(Array.isArray(plan.program) ? {program: plan.program.map(nativeStep)} : {}),
      ...(plan.requirements === undefined ? {} : {requirements:
        resolveRequirementSources(plan.requirements, String(prompt))})};
    const title = args.title ?? this.document?.title;
    const request = {protocolVersion: 2,
      prompt, locale: args.locale ?? this.document?.locale ?? 'zh-CN',
      plan: normalizedPlan,
      ...(body.clarifications === undefined ? {} : {clarifications: body.clarifications}),
      ...(title === undefined ? {} : {title})};
    requireDraft(Buffer.byteLength(JSON.stringify(request)) <= LIMITS.requestBytes,
      'draft_request_too_large');
    return request;
  }
  private read(section: DraftSection,
      args: Record<string, unknown>): Record<string, unknown> {
    const start = Number(args.index ?? 0);
    requireDraft(start <= this.sections[section].length, 'draft_index_range');
    const items: unknown[] = [];
    for (const item of this.sections[section].slice(start,
      start + Number(args.count ?? 1))) {
      if (Buffer.byteLength(JSON.stringify([...items, item])) >
        DRAFT_ARGUMENT_BYTES) break;
      items.push(clone(item));
    }
    return {revision: this.revision, section, items, nextIndex: start + items.length,
      more: start + items.length < this.sections[section].length};
  }
  private assemble(): Record<string, unknown> {
    const sections = clone(this.sections);
    const requirements = sections.requirements.map((value):
        Item & {checks: unknown[]} => {
      const item = record(value);
      requireDraft(Object.keys(item).every(k =>
        ['id', 'source', 'purpose'].includes(k)), 'draft_requirement_fields');
      return {...item, checks: [] as unknown[]};
    });
    const byId = new Map(requirements.map(r => [r.id, r]));
    requireDraft(byId.size === requirements.length, 'draft_duplicate_requirement');
    for (const value of sections.checks) {
      const {requirementId, ...check} = record(value);
      const target = byId.get(requirementId);
      requireDraft(target !== undefined, 'draft_requirement_missing');
      target.checks.push(check);
    }
    const plan: Item = {requirements, interactions: sections.interactions};
    for (const key of ['program', 'styles', 'edits', 'updates'] as const) {
      if (sections[key].length) plan[key] = key === 'program'
        ? sections[key].map(nativeStep) : sections[key];
    }
    for (const key of ['view', 'display'] as const) {
      requireDraft(sections[key].length <= 1, 'draft_singleton_section');
      if (sections[key].length) plan[key] = sections[key][0];
    }
    requireDraft(sections.transcription.every(t => typeof t === 'string' &&
      t.trim().length > 0), 'draft_transcription_text');
    return {protocolVersion: 2,
      prompt: [this.prompt, ...sections.transcription].join('\n'),
      locale: this.locale, plan,
      ...(this.title === undefined ? {} : {title: this.title}),
      ...(sections.clarifications.length ?
        {clarifications: sections.clarifications} : {})};
  }
}
/** Use parser coordinates only; never forward its input-bearing error text. */
function jsonErrorLocation(value: string,
  error: unknown): DraftError['details'] {
  if (!(error instanceof SyntaxError)) return undefined;
  const position = / at position (\d+)(?: \(line \d+ column \d+\))?$/u
    .exec(error.message);
  const offset = position ? Number(position[1])
    : error.message === 'Unexpected end of JSON input' ? value.length : null;
  if (offset === null || !Number.isSafeInteger(offset) || offset < 0 ||
    offset > value.length) return undefined;
  const before = value.slice(0, offset);
  return {offset, line: before.split('\n').length,
    column: offset - before.lastIndexOf('\n')};
}
function record(value: unknown): Item {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DraftError('draft_item_object');
  }
  return value as Item;
}
function nativeStep(value: unknown): Item {
  const step = record(value);
  requireDraft(Object.keys(step).every(k =>
    ['id', 'source', 'op', 'mode', 'outputs', 'initial'].includes(k)),
  'draft_program_fields');
  requireDraft(step.op === undefined || step.op === 'native', 'draft_program_fields');
  return {op: 'native', mode: 'algebra', ...step};
}
