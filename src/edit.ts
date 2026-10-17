/**
 * @fileoverview Pure rules for attribute edits on an existing construction.
 *
 * The rules consume object types as data, so `check` (types from the archive
 * XML) and `build` (types from live facts) apply the same policy and the same
 * preservation allow-list.
 */
import { ToolError, type Edit } from './schema.js';

// Filling paints a closed region only. Other objects accept the call and then
// render nothing, which would pass a naive read-back.
export const fillable: ReadonlySet<string> = new Set([
  'circle', 'conic', 'ellipse', 'parabola', 'hyperbola', 'polygon', 'sector',
  'arc', 'inequality',
]);
// Stroke properties need an object that draws a path.
export const outlined: ReadonlySet<string> = new Set([
  'line', 'segment', 'ray', 'vector', 'polyline', 'polygon', 'circle',
  'conic', 'ellipse', 'parabola', 'hyperbola', 'arc', 'sector', 'locus',
  'inequality',
]);

/** Reject unknown targets and properties that cannot show on that type. */
export function validateTargets(
  edits: Edit[], types: ReadonlyMap<string, string>,
): void {
  for (const { object, properties } of edits) {
    const type = types.get(object);
    if (!type) {
      throw new ToolError('unknown_edit_target',
        `Unknown base object: ${object}`);
    }
    if (properties.filling !== undefined && !fillable.has(type)) {
      throw new ToolError('invalid_edit',
        `Filling needs a fillable object: ${object} (${type})`);
    }
    const stroke = properties.lineThickness !== undefined ||
      properties.lineStyle !== undefined;
    if (stroke && !outlined.has(type)) {
      throw new ToolError('invalid_edit',
        `Line style needs an outline object: ${object} (${type})`);
    }
  }
}

/** Declared object-field pairs; anything else is an unintended change. */
export function editFields(edits: Edit[]): Set<string> {
  const fields = new Set<string>();
  for (const { object, properties } of edits) {
    for (const field of Object.keys(properties)) {
      fields.add(`${object}\u0000${field}`);
    }
  }
  return fields;
}

export interface Difference {
  object: string; field: string; expected: unknown; actual: unknown;
}
export interface EditEffect {
  object: string; field: string; before: unknown; after: unknown;
}

function matches(field: string, actual: unknown, requested: unknown): boolean {
  // GeoGebra reports colors in upper case and fillings as floats.
  if (field === 'color') {
    return typeof actual === 'string' &&
      actual.toUpperCase() === String(requested).toUpperCase();
  }
  if (field === 'filling') {
    return typeof actual === 'number' &&
      Math.abs(actual - Number(requested)) <= 1e-8;
  }
  return actual === requested;
}

/** Identifier tokens of a native definition string, ignoring quoted text. */
export function commandTokens(source: string): string[] {
  return source.replace(/"(?:\\.|[^"\\])*"/g, ' ')
    .match(/[A-Za-z][A-Za-z0-9_]*/g) ?? [];
}

/** A dependency edge: `name` reads the objects listed in `inputs`. */
export interface FactLink { name: string; inputs: readonly string[]; }

/** Transitive objects that depend on `targets`, excluding the targets. */
export function dependents(
  links: FactLink[], targets: readonly string[],
): Set<string> {
  const found = new Set<string>();
  const queue = [...targets];
  while (queue.length) {
    const current = queue.shift()!;
    for (const link of links) {
      if (link.name === current || found.has(link.name) ||
        targets.includes(link.name) || !link.inputs.includes(current)) continue;
      found.add(link.name);
      queue.push(link.name);
    }
  }
  return found;
}

/**
 * Changes outside the declared pairs mean the edit touched the figure.
 *
 * GeoGebra copies a polygon's color and stroke to its edge objects, so a
 * dependent may change too. That propagation is accepted only when the
 * dependent really reads the edited object and takes the requested value;
 * any other dependent change, or any unrelated change, is still a violation.
 */
export function diffViolations(
  edits: Edit[], differences: Difference[], links: FactLink[] = [],
): Difference[] {
  const allowed = editFields(edits);
  const closure = new Map(edits.map(edit =>
    [edit.object, dependents(links, [edit.object])] as const));
  const propagated = (difference: Difference) => edits.some(({ object,
    properties }) => object !== difference.object &&
    Object.hasOwn(properties, difference.field) &&
    closure.get(object)?.has(difference.object) === true &&
    matches(difference.field, difference.actual,
      (properties as Record<string, unknown>)[difference.field]));
  return differences.filter(difference =>
    !allowed.has(`${difference.object}\u0000${difference.field}`) &&
    !propagated(difference));
}

/** Every declared field must be observable, not merely accepted. */
export function requireEffects(
  edits: Edit[], effects: EditEffect[],
): void {
  const missing: unknown[] = [];
  for (const { object, properties } of edits) {
    for (const [field, requested] of Object.entries(properties)) {
      const effect = effects.find(item =>
        item.object === object && item.field === field);
      if (!effect || !matches(field, effect.after, requested)) {
        missing.push({
          object, field, requested, observed: effect?.after ?? null,
        });
      }
    }
  }
  if (missing.length) {
    throw new ToolError('edit_no_effect',
      'Edit had no observed effect', missing);
  }
}
