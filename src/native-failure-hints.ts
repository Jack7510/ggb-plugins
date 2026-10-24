/** @fileoverview Bounded native repair guidance, separate from execution. */
import {commandCall} from './compile.js';

/** No source rewriting, retries, quota changes or verification decisions. */
export function executionFailureHint(failure: {
  message: string; source: string;
  actual?: {rawLabels?: string | null};
}): string {
  const call = commandCall(failure.source);
  if (/^Incomplete native outputs:/u.test(failure.message)
    && call?.name === 'Polygon' && call.args.length >= 3) {
    return '; positional Polygon creates extra outputs; declare all labels, '
      + 'or use Polygon({...}) for a fixed-vertex face-only output';
  }
  if (/^Execution failed or output undefined:/u.test(failure.message)
    && failure.actual?.rawLabels === null && call?.name === 'Round') {
    return '; built-in rounding uses lowercase round(x[, digits]); '
      + 'verify unrounded residuals and area sums; round only display copies';
  }
  return '';
}
