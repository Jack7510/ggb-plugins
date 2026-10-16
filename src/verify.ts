import assert from 'node:assert/strict';
import type { Snapshot, Observation } from './browser.js';
import { commands, ToolError, type Check, type Request, type Style, type MathValue } from './schema.js';

export const tolerance = 1e-8;
export type Status = 'passed' | 'failed' | 'unverified';
export interface Result { requirementId: string; checkId: string; subjects: string[]; method: string; scope: string; status: Status; evidence: unknown; }
type Fact = Snapshot[number];
const numeric = (error: number, scale = 1): Status => {
  if (!Number.isFinite(error) || !Number.isFinite(scale)) return 'unverified';
  const limit = tolerance * Math.max(1, Math.abs(scale));
  return Math.abs(error) <= limit ? 'passed' : Math.abs(error) > limit * 10 ? 'failed' : 'unverified';
};
const all = (statuses: Status[]): Status => statuses.includes('failed') ? 'failed' : statuses.includes('unverified') ? 'unverified' : 'passed';
const truth = (value: boolean): Status => value ? 'passed' : 'failed';
const mathStatus = (actual: MathValue | null | undefined, expected: MathValue): Status => {
  if (Array.isArray(expected)) return !Array.isArray(actual) ? 'unverified' : actual.length !== expected.length ? 'failed'
    : all(expected.map((value, i) => mathStatus(actual[i], value)));
  if (typeof actual !== typeof expected) return 'unverified';
  return typeof expected === 'number' ? numeric((actual as number) - expected, expected) : truth(actual === expected);
};

export function definition(fact: Fact) {
  // These objects already have complete numeric facts, compared with tolerance.
  // Other independent objects still need their native mathematical definition.
  if (fact.independent && ((fact.type === 'point' && fact.x !== null && fact.y !== null)
    || (['numeric', 'boolean'].includes(fact.type) && fact.value !== null) || fact.line || fact.circle)) return null;
  const match = /^([A-Za-z]+)\[(.*)\]$/.exec(fact.command);
  const native = fact.nativeDefinition ?? (match ? { name: match[1]!, args: match[2]!.split(',').map(s => s.trim()) } : null);
  if (!native) {
    if (fact.expression) return { expression: fact.expression };
    throw new ToolError('verification_unverified', `Missing mathematical definition: ${fact.name}`);
  }
  const name = Object.entries(commands).find(([key, spec]) => (spec.native ?? key) === native.name)?.[0] ?? native.name;
  const args = native.args.map(s => {
    if (/^[A-Za-z][A-Za-z0-9_]*(?:\{[A-Za-z0-9]+\})?$/.test(s)) return { ref: s };
    const n = Number(s); if (s && Number.isFinite(n)) return n;
    return { expression: s };
  });
  return { name, args };
}

/** Numeric observations use tolerance; identities, dependencies and properties remain exact. */
export function equivalent(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return numeric(a - b, Math.max(Math.abs(a), Math.abs(b))) === 'passed';
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => equivalent(v, b[i]));
  const x = a as Record<string, unknown>, y = b as typeof x;
  return equivalent(Object.keys(x).sort(), Object.keys(y).sort()) && Object.keys(x).every(key => equivalent(x[key], y[key]));
}
function normalizeSnapshots(facts: Snapshot) {
  // GeoGebra normalizes graphics-label flags on non-graphical algebra objects.
  // Explicit presentation requirements are still checked by verify.
  return facts.map(({ command, nativeDefinition, expression, valueString, labelStyle, labelVisible, ...fact }) => ({ ...fact,
    ...(['numeric', 'list', 'boolean'].includes(fact.type) ? {} : { labelStyle, labelVisible }),
    ...(['function', 'functionnvar', 'text'].includes(fact.type) || (fact.type === 'list' && fact.data === null) ? { valueString } : {}),
    definition: definition({ ...fact, command, nativeDefinition, expression, valueString, labelStyle, labelVisible }) })).sort((x, y) => x.name.localeCompare(y.name));
}

/** Field-level diagnostics use the same normalization and tolerance as the gate. */
export function snapshotDifferences(actual: Snapshot, expected: Snapshot) {
  const a = normalizeSnapshots(actual), b = normalizeSnapshots(expected);
  const differences: { object: string; field: string; expected: unknown; actual: unknown }[] = [];
  for (const name of new Set([...a, ...b].map(fact => fact.name))) {
    const before = b.filter(fact => fact.name === name), after = a.filter(fact => fact.name === name);
    if (before.length !== 1 || after.length !== 1) {
      differences.push({ object: name, field: 'objectCount', expected: before.length, actual: after.length });
      continue;
    }
    const old = before[0]! as Record<string, unknown>, fresh = after[0]! as Record<string, unknown>;
    for (const field of new Set([...Object.keys(old), ...Object.keys(fresh)])) {
      if (!equivalent(old[field], fresh[field])) differences.push({ object: name, field, expected: old[field], actual: fresh[field] });
    }
  }
  return differences;
}

export function compareSnapshots(a: Snapshot, b: Snapshot) {
  if (!equivalent(normalizeSnapshots(a), normalizeSnapshots(b))) {
    assert.fail(`Construction facts changed: ${JSON.stringify(snapshotDifferences(a, b))}`);
  }
}

function styleStatus(fact: Fact, properties: Style): Status {
  return truth((properties.caption === undefined || fact.labelStyle === 3) && Object.entries(properties).every(([key, value]) => (fact as unknown as Record<string, unknown>)[key] === (key === 'color' ? String(value).toUpperCase() : value)));
}

/** Pure verification: only actual observations and frozen requirements enter this function. */
export function verify(request: Request, objects: Snapshot, phase: 'initial' | 'sampled', observations: Observation[] = []) {
  const facts = new Map(objects.map(fact => [fact.name, fact]));
  const get = (id: string) => {
    const fact = facts.get(id);
    if (!fact?.defined) throw new Error(`Missing or undefined observation: ${id}`);
    return fact;
  };
  const point = (id: string) => {
    const p = get(id); if (p.type !== 'point' || p.x === null || p.y === null || !Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error(`Missing point coordinates: ${id}`);
    return { x: p.x, y: p.y };
  };
  const line = (id: string) => {
    const l = get(id).line;
    if (!l || l.length !== 3 || !l.every(n => typeof n === 'number' && Number.isFinite(n))) throw new Error(`Missing line coefficients: ${id}`);
    return l as [number, number, number];
  };
  const distance = (a: string, b: string) => { const p = point(a), q = point(b); return Math.hypot(p.x - q.x, p.y - q.y); };
  const depends = (id: string, target: string, visited = new Set<string>()): boolean => {
    if (visited.has(id)) return false;
    visited.add(id);
    const fact = get(id);
    if (fact.independent) return false;
    if (fact.referenceState === 'ambiguous') throw new Error(`Dependency references require semantic resolution: ${id}`);
    return (fact.inputs ?? []).some(ref => ref === target || depends(ref, target, visited));
  };
  const methods: Record<string, (check: Check) => Status> = {
    exists: c => truth(Boolean(facts.get(c.subjects[0]!)?.defined)),
    type: c => truth(get(c.subjects[0]!).type === c.objectType),
    coordinate: c => { const p = point(c.subjects[0]!); return all([numeric(p.x - c.coordinates![0], c.coordinates![0]), numeric(p.y - c.coordinates![1], c.coordinates![1])]); },
    midpoint: c => {
      const [id, a, b] = c.subjects as [string, string, string];
      const p = point(id), q = point(a), r = point(b);
      const state = all([numeric(p.x - (q.x + r.x) / 2, Math.max(Math.abs(q.x), Math.abs(r.x))), numeric(p.y - (q.y + r.y) / 2, Math.max(Math.abs(q.y), Math.abs(r.y)))]);
      return c.scope === 'sampled' ? all([state, truth(depends(id, a) && depends(id, b))]) : state;
    },
    pointOn: c => {
      const p = point(c.subjects[0]!), path = get(c.subjects[1]!);
      if (path.type === 'line') { const [a, b, d] = line(path.name); return numeric(a * p.x + b * p.y + d, Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(d))); }
      if (!path.circle) throw new Error('Missing circle parameters');
      return numeric(Math.hypot(p.x - path.circle.x, p.y - path.circle.y) - path.circle.radius, path.circle.radius);
    },
    center: c => {
      const circle = get(c.subjects[0]!).circle, p = point(c.subjects[1]!);
      return circle ? all([numeric(circle.x - p.x, p.x), numeric(circle.y - p.y, p.y)]) : 'unverified';
    },
    radius: c => { const circle = get(c.subjects[0]!).circle; return circle ? numeric(circle.radius - c.value!, c.value!) : 'unverified'; },
    parallel: c => { const [a, b] = line(c.subjects[0]!), [x, y] = line(c.subjects[1]!); return numeric(a * y - b * x); },
    perpendicular: c => { const [a, b] = line(c.subjects[0]!), [x, y] = line(c.subjects[1]!); return numeric(a * x + b * y); },
    equalLength: c => {
      const a = get(c.subjects[0]!).value, b = get(c.subjects[1]!).value;
      return a === null || b === null ? 'unverified' : numeric(a - b, Math.max(a, b));
    },
    distance: c => numeric(distance(c.subjects[0]!, c.subjects[1]!) - c.value!, c.value!),
    nonCollinear: c => {
      const [p, q, r] = c.subjects.map(point) as [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
      const cross = (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
      const scale = Math.hypot(q.x - p.x, q.y - p.y) * Math.hypot(r.x - p.x, r.y - p.y);
      return scale === 0 || cross === 0 ? 'failed' : Math.abs(cross) > tolerance * Math.max(1, scale) * 10 ? 'passed' : 'unverified';
    },
    dependsOn: c => truth(c.subjects.slice(1).every(id => depends(c.subjects[0]!, id))),
    style: c => styleStatus(get(c.subjects[0]!), c.properties!),
  };
  const results: Result[] = [];
  const add = (requirementId: string, index: number, subjects: string[], method: string, fn: () => Status, scope = phase) => {
    let status: Status, evidence: unknown;
    try { status = fn(); evidence = subjects.map(id => facts.get(id) ?? null); }
    catch (error) { status = 'unverified'; evidence = { message: error instanceof Error ? error.message : String(error) }; }
    results.push({ requirementId, checkId: `${requirementId}:${index}`, subjects, method, scope, status, evidence });
  };
  add('$canvas', 0, objects.map(o => o.name), 'objects_defined', () => truth(objects.length > 0 && objects.every(o => o.defined && (o.type !== 'numeric' || o.value !== null))));
  for (const step of request.plan.program) {
    const outputs = step.op === 'native' ? step.outputs ?? [step.id] : [step.id];
    add('$program:' + step.id, 0, outputs, 'construction', () => {
      if (step.op === 'native') return truth(outputs.every(id => Boolean(get(id))));
      const fact = get(step.id);
      if (step.op === 'freePoint') {
        const state = truth(fact.type === 'point' && fact.independent && fact.moveable);
        return phase === 'initial' ? all([state, numeric(point(step.id).x - step.x, step.x), numeric(point(step.id).y - step.y, step.y)]) : state;
      }
      return truth(fact.type === commands[step.name]!.output && equivalent(definition(fact), { name: step.name, args: step.args }));
    });
    for (const id of outputs) {
      const properties: Style = { ...(step.op === 'native' ? {} : { visible: true }), ...(facts.get(id)?.type === 'point' ? { labelVisible: true } : {}), ...request.plan.styles?.find(s => s.object === id)?.properties };
      add('$style:' + id, 0, [id], 'presentation', () => all([styleStatus(get(id), properties),
        get(id).type === 'point' ? truth(get(id).labelStyle === (properties.caption === undefined ? 0 : 3)) : 'passed']));
    }
  }
  for (const requirement of request.plan.requirements) requirement.checks.forEach((check, index) => {
    if (phase === 'initial' || check.scope === 'sampled') {
      const observation = observations.find(o => o.id === `${requirement.id}:${index}`);
      add(requirement.id, index, check.subjects, check.kind, () => {
        if (check.kind !== 'expression') return methods[check.kind]!(check);
        check.subjects.forEach(get);
        if (!observation?.defined || observation.error || observation.expression !== check.expression || observation.mode !== check.mode
          || !equivalent(observation.assumptions ?? [], check.assumptions ?? [])) return 'unverified';
        if (Array.isArray(check.expected)) return observation.type === 'list' ? mathStatus(observation.data, check.expected) : 'unverified';
        if (observation.value === null) return 'unverified';
        if (typeof check.expected === 'boolean') return observation.type === 'boolean' ? truth(observation.value === (check.expected ? 1 : 0)) : 'unverified';
        return observation.type === 'numeric' ? numeric(observation.value - check.expected!, check.expected!) : 'unverified';
      }, check.scope);
      if (check.kind === 'expression') results.at(-1)!.evidence = { observation: observation ?? null, objects: check.subjects.map(id => facts.get(id) ?? null) };
    }
  });
  return { status: all(results.map(r => r.status)), objects, results, observations };
}
export type Verification = ReturnType<typeof verify>;
