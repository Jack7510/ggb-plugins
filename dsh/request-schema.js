/** @fileoverview Publishes the compact model-facing draft/check/build shapes. */
import {REQUEST_TEXT_BYTES, REQUEST_ARGUMENT_BYTES}
  from '../dist/src/draft-arguments.js';

const object = (properties, required = Object.keys(properties)) =>
  ({type: 'object', additionalProperties: false, properties, required});

/** The model submits one complete request body; the host supplies prompt and paths. */
export const draftToolSchema = object({
  requestText: {type: 'string', minLength: 1, maxLength: REQUEST_TEXT_BYTES,
    description: 'One complete JSON object containing plan and optional clarifications. '
      + 'Do not include prompt, locale, outputDir or base; the host owns them. '
      + 'Nest checks in plan.requirements[].checks; never use plan.checks. '
      + 'Include every program step, requirement, check, interaction and style. '
      + `All arguments including escaping and metadata must fit ${REQUEST_ARGUMENT_BYTES} UTF-8 bytes.`},
  locale: {type: 'string', minLength: 1, maxLength: 32,
    description: 'Working language; omitted repairs retain the saved locale.'},
  title: {type: 'string', maxLength: 60,
    description: 'Omitted repairs retain the saved title.'},
  transcription: {type: 'array', maxItems: 20,
    description: 'Required on the first save when an image is attached: complete mathematical problem text, including givens, equations, labels, constraints and question. Preserve ambiguity; no solution or invented conditions. Omit on repairs to retain it; a nonempty array replaces it.',
    items: {type: 'string', maxLength: 2_000}},
}, ['requestText']);
export const checkReferenceSchema = object({revision:
  {type: 'integer', minimum: 1}});
export const buildReferenceSchema = object({checkedRequestId: {type: 'string'}});
