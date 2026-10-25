/** @fileoverview Bounded native repair guidance, separate from execution. */
import {commandCall} from './compile.js';

const PRESERVE_PLAN = '; preserve source, IDs, dependencies, requirements, '
  + 'checks and interactions; do not replace required objects with outlines';

/** No source rewriting, retries, quota changes or verification decisions. */
export function executionFailureHint(failure: {
  message: string; source: string;
  actual?: {rawLabels?: string | null};
}): string {
  const call = commandCall(failure.source);
  if (/^Incomplete native outputs:/u.test(failure.message)) {
    const hint = '; first repair this step outputs to include all actual '
      + 'returned labels' + PRESERVE_PLAN;
    return call?.name === 'Polygon' && call.args.length >= 3
      ? hint + '; positional Polygon creates extra outputs; '
        + 'Polygon({...}) is an alternative for a fixed-vertex face-only output'
      : hint;
  }
  if (/^Execution failed or output undefined:/u.test(failure.message)
    && failure.actual?.rawLabels === null && call?.name === 'Round') {
    return '; built-in rounding uses lowercase round(x[, digits]); '
      + 'verify unrounded residuals and area sums; round only display copies';
  }
  return '';
}
