/** @fileoverview Request envelope validation and shared vocabulary. */
import assert from 'node:assert/strict';
import { isAbsolute } from 'node:path';

export class ToolError extends Error {
  constructor(public code: string, message: string, public details?: unknown) { super(message); }
}

export function toolError(error: unknown, code: string, signal?: AbortSignal): ToolError {
  if (signal?.aborted) return new ToolError(signal.reason?.name === 'TimeoutError' ? 'limit_exceeded' : 'cancelled', String(signal.reason?.message ?? 'Cancelled'));
  return error instanceof ToolError ? error : new ToolError(code, error instanceof Error ? error.message : String(error));
}

export const limits = { requestBytes: 128 * 1024, reportBytes: 16 * 1024 * 1024, promptChars: 12000, steps: 64, requirements: 64, checks: 256, samples: 12, coordinate: 10000, ggbBytes: 10 * 1024 * 1024, operationMs: 30_000, buildMs: 120_000, doctorMs: 45_000 };
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
  pointOn: { types: ['point', 'line|circle'] },
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
// GeoGebra parses these exact names as functions, commands or constants, so a
// step that uses one as its object name fails at execution (`ln`) or shadows
// the built-in (`Circle`). The list is curated, not exhaustive: it covers the
// operators, the frequent commands and the reserved constants.
export const reservedNames: ReadonlySet<string> = new Set([
  'abs', 'and', 'asin', 'acos', 'atan', 'atan2', 'ceiling', 'cos', 'cosh',
  'cot', 'csc', 'div', 'e', 'else', 'elseif', 'erf', 'exp', 'false', 'floor',
  'gcd', 'i', 'if', 'in', 'lcm', 'lg', 'ln', 'log', 'log10', 'log2', 'max',
  'min', 'mod', 'not', 'nroot', 'or', 'pi', 'random', 'round', 'sec', 'sgn',
  'sin', 'sinh', 'sqrt', 'tan', 'tanh', 'then', 'true', 'xor',
  'Angle', 'AngleBisector', 'Append', 'Area', 'BarChart', 'Center', 'Circle',
  'Count', 'Derivative', 'Distance', 'Element', 'Ellipse', 'Expand', 'Factor',
  'First', 'Hyperbola', 'If', 'Integral', 'Intersect', 'Last', 'Length',
  'Limit', 'Line', 'Locus', 'Map', 'Midpoint', 'NSolve', 'Parabola',
  'ParallelLine', 'Perimeter', 'PerpendicularBisector', 'PerpendicularLine',
  'Point', 'Polygon', 'Polyline', 'Product', 'Radius', 'Random', 'Ray',
  'Reflect', 'Rotate', 'Segment', 'Sequence', 'Simplify', 'Slider', 'Solve',
  'Sort', 'Sum', 'Table', 'Take', 'Tangent', 'Text', 'Translate', 'Vector',
  'Zip',
]);
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
export interface Request {
  protocolVersion: 2; prompt: string; locale: string; outputDir: string;
  base?: { path: string; sha256: string };
  clarifications?: { question: string; answer: string }[];
  plan: {
    program: Step[];
    edits?: Edit[];
    requirements: { id: string; source: string; checks: Check[] }[];
    styles?: { object: string; properties: Style }[];
    interactions: Interaction[];
    view?: { xMin: number; xMax: number; yMin: number; yMax: number };
    display?: 'graphics' | 'algebra';
  };
}

function record(value: unknown, keys: string[]): Record<string, any> {
  assert(value && typeof value === 'object' && !Array.isArray(value), 'Expected an object');
  assert(Object.keys(value).every(key => keys.includes(key)), `Unknown field in ${JSON.stringify(value).slice(0, 160)}`);
  return value as Record<string, any>;
}
function text(value: unknown, max = 2048): asserts value is string {
  assert(typeof value === 'string' && value.trim().length > 0 && value.length <= max, 'Invalid text');
}
function identifier(value: unknown): asserts value is string {
  assert(typeof value === 'string' && value.length <= 32 && /^[A-Za-z][A-Za-z0-9_]*(?:\{[A-Za-z0-9]+\})?$/.test(value)
    && !['e', 'i', 'x', 'y', 'z', 'pi'].includes(value) && !value.startsWith('GgbProbe'), 'Invalid or reserved object identifier');
}
function finite(value: unknown, max = limits.coordinate): asserts value is number {
  assert(typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= max, 'Invalid finite number');
}
function array(value: unknown, min: number, max: number): asserts value is any[] {
  assert(Array.isArray(value) && value.length >= min && value.length <= max, 'Invalid array length');
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
      'Expected boolean, number or nested list');
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

/** Base names come from the file, so they follow GeoGebra label syntax. */
function baseName(value: unknown): asserts value is string {
  assert(typeof value === 'string' && value.length > 0 && value.length <= 64
    && /^[A-Za-z][A-Za-z0-9_']*(?:\{[A-Za-z0-9,]+\})?$/.test(value),
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

/** Check subjects may also be base labels such as `A'` or `B_{1}`. */
function subject(value: unknown): asserts value is string {
  if (typeof value === 'string' && value.length <= 64
    && /^[A-Za-z][A-Za-z0-9_']*(?:\{[A-Za-z0-9,]+\})?$/.test(value)) return;
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

/** Validate the complete envelope before starting any browser or writing output. */
export function parseRequest(value: unknown): Request {
  const r = record(value, ['protocolVersion', 'prompt', 'locale', 'outputDir',
    'clarifications', 'plan', 'base']);
  assert.equal(r.protocolVersion, 2, 'Unsupported request protocol; regenerate with protocolVersion 2');
  text(r.prompt, limits.promptChars); text(r.locale, 32); text(r.outputDir);
  const base = 'base' in r ? baseInput(r.base) : undefined;
  const sources = [r.prompt];
  if ('clarifications' in r) {
    array(r.clarifications, 0, 20);
    for (const input of r.clarifications) {
      const c = record(input, ['question', 'answer']); text(c.question); text(c.answer);
      sources.push(c.question, c.answer);
    }
  }
  const p = record(r.plan, ['program', 'requirements', 'styles', 'interactions',
    'view', 'display', 'edits']);
  if ('display' in p) assert(['graphics', 'algebra'].includes(p.display), 'Invalid display');
  if (base) {
    // A base and a program are two different modes; mixing them would let a
    // request rebuild the figure while claiming to edit it.
    assert(!('program' in p) || p.program.length === 0,
      'An edit request declares edits, not a program');
    assert(!('styles' in p), 'Express edit presentation through edits');
    assert(!('view' in p), 'The base keeps its own view; view edits are unsupported');
    array(p.edits, 1, limits.steps);
    const targets = new Set<string>();
    for (const input of p.edits) {
      const edit = record(input, ['object', 'properties']);
      baseName(edit.object);
      assert(!targets.has(edit.object), 'Duplicate edit target');
      targets.add(edit.object);
      editStyle(edit.properties);
    }
  } else {
    assert(!('edits' in p), 'A creation request declares a program, not edits');
    array(p.program, 1, limits.steps);
  }
  for (const input of p.program ?? []) {
    const s = record(input, input?.op === 'native' ? ['id', 'op', 'source', 'mode', 'outputs', 'initial'] : input?.op === 'freePoint' ? ['id', 'op', 'x', 'y'] : ['id', 'op', 'name', 'args']);
    identifier(s.id);
    assert(!reservedNames.has(s.id), `Reserved GeoGebra name: ${s.id}; rename the object`);
    if (s.op === 'native') {
      mathSource(s.source); assert(['algebra', 'cas'].includes(s.mode), 'Invalid native mode');
      if ('outputs' in s) {
        array(s.outputs, 1, 16);
        s.outputs.forEach(identifier);
        for (const output of s.outputs) {
          assert(!reservedNames.has(output), `Reserved GeoGebra name: ${output}; rename the object`);
        }
        assert(s.outputs.includes(s.id), 'Outputs must include step ID');
      }
      if ('initial' in s) { array(s.initial, 2, 2); s.initial.forEach((n: unknown) => finite(n)); }
      if (s.mode === 'cas') assert(!s.outputs || s.outputs.length === 1, 'CAS materializes one named result');
    } else if (s.op === 'freePoint') { finite(s.x); finite(s.y); }
    else {
      assert.equal(s.op, 'command', 'Unsupported operation');
      if (typeof s.name !== 'string' || !Object.hasOwn(commands, s.name)) throw new ToolError('unsupported_operation', 'Unsupported command');
      array(s.args, 2, 16);
      for (const arg of s.args) {
        if (typeof arg === 'number') finite(arg);
        else identifier(record(arg, ['ref']).ref);
      }
    }
  }
  array(p.requirements, 1, limits.requirements);
  const ids = new Set<string>();
  let count = 0;
  for (const input of p.requirements) {
    const r = record(input, ['id', 'source', 'checks']);
    identifier(r.id); assert(!ids.has(r.id), 'Duplicate requirement ID'); ids.add(r.id);
    text(r.source, limits.promptChars);
    assert(sources.some(source => source.includes(r.source)), 'Requirement source is not in the input');
    array(r.checks, 1, limits.checks);
    for (const input of r.checks) {
      const c = record(input, ['kind', 'subjects', 'scope', 'value', 'coordinates', 'properties', 'objectType', 'expression', 'expected', 'mode', 'assumptions']);
      if (typeof c.kind !== 'string' || !Object.hasOwn(predicates, c.kind)) throw new ToolError('unsupported_operation', 'Unsupported verification method');
      const spec = predicates[c.kind]!;
      array(c.subjects, spec.types.length, spec.variadic ? 16 : spec.types.length);
      c.subjects.forEach(subject);
      assert(['initial', 'sampled'].includes(c.scope), 'Check scope must be initial or sampled');
      if (c.kind === 'expression') {
        expressionCheck(c, r.id, r.checks.indexOf(input), sources);
      } else for (const key of ['expression', 'expected', 'mode', 'assumptions']) assert(!(key in c), 'Unexpected expression field');
      for (const key of ['value', 'coordinates', 'properties', 'objectType']) assert((key in c) === (spec.extra === key), `Unexpected or missing ${key}`);
      if (spec.extra === 'value') { finite(c.value); assert(c.value >= 0); }
      if (spec.extra === 'coordinates') { array(c.coordinates, 2, 2); c.coordinates.forEach((n: unknown) => finite(n)); }
      if (spec.extra === 'properties') style(c.properties);
      if (spec.extra === 'objectType') text(c.objectType, 64);
      count++;
    }
  }
  assert(count <= limits.checks, 'Too many checks');
  if ('styles' in p) {
    array(p.styles, 0, limits.steps);
    const targets = new Set<string>();
    for (const input of p.styles) {
      const s = record(input, ['object', 'properties']); identifier(s.object); style(s.properties);
      assert(!targets.has(s.object), 'Duplicate style target'); targets.add(s.object);
    }
  }
  array(p.interactions, 0, limits.samples);
  assert(!base || p.interactions.length === 0,
    'Edit requests take no interaction samples yet');
  const points = new Set<string>();
  for (const input of p.interactions) {
    const sample = record(input, input && 'parameter' in input ? ['parameter', 'value'] : ['point', 'dx', 'dy']);
    const id = sample.parameter ?? sample.point; identifier(id);
    if ('parameter' in sample) finite(sample.value);
    else { finite(sample.dx, 120); finite(sample.dy, 120); assert(Math.hypot(sample.dx, sample.dy) >= 20, 'Drag sample is too small'); }
    const key = 'parameter' in sample ? `${id}:${sample.value}` : id;
    assert(!points.has(key), 'Duplicate interaction sample'); points.add(key);
  }
  if ('view' in p) {
    const v = record(p.view, ['xMin', 'xMax', 'yMin', 'yMax']);
    Object.values(v).forEach(n => finite(n, limits.coordinate * 2));
    for (const key of ['xMin', 'xMax', 'yMin', 'yMax']) finite(v[key], limits.coordinate * 2);
    assert(v.xMax > v.xMin && v.yMax > v.yMin, 'Invalid view bounds');
  }
  // Creation requests always carry a list; edit requests carry none.
  const request = structuredClone(value) as Request;
  request.plan.program = request.plan.program ?? [];
  if (base) request.base = base;
  return request;
}

// Mathematical syntax belongs to GeoGebra. This scan only restricts host/script
// effects; browser isolation and post-execution object/material audits also apply.
const effects = new Set(('Execute Repeat Delete Rename SetValue SetCoords SetFixed SetColor SetCaption SetVisibleInView SetConditionToShowObject SetDynamicColor SetFilling SetLayer SetLineStyle SetLineThickness SetPointSize SetPointStyle SetTrace SetLabelMode ShowLabel ShowAxes ShowGrid SetAxesRatio SetBackgroundColor SetPerspective SetActiveView SetConstructionStep SetSeed SetSpinSpeed StartAnimation StartRecord RunClickScript RunUpdateScript ExportImage Download InsertImage Image Turtle Button Checkbox InputBox PlaySound ReadText Pan ZoomIn ZoomOut CenterView SelectObjects CopyFreeObject AttachCopyToView ParseToFunction ParseToNumber UpdateConstruction JavaScript RunJavaScript').toLowerCase().split(' '));
export function mathTokens(source: string): string[] {
  return (source.replace(/"(?:\\.|[^"\\])*"/g, ' ').match(/[A-Za-z][A-Za-z0-9_]*(?:\{[A-Za-z0-9]+\})?/g) ?? []);
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
