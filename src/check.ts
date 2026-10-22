/** @fileoverview Shared static preflight for CLI and host execution. */
import type {Request} from './schema.js';
import type {CheckData} from './execution-contract.js';
import {compile} from './compile.js';
import {loadBase} from './inspect.js';
import {validateTargets} from './edit.js';
import {verificationNotes} from './tautology.js';
import {validateModifyStyles} from './modify.js';

/** Static preflight: program shape, or base digest plus declared changes. */
export async function checkRequest(request: Request): Promise<CheckData> {
  if (!request.base) {
    compile(request);
    const warnings = verificationNotes(request.plan.requirements);
    return {
      validation: 'structural', mode: 'create',
      programSteps: request.plan.program.length,
      requirements: request.plan.requirements.length,
      samples: request.plan.interactions.length,
      ...(warnings.length ? { warnings } : {}),
    };
  }
  const { archive, summary } = await loadBase(request.base);
  const labels = new Set(summary.objects.map(object => object.name));
  const types = new Map(summary.objects.map(object =>
    [object.name, object.type]));
  const compiled = compile(request, { labels, types });
  if (compiled.mode === 'edit') {
    validateTargets(compiled.edits, types);
  } else {
    validateModifyStyles(compiled.styles, labels);
  }
  return {
    validation: 'structural',
    mode: compiled.mode,
    base: {
      sha256: archive.sha256, bytes: archive.bytes.length,
      version: summary.version, objects: summary.objects.length,
    },
    programSteps: compiled.program.length,
    edits: compiled.edits.length,
    updates: compiled.updates.length,
    styles: compiled.styles.length,
    requirements: request.plan.requirements.length, samples: 0,
  };
}
