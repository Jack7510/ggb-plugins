/** @fileoverview Resolves engine-owned output groups without rewriting requests. */
import assert from 'node:assert/strict';
import {validateNewObjectIdentifier} from './names.js';
import {ToolError, type Request} from './schema.js';

interface OutputFact {
  name: string; defined: boolean; independent: boolean;
  nativeDefinition?: {name: string; args: string[]} | null;
  nativeOutputs?: string[];
}
type Program = Request['plan']['program'];

/** Output order is incidental; identities and membership are exact. */
function sameNames(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && new Set(a).size === a.length
    && a.every(name => b.includes(name));
}

/** A sibling must be owned by the same observed native algorithm. */
function requireGroup(id: string, names: string[],
  facts: ReadonlyMap<string, OutputFact>): void {
  const primary = facts.get(id);
  if (!primary?.nativeDefinition || !Array.isArray(names) ||
    !names.every(name => typeof name === 'string') || !names.includes(id) ||
    names.length > 16 || new Set(names).size !== names.length) {
    throw new ToolError('execution_failed',
      'Unverified native output group: ' + id);
  }
  for (const name of names) {
    validateNewObjectIdentifier(name);
    const fact = facts.get(name);
    if (!fact?.defined || !Array.isArray(fact.nativeOutputs) ||
      !sameNames(fact.nativeOutputs, names) ||
      JSON.stringify(fact.nativeDefinition) !==
        JSON.stringify(primary.nativeDefinition)) {
      throw new ToolError('execution_failed',
        'Unverified native output ownership: ' + name);
    }
  }
}

/** Omission discovers siblings; explicit declarations remain complete and exact. */
export function resolveProgramOutputs(program: Program,
  objects: readonly OutputFact[],
  baseNames: ReadonlySet<string> = new Set()): Map<string, string[]> {
  const facts = new Map(objects.map(fact => [fact.name, fact]));
  assert(facts.size === objects.length, 'Duplicate observed object');
  const owners = new Map(program.flatMap(step =>
    (step.op === 'native' ? step.outputs ?? [step.id] : [step.id])
      .map(name => [name, step.id] as const)));
  const resolved = new Map<string, string[]>();
  for (const step of program) {
    const declared = step.op === 'native' ? step.outputs ?? [step.id]
      : [step.id];
    const group = step.op === 'native' && step.mode === 'algebra'
      ? facts.get(step.id)?.nativeOutputs : undefined;
    const automatic = step.op === 'native' && step.mode === 'algebra'
      && step.outputs === undefined;
    if (group !== undefined) {
      requireGroup(step.id, group, facts);
      if (!automatic && !sameNames(declared, group)) {
        throw new ToolError('execution_failed',
          'Incomplete native outputs: ' + step.id);
      }
    }
    const names = automatic && group ? group : declared;
    for (const name of names) {
      if (baseNames.has(name) ||
        owners.has(name) && owners.get(name) !== step.id) {
        throw new ToolError('execution_failed',
          'Native output name collision: ' + name);
      }
      if (automatic && name !== step.id && facts.get(name)?.independent) {
        throw new ToolError('execution_failed',
          'Undeclared independent output: ' + name);
      }
      owners.set(name, step.id);
    }
    resolved.set(step.id, [...names]);
  }
  return resolved;
}

/** Includes verified automatic additions in the existing preservation gate. */
export function programOutputNames(program: Program,
  objects: readonly OutputFact[],
  baseNames?: ReadonlySet<string>): Set<string> {
  return new Set([...resolveProgramOutputs(program, objects, baseNames)
    .values()].flat());
}

/** Dragging, parameter changes and reload cannot change output identities. */
export function requireStableOutputs(program: Program,
  before: readonly OutputFact[], after: readonly OutputFact[]): void {
  const expected = resolveProgramOutputs(program, before);
  const actual = resolveProgramOutputs(program, after);
  for (const [id, names] of expected) {
    if (!sameNames(names, actual.get(id) ?? [])) {
      throw new ToolError('verification_failed',
        'Native output group changed: ' + id);
    }
  }
}
