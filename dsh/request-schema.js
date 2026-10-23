/** @fileoverview Publishes model-facing request shapes; runtime parsing stays authoritative. */
import {DRAFT_SECTIONS} from '../dist/src/draft-arguments.js';
import {predicates, evidencePurposes} from '../dist/src/schema.js';

const string = {type: 'string'};
const number = {type: 'number'};
const boolean = {type: 'boolean'};
const names = {type: 'array', items: string};
const choice = values => ({type: 'string', enum: values});
const object = (properties, required = Object.keys(properties)) =>
  ({type: 'object', additionalProperties: false, properties, required});
const array = items => ({type: 'array', items});
const coords = {...array(number), minItems: 2, maxItems: 2};
const mode = choice(['algebra', 'cas']);
const appearance = {
  visible: boolean, labelVisible: boolean, color: string,
  lineThickness: number, lineStyle: number, filling: number,
};
const style = object({...appearance, caption: string, fixed: boolean}, []);
const native = object({id: string, source: string, mode,
  outputs: names, initial: coords}, ['id', 'source']);
const mathValue = depth => ({anyOf: [number, boolean, {type: 'array', maxItems: 256,
  items: depth > 1 ? mathValue(depth - 1) : {anyOf: [number, boolean]}}]});
const check = object({kind: choice(Object.keys(predicates)), subjects: names,
  scope: choice(['initial', 'sampled']), coordinates: coords, value: number,
  properties: style, objectType: string, expression: string, mode,
  expected: {...mathValue(8), description: 'Independent expected mathematical number, boolean, or nested array.'},
  assumptions: names}, ['kind', 'subjects', 'scope']);
const requirement = object({id: string, source: string,
  purpose: choice(evidencePurposes)}, ['id', 'source']);
const checkItem = object({requirementId: string, ...check.properties},
  ['requirementId', ...check.required]);
const interaction = {anyOf: [object({point: string,
  dx: {...number, minimum: -120, maximum: 120, description: 'Horizontal screen pixels.'},
  dy: {...number, minimum: -120, maximum: 120, description: 'Vertical screen pixels.'}}),
  object({parameter: string, value: number})]};
const item = {anyOf: [string, native, requirement, checkItem, interaction,
  object({object: string, properties: style}),
  object({object: string, value: number, coords}, ['object']),
  object({xMin: number, xMax: number, yMin: number, yMax: number}),
  choice(['graphics', 'algebra']),
  object({question: string, answer: string})]};

/** A small complete batch; the plugin checks section shapes on assembly. */
export const draftToolSchema = object({
  action: choice(['create', 'read', 'append', 'replace', 'remove']),
  revision: {type: 'integer', minimum: 1}, locale: string, title: string,
  section: {...choice(DRAFT_SECTIONS), description:
    'requirements contain id/source/purpose; checks carry requirementId. '
    + 'program items contain id/source and optional mode/outputs/initial.'},
  index: {type: 'integer', minimum: 0},
  count: {type: 'integer', minimum: 1, maximum: 8},
  items: {...array(item), minItems: 1, maxItems: 8, description:
    'Complete entries only. Create each dependency before using it. '
    + 'Drag screen pixels: Math.hypot(dx,dy) >= 20; no repeated point.'},
}, ['action']);
export const checkReferenceSchema = object({revision:
  {type: 'integer', minimum: 1}});
export const buildReferenceSchema = object({checkedRequestId: string});
