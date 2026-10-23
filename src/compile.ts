/** @fileoverview Compiles requests and conservatively validates known types. */
import assert from 'node:assert/strict';
import {
  commands, predicates, type Edit, type Request, type Step, type Update,
} from './schema.js';
import { outlined } from './edit.js';

/** Base labels and types learned from the archive or from live facts. */
export interface BaseFacts {
  labels: ReadonlySet<string>;
  types: ReadonlyMap<string, string>;
}

export interface Compiled {
  mode: 'create' | 'edit' | 'modify'; edits: Edit[];
  updates: Update[];
  program: { step: Step; type: string; command: string; mode: 'algebra' | 'cas'; outputs: string[]; initial?: [number, number] }[];
  view: Request['plan']['view']; styles: NonNullable<Request['plan']['styles']>;
  native: boolean; display: 'graphics' | 'algebra';
}

const matches = (type: string, expected: string) => expected === 'any' || expected.split('|').includes(type);

/** Conservative command-to-output types; unknown native commands stay untyped. */
const NATIVE_OUTPUT_TYPES: Readonly<Record<string, string>> = {
  Segment: 'segment', Line: 'line', Ray: 'ray', Vector: 'vector',
  PerpendicularBisector: 'line', Midpoint: 'point', Point: 'point',
  Focus: 'point', Directrix: 'line', Circle: 'circle',
  Ellipse: 'ellipse', Hyperbola: 'hyperbola', Parabola: 'parabola',
  Conic: 'conic', Polygon: 'polygon', Slider: 'numeric',
};
/** A type is certain only for one algebra output and one complete call. */
function nativeOutputType(item: Compiled['program'][number]):
    string | undefined {
  const {step, command, mode, outputs} = item;
  if (mode !== 'algebra' || outputs.length !== 1 ||
    outputs[0] !== step.id) return undefined;
  const match = /^\s*([^=:]+)[=:]\s*([A-Za-z][A-Za-z0-9]*)\s*[\[(]/u
    .exec(command);
  if (!match || match[1]?.trim() !== step.id ||
    !completeCall(command.slice(match[0].length - 1).trim())) return undefined;
  const name = match[2]!;
  return Object.hasOwn(NATIVE_OUTPUT_TYPES, name)
    ? NATIVE_OUTPUT_TYPES[name] : undefined;
}

/** Match the outer call, ignoring quoted delimiters and escaped quotes. */
function completeCall(source: string): boolean {
  const stack: string[] = [];
  let quoted = false;
  let escaped = false;
  const closing: Record<string, string> = {'(': ')', '[': ']', '{': '}'};
  for (let index = 0; index < source.length; index++) {
    const char = source[index]!;
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (Object.hasOwn(closing, char)) stack.push(closing[char]!);
    else if (')]}'.includes(char)) {
      if (stack.pop() !== char) return false;
      if (stack.length === 0) return index === source.length - 1;
    }
  }
  return false;
}

/** Share known pointOn types across creation and additions to a base. */
function validateNativePointOn(request: Request,
    program: Compiled['program'], base?: ReadonlyMap<string, string>): void {
  const known = new Map(base);
  for (const item of program) {
    const type = nativeOutputType(item);
    if (type !== undefined) known.set(item.step.id, type);
  }
  for (const requirement of request.plan.requirements) {
    for (const check of requirement.checks) {
      if (check.kind !== 'pointOn') continue;
      check.subjects.forEach((id, index) => {
        const type = known.get(id);
        const expected = predicates.pointOn!.types[index]!;
        assert(type === undefined || matches(type, expected),
          `Invalid pointOn subject: ${id} (${type}, expected ${expected})`);
      });
    }
  }
}

// GeoGebra treats JavaScript's `1e-7` as an expression involving Euler's e.
// Expand the shortest round-trippable JS representation without rounding it.
function numberLiteral(value: number): string {
  const [coefficient, exponent] = String(value).split('e');
  if (exponent === undefined) return coefficient!;
  const sign = value < 0 ? '-' : '';
  const [integer, fraction = ''] = coefficient!.replace('-', '').split('.');
  const digits = integer! + fraction, point = integer!.length + Number(exponent);
  return sign + (point <= 0 ? '0.' + '0'.repeat(-point) + digits
    : point >= digits.length ? digits + '0'.repeat(point - digits.length)
    : digits.slice(0, point) + '.' + digits.slice(point));
}

/** A base request that adds objects, styles them, or updates values. */
function compileModify(request: Request, base?: BaseFacts): Compiled {
  assert(request.plan.interactions.length === 0,
    'Base modifications take no interaction samples yet');
  const program = request.plan.program.map(step => {
    assert(step.op === 'native',
      'Base modifications declare native program steps');
    return {
      step, type: 'native', command: step.source, mode: step.mode,
      outputs: step.outputs ?? [step.id], initial: step.initial,
    };
  });
  const outputs = program.flatMap(step => step.outputs);
  assert(new Set(outputs).size === outputs.length, 'Duplicate output object');
  const updates = request.plan.updates ?? [];
  const styles = request.plan.styles ?? [];
  if (base) validateModifyBase(base, outputs, updates, styles, request);
  validateNativePointOn(request, program, base?.types);
  return {
    mode: 'modify', edits: [], updates, program, view: undefined, styles,
    native: true, display: request.plan.display ?? 'graphics',
  };
}

type StyleList = NonNullable<Request['plan']['styles']>;

function validateModifyBase(
  base: BaseFacts, outputs: string[], updates: Update[], styles: StyleList,
  request: Request,
): void {
  for (const id of outputs) {
    assert(!base.labels.has(id), `Output collides with base object: ${id}`);
  }
  const known = new Set([...base.labels, ...outputs]);
  const has = (id: string) => assert(known.has(id),
    `Unknown object reference: ${id}`);
  for (const style of styles) has(style.object);
  validateModifyUpdates(base, updates);
  checkModifyStyleTypes(base, styles);
  validateModifyChecks(base, request, has);
}

function validateModifyUpdates(base: BaseFacts, updates: Update[]) {
  for (const update of updates) {
    assert(base.labels.has(update.object),
      `Update target is not a base object: ${update.object}`);
    const type = base.types.get(update.object);
    assert(update.value === undefined || type === 'numeric',
      `Value update needs a numeric base object: ${update.object}`);
    assert(update.coords === undefined || type === 'point',
      `Coordinate update needs a point base object: ${update.object}`);
  }
}

function checkModifyStyleTypes(base: BaseFacts, styles: StyleList) {
  for (const style of styles) {
    if (!base.labels.has(style.object)
      || !styleNeedsOutline(style.properties)) continue;
    const type = base.types.get(style.object);
    assert(type !== undefined && outlined.has(type),
      `Line style needs an outline object: ${style.object} (${type})`);
  }
}

function validateModifyChecks(
  base: BaseFacts, request: Request, has: (id: string) => void,
) {
  for (const requirement of request.plan.requirements) {
    for (const check of requirement.checks) {
      const spec = predicates[check.kind]!;
      check.subjects.forEach((id, index) => {
        has(id);
        // Other predicates defer new outputs to runtime; pointOn also uses
        // the shared conservative native check after base validation.
        if (!base.labels.has(id)) return;
        // The archive calls every conic `conic`; the live applet later
        // distinguishes circle, ellipse, parabola and hyperbola.
        const type = base.types.get(id) === 'conic' ? 'circle'
          : base.types.get(id)!;
        assert(matches(type,
          spec.types[Math.min(index, spec.types.length - 1)]!),
        `Invalid ${check.kind} subject: ${id}`);
      });
    }
  }
}

function styleNeedsOutline(properties?: {
  lineThickness?: unknown; lineStyle?: unknown;
}): boolean {
  return properties?.lineThickness !== undefined
    || properties?.lineStyle !== undefined;
}

export function compile(request: Request, base?: BaseFacts): Compiled {
  if (request.base) {
    if (request.plan.edits !== undefined) {
      const edits = request.plan.edits ?? [];
      assert(edits.length > 0, 'An edit request needs at least one edit');
      assert(request.plan.interactions.length === 0,
        'Edit requests take no interaction samples yet');
      return {
        mode: 'edit', edits, updates: [], program: [], view: undefined,
        styles: [], native: true,
        display: request.plan.display ?? 'graphics',
      };
    }
    return compileModify(request, base);
  }
  if (request.plan.program.some(step => step.op === 'native')) {
    if (request.plan.display === 'algebra') assert(request.plan.interactions.every(sample => 'parameter' in sample), 'Algebra-only view cannot provide canvas drag evidence');
    const program = request.plan.program.map(step => {
      assert(step.op === 'native', 'Use native statements consistently within a native program');
      return { step, type: 'native', command: step.source, mode: step.mode, outputs: step.outputs ?? [step.id], initial: step.initial };
    });
    const ids = program.flatMap(step => step.outputs);
    assert(new Set(ids).size === ids.length, 'Duplicate output object');
    const has = (id: string) => assert(ids.includes(id), `Unknown object reference: ${id}`);
    for (const style of request.plan.styles ?? []) has(style.object);
    for (const requirement of request.plan.requirements) for (const check of requirement.checks) check.subjects.forEach(has);
    request.plan.interactions.forEach(sample => has('point' in sample ? sample.point : sample.parameter));
    for (const requirement of request.plan.requirements) for (const check of requirement.checks) {
      if (check.scope === 'sampled') assert(request.plan.interactions.length > 0, 'Sampled checks need interaction evidence');

    }
    validateNativePointOn(request, program);
    return { mode: 'create', edits: [], updates: [], program, view: request.plan.view, styles: request.plan.styles ?? [], native: true, display: request.plan.display ?? 'graphics' };
  }
  const byId = new Map(request.plan.program.map(step => [step.id, step]));
  assert.equal(byId.size, request.plan.program.length, 'Duplicate object ID');
  const types = new Map<string, string>();
  const visiting = new Set<string>();
  const ordered: Step[] = [];
  function visit(id: string): string {
    if (types.has(id)) return types.get(id)!;
    const step = byId.get(id);
    assert(step, `Unknown reference: ${id}`);
    assert(step.op !== 'native');
    assert(!visiting.has(id), `Dependency cycle at ${id}`);
    visiting.add(id);
    let type = 'point';
    if (step.op === 'command') {
      const spec = commands[step.name]!;
      const args = step.args.map(arg => typeof arg === 'number' ? 'number' : visit(arg.ref));
      assert(spec.signatures.some(signature => args.length >= signature.length
        && (spec.variadic || args.length === signature.length)
        && args.every((type, i) => matches(type, signature[Math.min(i, signature.length - 1)]!))), `Invalid arguments for ${step.name}`);
      if (step.name === 'Circle' && typeof step.args[1] === 'number') assert(step.args[1] > 0, 'Radius must be positive');
      type = spec.output;
    }
    visiting.delete(id); types.set(id, type); ordered.push(step);
    return type;
  }
  request.plan.program.forEach(step => visit(step.id));
  for (const { object, properties } of request.plan.styles ?? []) {
    assert(types.has(object), `Unknown style target: ${object}`);
    if (properties.lineThickness !== undefined || properties.lineStyle !== undefined) {
      assert(['line', 'segment', 'circle', 'polygon'].includes(types.get(object)!), 'Line style requires a path');
    }
  }
  for (const requirement of request.plan.requirements) for (const check of requirement.checks) {
    const spec = predicates[check.kind]!;
    check.subjects.forEach((id, i) => {
      const expected = spec.types[Math.min(i, spec.types.length - 1)]!;
      const actual = types.get(id);
      assert(actual !== undefined && matches(actual, expected),
        `Invalid ${check.kind} subject: ${id} (${actual ?? 'unknown'}, `
        + `expected ${expected})`);
    });
  }
  for (const sample of request.plan.interactions) assert('point' in sample && byId.get(sample.point)?.op === 'freePoint', 'Only declared free points can be dragged');
  const rootCache = new Map<string, string[]>();
  const roots = (id: string): string[] => {
    if (!rootCache.has(id)) {
      const step = byId.get(id)!;
      assert(step.op !== 'native');
      rootCache.set(id, step.op === 'freePoint' ? [id] : [...new Set(step.args.flatMap(arg => typeof arg === 'number' ? [] : roots(arg.ref)))]);
    }
    return rootCache.get(id)!;
  };
  for (const requirement of request.plan.requirements) for (const check of requirement.checks) {
    if (check.scope === 'sampled' && !['exists', 'type', 'style', 'dependsOn'].includes(check.kind)) {
      assert(request.plan.interactions.some(sample => 'point' in sample && check.subjects.flatMap(roots).includes(sample.point)), 'Sampled relationship needs a relevant drag point');
    }
  }
  const program = ordered.map(step => {
    assert(step.op !== 'native');
    return { step, type: types.get(step.id)!, mode: 'algebra' as const, outputs: [step.id], command: step.op === 'freePoint'
      ? `${step.id}=(${numberLiteral(step.x)},${numberLiteral(step.y)})`
      : `${step.id}=${step.name}(${step.args.map(arg => typeof arg === 'number' ? numberLiteral(arg) : arg.ref).join(',')})` };
  });
  const points = ordered.filter(step => step.op === 'freePoint');
  assert(points.length > 0, 'A construction needs free points');
  return { mode: 'create', edits: [], updates: [], program, view: request.plan.view, styles: request.plan.styles ?? [], native: false, display: request.plan.display ?? 'graphics' };
}
