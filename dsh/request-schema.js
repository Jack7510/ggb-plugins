/** @fileoverview Publishes model-facing request shapes; runtime parsing stays authoritative. */
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
const native = object({id: {...string,
  description: 'Actual native output label; outputs must include this id.'}, op: choice(['native']), source: string,
  mode, outputs: names, initial: coords}, ['id', 'op', 'source', 'mode']);
const step = {anyOf: [native,
  object({id: string, op: choice(['freePoint']), x: number, y: number}),
  object({id: string, op: choice(['command']), name: string,
    args: array({anyOf: [number, object({ref: string})]})}),
]};
const check = object({kind: choice(Object.keys(predicates)), subjects: names,
  scope: choice(['initial', 'sampled']), coordinates: coords, value: number,
  properties: style, objectType: string, expression: string, mode,
  expected: {anyOf: [number, boolean, array({})], description: 'Independent expected mathematical number, boolean, or nested array.'},
  assumptions: names}, ['kind', 'subjects', 'scope']);
const requirement = object({id: string, source: string,
  purpose: choice(evidencePurposes), checks: {...array(check), minItems: 1}},
['id', 'source', 'checks']);
const plan = object({program: {...array(step), description:
    'Ordered native steps. Create each dependency before using it.'},
  requirements: {...array(requirement), minItems: 1},
  styles: array(object({object: string, properties: style})),
  interactions: {...array({anyOf: [
    object({point: {...string, description: 'Movable point; each point occurs once.'},
      dx: {...number, minimum: -120, maximum: 120,
        description: 'Horizontal screen pixels, not mathematical coordinates.'},
      dy: {...number, minimum: -120, maximum: 120,
        description: 'Vertical screen pixels. Math.hypot(dx,dy) must be >= 20.'}}),
    object({parameter: string, value: number}),
  ]}), description: 'Mouse drag samples use screen pixels: abs(dx), abs(dy) <= 120; '
    + 'Math.hypot(dx,dy) >= 20; no repeated point. '
    + 'Sampled checks require interactions. Read the interactions reference.'},
  edits: array(object({object: string, properties: object(appearance, [])})),
  updates: array(object({object: string, value: number, coords}, ['object'])),
  view: object({xMin: number, xMax: number, yMin: number, yMax: number}),
  display: choice(['graphics', 'algebra']),
}, ['requirements', 'interactions']);

/** Closed host-owned-path-free shape for check/build model arguments. */
export const modelRequestSchema = object({protocolVersion: {type: 'integer', enum: [2]},
  prompt: string, locale: string, plan, title: string,
  clarifications: array(object({question: string, answer: string})),
}, ['protocolVersion', 'prompt', 'locale', 'plan']);
