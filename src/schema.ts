/** @fileoverview Validates request envelopes and owns shared capabilities. */
import assert from 'node:assert/strict';
import { AssertionError } from 'node:assert';
import { isAbsolute } from 'node:path';
import { validateNewObjectName } from './names.js';

export class ToolError extends Error {
  constructor(public code: string, message: string, public details?: unknown) { super(message); }
}

/** Input validation asserts become classified rejections; other faults stay faults. */
export function throwInputError(error: unknown): never {
  if (error instanceof ToolError || !(error instanceof AssertionError)) throw error;
  throw new ToolError('invalid_input', error.message);
}

export function toolError(error: unknown, code: string, signal?: AbortSignal): ToolError {
  if (signal?.aborted) return new ToolError(signal.reason?.name === 'TimeoutError' ? 'limit_exceeded' : 'cancelled', String(signal.reason?.message ?? 'Cancelled'));
  return error instanceof ToolError ? error : new ToolError(code, error instanceof Error ? error.message : String(error));
}

export const limits = { requestBytes: 128 * 1024, reportBytes: 16 * 1024 * 1024, promptChars: 12000, titleChars: 60, steps: 64, requirements: 64, checks: 256, samples: 12, coordinate: 10000, ggbBytes: 10 * 1024 * 1024, operationMs: 30_000, buildMs: 120_000, doctorMs: 45_000 };
export const commands: Record<string, { signatures: string[][]; output: string; native?: string; variadic?: boolean }> = {
  Segment: { signatures: [['point', 'point']], output: 'segment' },
  Line: { signatures: [['point', 'point'], ['point', 'line']], output: 'line' },
  Midpoint: { signatures: [['point', 'point']], output: 'point' },
  PerpendicularLine: { signatures: [['point', 'line']], output: 'line', native: 'OrthogonalLine' },
  Intersect: { signatures: [['line', 'line']], output: 'point' },
  Circle: { signatures: [['point', 'point'], ['point', 'number']], output: 'circle' },
  Polygon: { signatures: [['point', 'point', 'point']], output: 'polygon', variadic: true },
};
export const predicates: Record<string, { types: string[]; extra?: string; variadic?: boolean }> = {
  expression: { types: ['any'], variadic: true },
  exists: { types: ['any'] },
  type: { types: ['any'], extra: 'objectType' },
  coordinate: { types: ['point'], extra: 'coordinates' },
  midpoint: { types: ['point', 'point', 'point'] },
  pointOn: { types: ['point', 'line|circle|conic|ellipse|hyperbola|parabola'] },
  center: { types: ['circle', 'point'] },
  radius: { types: ['circle'], extra: 'value' },
  parallel: { types: ['line', 'line'] },
  perpendicular: { types: ['line', 'line'] },
  equalLength: { types: ['segment', 'segment'] },
  distance: { types: ['point', 'point'], extra: 'value' },
  nonCollinear: { types: ['point', 'point', 'point'] },
  dependsOn: { types: ['any', 'any'], variadic: true },
  style: { types: ['any'], extra: 'properties' },
};
export interface Style { visible?: boolean; labelVisible?: boolean; color?: string; lineThickness?: number; lineStyle?: number; filling?: number; caption?: string; fixed?: boolean; }
export type Argument = number | { ref: string };
export type MathValue = number | boolean | MathValue[];
export type Interaction = { point: string; dx: number; dy: number } | { parameter: string; value: number };
export type Step = { id: string; op: 'freePoint'; x: number; y: number } | { id: string; op: 'command'; name: string; args: Argument[] }
  | { id: string; op: 'native'; source: string; mode: 'algebra' | 'cas'; outputs?: string[]; initial?: [number, number] };
export interface Check { kind: string; subjects: string[]; scope: 'initial' | 'sampled'; coordinates?: [number, number]; value?: number; properties?: Style; objectType?: string; expression?: string; mode?: 'algebra' | 'cas'; expected?: MathValue; assumptions?: string[]; }
/** P0 edits change presentation only; structure and values stay untouched. */
export type EditStyle = {
  color?: string; lineThickness?: number; lineStyle?: number;
  filling?: number; labelVisible?: boolean; visible?: boolean;
};
export interface Edit { object: string; properties: EditStyle }
/** A controlled value change on one independent base object. */
export interface Update { object: string; value?: number; coords?: [number, number] }
export const evidencePurposes = [
  'construction', 'constraint', 'interaction',
] as const;
export type EvidencePurpose = typeof evidencePurposes[number];
export interface Request {
  protocolVersion: 2; prompt: string; locale: string; outputDir: string;
  title?: string;
  base?: { path: string; sha256: string };
  clarifications?: { question: string; answer: string }[];
  plan: {
    program: Step[];
    edits?: Edit[];
    updates?: Update[];
    requirements: { id: string; source: string; checks: Check[];
      purpose?: EvidencePurpose }[];
    styles?: { object: string; properties: Style }[];
    interactions: Interaction[];
    view?: { xMin: number; xMax: number; yMin: number; yMax: number };
    display?: 'graphics' | 'algebra';
  };
}

// Fields the model sometimes lifts out of `plan`; naming them shortens a retry.
const planOnly = ['interactions', 'styles', 'requirements', 'view', 'display'];

function record(value: unknown, keys: string[]): Record<string, any> {
  assert(value && typeof value === 'object' && !Array.isArray(value),
    'Expected an object');
  const unknown = Object.keys(value).filter(key => !keys.includes(key));
  if (unknown.length) {
    const misplaced = keys.includes('plan') ?
      unknown.filter(key => planOnly.includes(key)) : [];
    const hint = misplaced.length ?
      `; ${misplaced.join(', ')} belong under plan` : '';
    throw new ToolError('invalid_input',
      `Unknown field: ${unknown.join(', ')}${hint}`);
  }
  return value as Record<string, any>;
}
function text(value: unknown, max = 2048): asserts value is string {
  assert(typeof value === 'string' && value.trim().length > 0 && value.length <= max, 'Invalid text');
}
const labelPattern = /^[A-Za-z][A-Za-z0-9_]*(?:\{[A-Za-z0-9]+\})?$/;
/** Requirement IDs label evidence only; they never enter GeoGebra. */
function requirementId(value: unknown): asserts value is string {
  assert(typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(value),
    `Invalid requirement ID: ${JSON.stringify(value)}`);
}

function identifier(value: unknown): asserts value is string {
  assert(typeof value === 'string' && value.length <= 32 && labelPattern.test(value)
    && !['e', 'i', 'x', 'y', 'z', 'pi'].includes(value) && !value.startsWith('GgbProbe'),
  `Invalid or reserved object identifier: ${JSON.stringify(value)}`);
}
/** Every declared new output uses the same syntax and built-in protection. */
function newObjectIdentifier(value: unknown): asserts value is string {
  assert(typeof value === 'string' && value.length <= 32
    && labelPattern.test(value),
  `Invalid object identifier: ${JSON.stringify(value)}`);
  validateNewObjectName(value);
}
function finite(value: unknown, max = limits.coordinate): asserts value is number {
  assert(typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= max, 'Invalid finite number');
}
function array(value: unknown, min: number, max: number): asserts value is any[] {
  assert(Array.isArray(value) && value.length >= min && value.length <= max,
    `Invalid array length: ${Array.isArray(value) ? String(value.length) : 'not an array'} (expected ${String(min)}..${String(max)})`);
}
function style(value: unknown) {
  const p = record(value, ['visible', 'labelVisible', 'color', 'lineThickness', 'lineStyle', 'filling', 'caption', 'fixed']);
  assert(Object.keys(p).length > 0, 'Empty style');
  for (const key of ['visible', 'labelVisible', 'fixed']) if (key in p) assert(typeof p[key] === 'boolean', 'Invalid visibility/fixed flag');
  if ('color' in p) assert(typeof p.color === 'string' && /^#[0-9a-f]{6}$/i.test(p.color), 'Invalid color');
  if ('caption' in p) text(p.caption, 100);
  for (const [key, min, max] of [['lineThickness', 1, 13], ['lineStyle', 0, 4]] as const) {
    if (key in p) assert(Number.isInteger(p[key]) && p[key] >= min && p[key] <= max, `Invalid ${key}`);
  }
  // Filling is an opacity, so fractions are valid; the other style fields are
  // discrete integers.
  if ('filling' in p) {
    assert(typeof p.filling === 'number' && Number.isFinite(p.filling)
      && p.filling >= 0 && p.filling <= 1, 'Invalid filling');
  }
}

/** Validate one expression check, including its declared subject tokens. */
function expressionCheck(check: any, requirementId: string, index: number,
  sources: string[]) {
  mathSource(check.expression);
  assert(['algebra', 'cas'].includes(check.mode), 'Invalid check mode');
  let values = 0;
  const expected = (value: unknown, depth = 0) => {
    assert(++values <= 256 && depth <= 8,
      'Expected value exceeds structural limits');
    if (Array.isArray(value)) {
      value.forEach(v => expected(v, depth + 1));
      return;
    }
    assert(typeof value === 'boolean' || typeof value === 'number',
      'Expected boolean, number or nested list, got '
      + `${String(JSON.stringify(value) ?? value).slice(0, 80)}`);
    if (typeof value === 'number') finite(value, Number.MAX_VALUE);
  };
  expected(check.expected);
  if ('assumptions' in check) {
    assert(check.mode === 'cas', 'Assumptions require CAS');
    array(check.assumptions, 1, 8);
    for (const assumption of check.assumptions) {
      mathSource(assumption);
      assert(sources.some(source => source.includes(assumption)),
        'Assumption is not in the input');
    }
  }
  const tokens = mathTokens(check.expression);
  const missing = check.subjects.filter(
    (id: string) => !tokens.includes(id));
  assert(missing.length === 0, `Check ${requirementId}:${index} expression `
    + `must reference every declared subject; missing ${missing.join(', ')}`);
}

// Base labels come from the file: they may be non-ASCII (`θ1`), primed
// (`L_2'`) or subscripted (`B_{1,2}`). They are only used as lookup keys, never
// spliced into expressions, so this grammar stays permissive on purpose.
const baseLabelPattern = /^[^\s"<>&\u0000-\u001f]{1,64}$/;

/** Subject counts follow the predicate arity; a miss names the check. */
function subjectCount(
  check: Record<string, any>, spec: { types: string[]; variadic?: boolean },
  requirement: string,
) {
  const min = spec.types.length;
  const max = spec.variadic ? 16 : min;
  const actual = Array.isArray(check.subjects) ? check.subjects.length : -1;
  assert(actual >= min && actual <= max,
    `Check "${requirement}" ${String(check.kind)}: expected `
    + `${String(min)}${max === min ? '' : `..${String(max)}`} subjects, `
    + `got ${actual < 0 ? 'none' : String(actual)}`);
}

/** Accepts any label an existing file may hold. */
function baseName(value: unknown): asserts value is string {
  assert(typeof value === 'string' && baseLabelPattern.test(value),
    'Invalid base object name');
}

function editStyle(value: unknown) {
  const p = record(value, ['color', 'lineThickness', 'lineStyle', 'filling',
    'labelVisible', 'visible']);
  assert(Object.keys(p).length > 0, 'Empty edit');
  if ('color' in p) {
    assert(typeof p.color === 'string' && /^#[0-9a-f]{6}$/i.test(p.color),
      'Invalid color');
  }
  for (const key of ['labelVisible', 'visible']) {
    if (key in p) assert(typeof p[key] === 'boolean', 'Invalid flag');
  }
  for (const [key, min, max] of [['lineThickness', 1, 13],
    ['lineStyle', 0, 4]] as const) {
    if (key in p) {
      assert(Number.isInteger(p[key]) && p[key] >= min && p[key] <= max,
        `Invalid ${key}`);
    }
  }
  if ('filling' in p) {
    assert(typeof p.filling === 'number' && Number.isFinite(p.filling)
      && p.filling >= 0 && p.filling <= 1, 'Invalid filling');
  }
}

/** One controlled update: a numeric value or point coordinates. */
function update(value: unknown) {
  const u = record(value, ['object', 'value', 'coords']);
  baseName(u.object);
  assert(('value' in u) !== ('coords' in u),
    'An update declares either value or coords');
  if ('value' in u) finite(u.value);
  if ('coords' in u) {
    array(u.coords, 2, 2);
    u.coords.forEach((n: unknown) => finite(n));
  }
}

/** Check subjects may also be base labels such as `A'`, `θ1` or `B_{1}`. */
function subject(value: unknown): asserts value is string {
  if (typeof value === 'string' && baseLabelPattern.test(value)) return;
  identifier(value);
}

function baseInput(value: unknown): { path: string; sha256: string } {
  const base = record(value, ['path', 'sha256']);
  text(base.path, 4096);
  assert(isAbsolute(base.path), 'Base path must be absolute');
  assert(typeof base.sha256 === 'string' && /^[a-f0-9]{64}$/.test(base.sha256),
    'Invalid base sha256');
  return { path: base.path, sha256: base.sha256 };
}

type Fields = ReturnType<typeof record>;

/** Only original material and confirmed answers supply conditions. */
function requestSources(request: Fields): string[] {
  const sources: string[] = [request.prompt];
  if ('clarifications' in request) {
    array(request.clarifications, 0, 20);
    for (const input of request.clarifications) {
      const c = record(input, ['question', 'answer']);
      text(c.question);
      text(c.answer);
      sources.push(c.answer);
    }
  }
  return sources;
}

/** Modes differ in allowed effects, not in downstream completion gates. */
function validatePlanMode(p: Fields, base: boolean): void {
  if (!base) {
    assert(!('edits' in p), 'A creation request declares a program, not edits');
    assert(!('updates' in p), 'Updates apply only to a base');
    array(p.program, 1, limits.steps);
    return;
  }
  const presentation = 'edits' in p;
  const construction = ('program' in p && p.program.length > 0)
    || 'updates' in p || 'styles' in p;
  assert(!(presentation && construction),
    'An edit request declares edits, not a program or other construction changes');
  assert(presentation || construction,
    'A base request needs edits or construction changes');
  assert(!('view' in p),
    'The base keeps its own view; view edits are unsupported');
  if (presentation) {
    array(p.edits, 1, limits.steps);
    const targets = new Set<string>();
    for (const input of p.edits) {
      const edit = record(input, ['object', 'properties']);
      baseName(edit.object);
      assert(!targets.has(edit.object), 'Duplicate edit target');
      targets.add(edit.object);
      editStyle(edit.properties);
    }
    return;
  }
  if ('program' in p) {
    array(p.program, 0, limits.steps);
    for (const step of p.program) {
      assert(step?.op === 'native',
        'Base modifications declare native program steps');
    }
  }
  if ('updates' in p) {
    array(p.updates, 1, limits.steps);
    const targets = new Set<string>();
    for (const input of p.updates) {
      update(input);
      assert(!targets.has(input.object), 'Duplicate update target');
      targets.add(input.object);
    }
  }
}

/** Native output names follow policy; the engine validates source semantics. */
function validateNativeStep(step: Fields): void {
  mathSource(step.source);
  assert(['algebra', 'cas'].includes(step.mode), 'Invalid native mode');
  if ('outputs' in step) {
    array(step.outputs, 1, 16);
    step.outputs.forEach(newObjectIdentifier);
    assert(step.outputs.includes(step.id), 'Outputs must include step ID');
  }
  if ('initial' in step) {
    array(step.initial, 2, 2);
    step.initial.forEach((n: unknown) => finite(n));
  }
  if (step.mode === 'cas') {
    assert(!step.outputs || step.outputs.length === 1,
      'CAS materializes one named result');
  }
}

function validateProgram(program: unknown[]): void {
  for (const input of program) {
    const step = record(input,
      ['id', 'op', 'source', 'mode', 'outputs', 'initial',
        'x', 'y', 'name', 'args']);
    let keys = ['id', 'op', 'name', 'args'];
    if (step.op === 'native') {
      keys = ['id', 'op', 'source', 'mode', 'outputs', 'initial'];
    } else if (step.op === 'freePoint') keys = ['id', 'op', 'x', 'y'];
    record(input, keys);
    newObjectIdentifier(step.id);
    if (step.op === 'native') validateNativeStep(step);
    else if (step.op === 'freePoint') {
      finite(step.x);
      finite(step.y);
    } else {
      assert.equal(step.op, 'command', 'Unsupported operation');
      if (typeof step.name !== 'string'
        || !Object.hasOwn(commands, step.name)) {
        throw new ToolError('unsupported_operation', 'Unsupported command');
      }
      array(step.args, 2, 16);
      for (const arg of step.args) {
        if (typeof arg === 'number') finite(arg);
        else identifier(record(arg, ['ref']).ref);
      }
    }
  }
}

function validateCheck(input: unknown, requirement: string, index: number,
  sources: string[]): void {
  const c = record(input, ['kind', 'subjects', 'scope', 'value', 'coordinates',
    'properties', 'objectType', 'expression', 'expected',
    'mode', 'assumptions']);
  if (typeof c.kind !== 'string' || !Object.hasOwn(predicates, c.kind)) {
    throw new ToolError('unsupported_operation',
      'Unsupported verification method');
  }
  const spec = predicates[c.kind]!;
  subjectCount(c, spec, requirement);
  c.subjects.forEach(subject);
  assert(['initial', 'sampled'].includes(c.scope),
    'Check scope must be initial or sampled');
  if (c.kind === 'expression') expressionCheck(c, requirement, index, sources);
  else {
    const stray = ['expression', 'expected', 'mode', 'assumptions']
      .filter(key => key in c);
    assert(stray.length === 0,
      `Unexpected expression field in ${c.kind}: ${stray.join(', ')}`);
  }
  for (const key of ['value', 'coordinates', 'properties', 'objectType']) {
    assert((key in c) === (spec.extra === key), `Unexpected or missing ${key}`);
  }
  if (spec.extra === 'value') {
    finite(c.value);
    assert(c.value >= 0);
  }
  if (spec.extra === 'coordinates') {
    array(c.coordinates, 2, 2);
    c.coordinates.forEach((n: unknown) => finite(n));
  }
  if (spec.extra === 'properties') style(c.properties);
  if (spec.extra === 'objectType') text(c.objectType, 64);
}

function validateRequirements(value: unknown, sources: string[]): void {
  array(value, 1, limits.requirements);
  const ids = new Set<string>();
  let count = 0;
  for (const input of value) {
    const r = record(input, ['id', 'source', 'checks', 'purpose']);
    assert(r.purpose === undefined || evidencePurposes.includes(r.purpose),
      'Invalid evidence purpose');
    requirementId(r.id);
    assert(!ids.has(r.id), 'Duplicate requirement ID');
    ids.add(r.id);
    text(r.source, limits.promptChars);
    assert(sources.some(source => source.includes(r.source)),
      'Requirement source is not in the input');
    array(r.checks, 1, limits.checks);
    for (const [index, check] of r.checks.entries()) {
      validateCheck(check, r.id, index, sources);
      count++;
    }
  }
  assert(count <= limits.checks, 'Too many checks');
}

function validatePresentation(p: Fields, base: boolean): void {
  if ('styles' in p) {
    array(p.styles, 0, limits.steps);
    const targets = new Set<string>();
    for (const input of p.styles) {
      const s = record(input, ['object', 'properties']);
      if (base) baseName(s.object);
      else identifier(s.object);
      style(s.properties);
      assert(!targets.has(s.object), 'Duplicate style target');
      targets.add(s.object);
    }
  }
  if ('view' in p) {
    const v = record(p.view, ['xMin', 'xMax', 'yMin', 'yMax']);
    for (const key of ['xMin', 'xMax', 'yMin', 'yMax']) {
      finite(v[key], limits.coordinate * 2);
    }
    assert(v.xMax > v.xMin && v.yMax > v.yMin, 'Invalid view bounds');
  }
}

function validateInteractions(p: Fields, base: boolean): void {
  array(p.interactions, 0, limits.samples);
  assert(!base || p.interactions.length === 0,
    'Edit requests take no interaction samples yet');
  const points = new Set<string>();
  for (const input of p.interactions) {
    const sample = record(input, input && 'parameter' in input
      ? ['parameter', 'value'] : ['point', 'dx', 'dy']);
    const id = sample.parameter ?? sample.point;
    identifier(id);
    if ('parameter' in sample) finite(sample.value);
    else {
      finite(sample.dx, 120);
      finite(sample.dy, 120);
      assert(Math.hypot(sample.dx, sample.dy) >= 20,
        'Drag sample is too small: dx/dy are screen pixels; '
        + 'Math.hypot(dx,dy) must be >= 20, each absolute component <= 120');
    }
    const key = 'parameter' in sample ? `${id}:${sample.value}` : id;
    assert(!points.has(key), 'Duplicate interaction sample');
    points.add(key);
  }
}

/** Validate the full envelope before a browser starts or output is written. */
export function parseRequest(value: unknown): Request {
  try { return parseRequestValue(value); } catch (error) { return throwInputError(error); }
}

function parseRequestValue(value: unknown): Request {
  const r = record(value, ['protocolVersion', 'prompt', 'locale', 'outputDir',
    'title', 'clarifications', 'plan', 'base']);
  assert.equal(r.protocolVersion, 2,
    'Unsupported request protocol; regenerate with protocolVersion 2');
  text(r.prompt, limits.promptChars);
  text(r.locale, 32);
  text(r.outputDir);
  if ('title' in r) {
    text(r.title, limits.titleChars);
    assert(!/[\u0000-\u001f\u007f]/u.test(r.title),
      'Invalid title: remove control characters');
  }
  const base = 'base' in r ? baseInput(r.base) : undefined;
  const sources = requestSources(r);
  const p = record(r.plan, ['program', 'requirements', 'styles', 'interactions',
    'view', 'display', 'edits', 'updates']);
  if ('display' in p) {
    assert(['graphics', 'algebra'].includes(p.display), 'Invalid display');
  }
  validatePlanMode(p, Boolean(base));
  validateProgram(p.program ?? []);
  validateRequirements(p.requirements, sources);
  validatePresentation(p, Boolean(base));
  validateInteractions(p, Boolean(base));
  // Every field has been checked above; this clone is the validated envelope.
  const request = structuredClone(value) as Request;
  request.plan.program = request.plan.program ?? [];
  if (base) request.base = base;
  return request;
}

// Mathematical syntax belongs to GeoGebra. This scan only restricts host/script
// effects; browser isolation and post-execution object/material audits also apply.
const effects = new Set(('Execute Repeat Delete Rename SetValue SetCoords SetFixed SetColor SetCaption SetVisibleInView SetConditionToShowObject SetDynamicColor SetFilling SetLayer SetLineStyle SetLineThickness SetPointSize SetPointStyle SetTrace SetLabelMode ShowLabel ShowAxes ShowGrid SetAxesRatio SetBackgroundColor SetPerspective SetActiveView SetConstructionStep SetSeed SetSpinSpeed StartAnimation StartRecord RunClickScript RunUpdateScript ExportImage Download InsertImage Image Turtle Button Checkbox InputBox PlaySound ReadText Pan ZoomIn ZoomOut CenterView SelectObjects CopyFreeObject AttachCopyToView ParseToFunction ParseToNumber UpdateConstruction JavaScript RunJavaScript').toLowerCase().split(' '));
/** Structural source tokens only; never dependency or modification authority. */
export function mathTokens(source: string): string[] {
  return (source.replace(/"(?:\\.|[^"\\])*"/g, ' ').match(/[\p{L}][\p{L}\p{M}\p{N}_]*(?:\{[\p{L}\p{M}\p{N}]+\})?['′]*/gu) ?? []);
}
export function mathSource(source: unknown): asserts source is string {
  text(source, 8192);
  assert(!/[\r\n;\x00-\x1f`]/.test(source), 'One mathematical statement per step');
  const unquoted = source.replace(/"(?:\\.|[^"\\])*"/g, ' ');
  assert(!/https?:|javascript:|:=/i.test(unquoted), 'Unsupported external/script input');
  const calls = [...unquoted.matchAll(/([A-Za-z][A-Za-z0-9_]*)\s*[\[(]/g)].map(m => m[1]!.toLowerCase());
  if (calls.some(name => effects.has(name))) throw new ToolError('unsupported_operation', 'Only native mathematical commands are accepted; use structured presentation controls');
  assert(!mathTokens(source).some(token => token.startsWith('GgbProbe')), 'Reserved probe namespace');
}
