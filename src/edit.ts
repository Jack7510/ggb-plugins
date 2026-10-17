/**
 * @fileoverview Pure rules for attribute edits on an existing construction.
 *
 * The rules consume object types as data, so `check` (types from the archive
 * XML) and `build` (types from live facts) apply the same policy and the same
 * preservation allow-list.
 */
import type { ReferenceFact as FactLink } from './facts.js';
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
export interface UpdateEffect {
  object: string; field: 'value' | 'x' | 'y';
  before: unknown; after: unknown;
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

export { dependents } from './facts.js';
export type { ReferenceFact as FactLink } from './facts.js';

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
  const accepted = allowedStyleChanges(edits, differences, links);
  return differences.filter(difference =>
    !accepted.has(`${difference.object}\u0000${difference.field}`));
}

/** Declared style pairs plus presentation propagation, as difference keys. */
export function allowedStyleChanges(
  edits: Edit[], differences: Difference[], links: FactLink[] = [],
): Set<string> {
  const allowed = editFields(edits);
  const accepted = new Set<string>();
  for (const difference of differences) {
    const key = `${difference.object}\u0000${difference.field}`;
    if (allowed.has(key)) {
      accepted.add(key);
      continue;
    }
    const propagated = edits.some(({ object, properties }) =>
      object !== difference.object &&
      Object.hasOwn(properties, difference.field) &&
      links.some(link => link.name === difference.object
        && link.styleOwner === object
        && link.styleFields?.includes(difference.field)) &&
      matches(difference.field, difference.actual,
        (properties as Record<string, unknown>)[difference.field]));
    if (propagated) accepted.add(key);
  }
  return accepted;
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
