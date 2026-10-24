/** @fileoverview Bounded failure facts without changing verification. */
import type {Snapshot} from './browser.js';
type Fact = Snapshot[number];
type Fields = Record<string, unknown>;

function printable(value: unknown): string {
  if (value === undefined || value === null) return 'unknown';
  return (JSON.stringify(value) ?? 'unknown').slice(0, 80);
}

/** Expected and actual values remain separate from the complete raw objects. */
export function verificationFeedback(method: string, fact: Fact | undefined,
  expected: Fields, objects: (Fact | null)[]): Fields {
  const actual: Fields = {defined: fact?.defined ?? null,
    objectType: fact?.type ?? null, visible: fact?.visible ?? null};
  for (const key of Object.keys(expected)) {
    const field = key === 'objectType' ? 'type' : key;
    actual[key] = fact ? (fact as unknown as Fields)[field] ?? null : null;
  }
  const differences = Object.keys(expected).filter(key => {
    if (key === 'caption' && fact?.caption === '' &&
      expected.caption === fact.name) return false;
    if (key === 'color') {
      return String(expected[key]).toUpperCase() !== actual[key];
    }
    if (key === 'filling' && typeof actual[key] === 'number' &&
      typeof expected[key] === 'number') {
      return Math.abs(actual[key] - expected[key]) > 1e-8;
    }
    return expected[key] !== actual[key];
  });
  const detail = differences.slice(0, 3).map(key =>
    `${key} expected ${printable(expected[key])}; `
      + `actual ${printable(actual[key])}`);
  if (fact?.defined !== true) {
    detail.unshift(`defined=${printable(actual.defined)}`);
  }
  if (fact?.type === 'numeric' && differences.includes('labelVisible')) {
    detail.push(`visible=${fact.visible}`);
  }
  return {objects, expected, actual,
    message: `${method}: ${detail.join('; ') || 'expected properties not met'}`
      .slice(0, 256)};
}
