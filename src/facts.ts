/**
 * @fileoverview Resolves native object identity, dependency certainty and
 * presentation ownership. Consumers never authorize changes from text guesses.
 */
import { ToolError, type Request } from './schema.js';

export interface NativeDefinition { name: string; args: string[] }
/** Slider metadata read from the applet; step is absent when the file has none. */
export interface SliderFact { min: number; max: number; step?: number }
export interface ReferenceFact {
  name: string; inputs: readonly string[];
  referenceState?: 'direct' | 'ambiguous';
  styleOwner?: string | null;
  styleFields?: readonly string[];
}
export interface ObjectMetadata {
  name: string; xmlType: string; expression: string | null;
  definition: NativeDefinition | null; outputs: string[];
  coords: number[] | null; matrix: number[] | null; fixed: boolean;
  slider: SliderFact | null;
}

/** A requested value must land on the slider's declared discrete step. */
export function isOnSliderStep(value: number, slider: SliderFact): boolean {
  if (slider.step === undefined) return true;
  const units = (value - slider.min) / slider.step;
  return Math.abs(units - Math.round(units))
    <= 1e-8 * Math.max(1, Math.abs(units));
}

/** Validates a complete engine removal graph before it can grant permission. */
export function dependencyFacts(names: readonly string[], removals: readonly {
  target: string; removed: readonly string[];
}[]): Map<string, string[]> {
  const known = new Set(names);
  if (removals.length !== names.length
    || new Set(removals.map(item => item.target)).size !== names.length
    || removals.some(item => !known.has(item.target)
      || !item.removed.includes(item.target)
      || item.removed.some(name => !known.has(name)))) {
    throw new ToolError('verification_unverified',
      'Incomplete native dependency evidence');
  }
  return new Map(names.map(name => [name, removals
    .filter(item => item.target !== name && item.removed.includes(name))
    .map(item => item.target)]));
}

/** Engine adapter: polygon output edges share only their owner's stroke. */
export function presentationOwner(metadata: ObjectMetadata,
  types: ReadonlyMap<string, string>): Pick<ReferenceFact,
    'styleOwner' | 'styleFields'> {
  const owner = metadata.outputs[0];
  const ownsStroke = metadata.definition?.name === 'Polygon'
    && owner !== metadata.name && owner !== undefined
    && types.get(owner) === 'polygon' && types.get(metadata.name) === 'segment';
  return {
    styleOwner: ownsStroke ? owner : null,
    styleFields: ownsStroke ? ['color', 'lineStyle', 'lineThickness'] : [],
  };
}

/** Only certain dependency edges enter an authorization closure. */
export function dependents(links: readonly ReferenceFact[],
  targets: readonly string[]): Set<string> {
  const found = new Set<string>();
  const queue = [...targets];
  while (queue.length) {
    const current = queue.shift();
    for (const link of links) {
      if (link.referenceState !== 'direct' || link.name === current
        || found.has(link.name) || targets.includes(link.name)
        || !link.inputs.includes(current ?? '')) continue;
      found.add(link.name);
      queue.push(link.name);
    }
  }
  return found;
}

/** Shares certainty semantics with update authorization and coverage. */
export function dependsOn(links: readonly ReferenceFact[], name: string,
  target: string, visited = new Set<string>()): boolean {
  if (visited.has(name)) return false;
  visited.add(name);
  const fact = links.find(link => link.name === name);
  if (!fact || fact.referenceState !== 'direct') {
    throw new ToolError('verification_unverified',
      `Dependency references require semantic resolution: ${name}`);
  }
  return fact.inputs.some(input => input === target
    || dependsOn(links, input, target, visited));
}

export interface InteractionFact extends ReferenceFact {
  type: string; moveable: boolean; fixed: boolean; independent: boolean;
  slider: SliderFact | null;
}

/** Capability, not an object name or predicate kind, defines controllability. */
function canInteract(fact: InteractionFact): boolean {
  if (typeof fact.type !== 'string' || typeof fact.moveable !== 'boolean'
    || typeof fact.fixed !== 'boolean' || typeof fact.independent !== 'boolean') {
    throw new ToolError('verification_unverified',
      `Missing interaction capability evidence: ${fact.name}`);
  }
  return fact.moveable && !fact.fixed && (fact.type === 'point'
    || (fact.type === 'numeric' && fact.independent && fact.slider !== null));
}

/** Every sampled mathematical relation needs a relevant declared input change. */
export function requireSampleCoverage(request: Request,
  facts: readonly InteractionFact[]): void {
  const controls = facts.filter(canInteract).map(fact => fact.name);
  const targets = request.plan.interactions.map(sample =>
    'point' in sample ? sample.point : sample.parameter);
  const structural = new Set(['exists', 'type', 'style', 'dependsOn']);
  for (const requirement of request.plan.requirements) {
    for (const [index, check] of requirement.checks.entries()) {
      if (check.scope !== 'sampled' || structural.has(check.kind)) continue;
      if (!relationCovered(controls, check.subjects, facts)) {
        if (requirement.purpose === 'interaction') {
          throw new ToolError('verification_failed',
            `No controllable input for ${requirement.id}:${index}`);
        }
        continue;
      }
      const covered = relationCovered(targets, check.subjects, facts);
      if (!covered) {
        throw new ToolError('verification_failed',
          `No relevant interaction for ${requirement.id}:${index}`);
      }
    }
  }
}

/** A certain witness wins; an unresolved branch alone cannot prove coverage. */
function relationCovered(targets: readonly string[], subjects: string[],
  facts: readonly ReferenceFact[]): boolean {
  let unresolved = false;
  for (const target of targets) {
    for (const name of subjects) {
      if (name === target) return true;
      try {
        if (dependsOn(facts, name, target)) return true;
      } catch (error) {
        if (!(error instanceof ToolError)
          || error.code !== 'verification_unverified') throw error;
        unresolved = true;
      }
    }
  }
  if (unresolved) {
    throw new ToolError('verification_unverified',
      'Sample coverage requires unresolved dependency references');
  }
  return false;
}
