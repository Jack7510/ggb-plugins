import assert from 'node:assert/strict';
import { commands, predicates, type Request, type Step } from './schema.js';

export interface Compiled {
  program: { step: Step; type: string; command: string; mode: 'algebra' | 'cas'; outputs: string[]; initial?: [number, number] }[];
  view: Request['plan']['view']; styles: NonNullable<Request['plan']['styles']>;
  native: boolean; display: 'graphics' | 'algebra';
}

const matches = (type: string, expected: string) => expected === 'any' || expected.split('|').includes(type);

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

export function compile(request: Request): Compiled {
  if (request.plan.program.some(step => step.op === 'native')) {
    if (request.plan.display === 'algebra') assert(request.plan.interactions.length === 0, 'Algebra-only view cannot provide canvas drag evidence');
    const program = request.plan.program.map(step => {
      assert(step.op === 'native', 'Use native statements consistently within a native program');
      return { step, type: 'native', command: step.source, mode: step.mode, outputs: step.outputs ?? [step.id], initial: step.initial };
    });
    const ids = program.flatMap(step => step.outputs);
    assert(new Set(ids).size === ids.length, 'Duplicate output object');
    const has = (id: string) => assert(ids.includes(id), `Unknown object reference: ${id}`);
    for (const style of request.plan.styles ?? []) has(style.object);
    for (const requirement of request.plan.requirements) for (const check of requirement.checks) check.subjects.forEach(has);
    request.plan.interactions.forEach(sample => has(sample.point));
    for (const requirement of request.plan.requirements) for (const check of requirement.checks) {
      if (check.scope === 'sampled') assert(request.plan.interactions.length > 0, 'Sampled checks need interaction evidence');
    }
    return { program, view: request.plan.view, styles: request.plan.styles ?? [], native: true, display: request.plan.display ?? 'graphics' };
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
    check.subjects.forEach((id, i) => assert(types.has(id) && matches(types.get(id)!, spec.types[Math.min(i, spec.types.length - 1)]!), `Invalid ${check.kind} subject: ${id}`));
  }
  for (const sample of request.plan.interactions) assert(byId.get(sample.point)?.op === 'freePoint', 'Only declared free points can be dragged');
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
      assert(request.plan.interactions.some(sample => check.subjects.flatMap(roots).includes(sample.point)), 'Sampled relationship needs a relevant drag point');
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
  return { program, view: request.plan.view, styles: request.plan.styles ?? [], native: false, display: request.plan.display ?? 'graphics' };
}
