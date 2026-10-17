/**
 * @fileoverview Pure rules for construction changes on an existing figure.
 *
 * A modification may add declared objects, style base or new objects, and
 * update independent base values or coordinates. The preservation gate allows
 * exactly those changes, style propagation, and geometry recomputed from an
 * updated object. It never allows a deletion, a rename or an undeclared
 * addition.
 */
import { ToolError, type Style, type Update } from './schema.js';
import {
  allowedStyleChanges, dependents, type Difference, type FactLink,
  type UpdateEffect,
} from './edit.js';

export interface BaseFact {
  name: string; type: string; independent: boolean; moveable: boolean;
  fixed: boolean; slider: { min: number; max: number } | null;
}

function close(actual: unknown, requested: number): boolean {
  return typeof actual === 'number' && Number.isFinite(actual)
    && Math.abs(actual - requested) <= 1e-8 * Math.max(1, Math.abs(requested));
}

/** Numeric tolerance shared with delivery-time evidence checks. */
export function valueMatches(actual: unknown, requested: number): boolean {
  return close(actual, requested);
}

/** Declared object-field pairs for updates. */
export function updateFields(updates: Update[]): Set<string> {
  const fields = new Set<string>();
  for (const update of updates) {
    if (update.value !== undefined) fields.add(`${update.object}\u0000value`);
    if (update.coords !== undefined) {
      fields.add(`${update.object}\u0000x`);
      fields.add(`${update.object}\u0000y`);
    }
  }
  return fields;
}

/** Only independent base values and movable points accept updates. */
export function validateUpdates(
  updates: Update[], facts: ReadonlyMap<string, BaseFact>,
): void {
  for (const update of updates) {
    const fact = facts.get(update.object);
    if (!fact) {
      throw new ToolError('unknown_update_target',
        `Unknown base object: ${update.object}`);
    }
    if (!fact.independent) {
      throw new ToolError('invalid_update',
        `Update target is not independent: ${update.object}`);
    }
    if (fact.fixed) {
      throw new ToolError('invalid_update',
        `Update target is fixed: ${update.object}`);
    }
    if (update.value !== undefined) {
      if (fact.type !== 'numeric') {
        throw new ToolError('invalid_update',
          `Value update needs a numeric object: ${update.object}`);
      }
      if (fact.slider && (update.value < fact.slider.min
        || update.value > fact.slider.max)) {
        throw new ToolError('invalid_update',
          `Value is outside the slider range: ${update.object}`, {
            value: update.value, slider: fact.slider,
          });
      }
    }
    if (update.coords !== undefined) {
      if (fact.type !== 'point' || !fact.moveable) {
        throw new ToolError('invalid_update',
          `Coordinate update needs a movable point: ${update.object}`);
      }
    }
  }
}

/** Base styles keep presentation only; new objects may also be fixed. */
export function validateModifyStyles(
  styles: { object: string; properties: Style }[],
  baseLabels: ReadonlySet<string>,
): void {
  for (const style of styles) {
    if (baseLabels.has(style.object)
      && style.properties.fixed !== undefined) {
      throw new ToolError('invalid_style',
        `Fixed is not a base presentation edit: ${style.object}`);
    }
  }
}

/** Every declared update must reach the requested value. */
export function requireUpdateEffects(
  updates: Update[], effects: UpdateEffect[],
): void {
  const missing: unknown[] = [];
  for (const update of updates) {
    const expected: [UpdateEffect['field'], number][] =
      update.value !== undefined ? [['value', update.value]]
        : [['x', update.coords![0]], ['y', update.coords![1]]];
    for (const [field, value] of expected) {
      const effect = effects.find(item =>
        item.object === update.object && item.field === field);
      if (!effect || !close(effect.after, value)) {
        missing.push({
          object: update.object, field, requested: value,
          observed: effect?.after ?? null,
        });
      }
    }
  }
  if (missing.length) {
    throw new ToolError('update_no_effect',
      'Update had no observed effect', missing);
  }
}

const recomputedFields = new Set([
  'x', 'y', 'value', 'line', 'circle', 'conic', 'data', 'valueString',
]);

/**
 * Differences outside the declared additions, styles and updates.
 *
 * Added objects are accepted only when the program declares them. Base object
 * changes are accepted only for declared style/update fields, style
 * propagation, or geometry that transitively depends on an updated object.
 */
export function modifyViolations(input: {
  styles: { object: string; properties: Style }[];
  updates: Update[];
  differences: Difference[];
  links: FactLink[];
  declared: ReadonlySet<string>;
  baseLabels: ReadonlySet<string>;
}): Difference[] {
  const styleAccepted = allowedStyleChanges(
    input.styles, input.differences, input.links);
  const captions = new Set(input.styles
    .filter(style => style.properties.caption !== undefined)
    .map(style => style.object));
  const updated = new Set(input.updates.map(update => update.object));
  const recomputed = dependents(input.links, [...updated]);
  const updates = new Map(input.updates.map(update => [update.object, update]));
  return input.differences.filter(difference => {
    const key = `${difference.object}\u0000${difference.field}`;
    if (difference.field === 'objectCount') {
      // An addition is allowed only for a declared output; a removal or a
      // rename leaves the original label missing and is never allowed.
      return !(difference.expected === 0 && difference.actual === 1
        && input.declared.has(difference.object));
    }
    if (!input.baseLabels.has(difference.object)) {
      return !input.declared.has(difference.object);
    }
    if (styleAccepted.has(key)) return false;
    // A base object that becomes undefined is a broken figure, never a
    // legitimate recomputation.
    if (difference.field === 'defined' && difference.actual === false) {
      return true;
    }
    // A caption also sets label style 3; that paired change is declared.
    if (difference.field === 'labelStyle'
      && captions.has(difference.object) && difference.actual === 3) {
      return false;
    }
    const update = updates.get(difference.object);
    if (update) {
      if (difference.field === 'value' && update.value !== undefined
        && close(difference.actual, update.value)) return false;
      if (difference.field === 'x' && update.coords !== undefined
        && close(difference.actual, update.coords[0])) return false;
      if (difference.field === 'y' && update.coords !== undefined
        && close(difference.actual, update.coords[1])) return false;
    }
    if (recomputed.has(difference.object)
      && recomputedFields.has(difference.field)) return false;
    return true;
  });
}
