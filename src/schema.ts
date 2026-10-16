import assert from 'node:assert/strict';

export class ToolError extends Error {
  constructor(public code: string, message: string, public details?: unknown) { super(message); }
}

export const limits = { requestBytes: 128 * 1024, reportBytes: 16 * 1024 * 1024, promptChars: 12000, steps: 64, requirements: 64, checks: 256, samples: 12, coordinate: 10000, ggbBytes: 10 * 1024 * 1024 };
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
export interface Style { visible?: boolean; labelVisible?: boolean; color?: string; lineThickness?: number; lineStyle?: number; caption?: string; }
export type Argument = number | { ref: string };
export type Step = { id: string; op: 'freePoint'; x: number; y: number } | { id: string; op: 'command'; name: string; args: Argument[] };
export interface Check { kind: string; subjects: string[]; scope: 'initial' | 'sampled'; coordinates?: [number, number]; value?: number; properties?: Style; objectType?: string; }
export interface Request {
  protocolVersion: 1; prompt: string; locale: string; outputDir: string;
  clarifications?: { question: string; answer: string }[];
  plan: {
    program: Step[];
    requirements: { id: string; source: string; checks: Check[] }[];
    styles?: { object: string; properties: Style }[];
    interactions: { point: string; dx: number; dy: number }[];
    view?: { xMin: number; xMax: number; yMin: number; yMax: number };
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
  assert(typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(value)
    && !['e', 'i', 'x', 'y', 'z', 'pi'].includes(value), 'Invalid or reserved object identifier');
}
function finite(value: unknown, max = limits.coordinate): asserts value is number {
  assert(typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= max, 'Invalid finite number');
}
function array(value: unknown, min: number, max: number): asserts value is any[] {
  assert(Array.isArray(value) && value.length >= min && value.length <= max, 'Invalid array length');
}
function style(value: unknown) {
  const p = record(value, ['visible', 'labelVisible', 'color', 'lineThickness', 'lineStyle', 'caption']);
  assert(Object.keys(p).length > 0, 'Empty style');
  for (const key of ['visible', 'labelVisible']) if (key in p) assert(typeof p[key] === 'boolean', 'Invalid visibility');
  if ('color' in p) assert(typeof p.color === 'string' && /^#[0-9a-f]{6}$/i.test(p.color), 'Invalid color');
  if ('caption' in p) text(p.caption, 100);
  for (const [key, min, max] of [['lineThickness', 1, 13], ['lineStyle', 0, 4]] as const) {
    if (key in p) assert(Number.isInteger(p[key]) && p[key] >= min && p[key] <= max, `Invalid ${key}`);
  }
}

/** Validate the complete envelope before starting any browser or writing output. */
export function parseRequest(value: unknown): Request {
  const r = record(value, ['protocolVersion', 'prompt', 'locale', 'outputDir', 'clarifications', 'plan']);
  assert.equal(r.protocolVersion, 1, 'Unsupported request protocol');
  text(r.prompt, limits.promptChars); text(r.locale, 32); text(r.outputDir);
  const sources = [r.prompt];
  if ('clarifications' in r) {
    array(r.clarifications, 0, 20);
    for (const input of r.clarifications) {
      const c = record(input, ['question', 'answer']); text(c.question); text(c.answer);
      sources.push(c.question, c.answer);
    }
  }
  const p = record(r.plan, ['program', 'requirements', 'styles', 'interactions', 'view']);
  array(p.program, 1, limits.steps);
  for (const input of p.program) {
    const s = record(input, input?.op === 'freePoint' ? ['id', 'op', 'x', 'y'] : ['id', 'op', 'name', 'args']);
    identifier(s.id);
    if (s.op === 'freePoint') { finite(s.x); finite(s.y); }
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
      const c = record(input, ['kind', 'subjects', 'scope', 'value', 'coordinates', 'properties', 'objectType']);
      if (typeof c.kind !== 'string' || !Object.hasOwn(predicates, c.kind)) throw new ToolError('unsupported_operation', 'Unsupported verification method');
      const spec = predicates[c.kind]!;
      array(c.subjects, spec.types.length, spec.variadic ? 16 : spec.types.length);
      c.subjects.forEach(identifier);
      assert(['initial', 'sampled'].includes(c.scope), 'Check scope must be initial or sampled');
      for (const key of ['value', 'coordinates', 'properties', 'objectType']) assert((key in c) === (spec.extra === key), `Unexpected or missing ${key}`);
      if (spec.extra === 'value') { finite(c.value); assert(c.value >= 0); }
      if (spec.extra === 'coordinates') { array(c.coordinates, 2, 2); c.coordinates.forEach((n: unknown) => finite(n)); }
      if (spec.extra === 'properties') style(c.properties);
      if (spec.extra === 'objectType') assert(['point', 'line', 'segment', 'circle', 'polygon'].includes(c.objectType), 'Invalid object type');
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
  array(p.interactions, 1, limits.samples);
  const points = new Set<string>();
  for (const input of p.interactions) {
    const sample = record(input, ['point', 'dx', 'dy']); identifier(sample.point);
    finite(sample.dx, 120); finite(sample.dy, 120);
    assert(Math.hypot(sample.dx, sample.dy) >= 20, 'Drag sample is too small');
    assert(!points.has(sample.point), 'Duplicate interaction point'); points.add(sample.point);
  }
  if ('view' in p) {
    const v = record(p.view, ['xMin', 'xMax', 'yMin', 'yMax']);
    Object.values(v).forEach(n => finite(n, limits.coordinate * 2));
    for (const key of ['xMin', 'xMax', 'yMin', 'yMax']) finite(v[key], limits.coordinate * 2);
    assert(v.xMax > v.xMin && v.yMax > v.yMin, 'Invalid view bounds');
  }
  return structuredClone(value) as Request;
}
