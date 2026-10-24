# Worker common execution contract

Use one complete requestText JSON object: {plan,clarifications?}.
No protocolVersion/prompt/outputDir/base/locale/title in requestText.
Tool metadata: locale/title/transcription; omissions persist.
Image tasks require nonempty transcription on the first save: complete mathematical problem text
(givens, equations, labels, constraints, question), not an image summary.
Keep ambiguity; no solution/invented conditions. Empty cannot clear saved text.
Copy source verbatim from user text/transcription/confirmed answers.
Clarifications are [{question,answer}]; the question alone is not a condition.

Plan: program, requirements, interactions; optional styles/edits/updates/view/display.
Requirements: [{id,source,checks,purpose?}]; sourceRef:"input" may replace source.
Copies input + transcription; exclude source.
Long inputs: use literal excerpts for byte limits. Unique IDs, nonempty checks;
never plan.checks. purpose: construction/constraint/interaction; no exemption.

## Program and identities

Step: {id,source,op?:"native",mode?:"algebra",outputs?,initial?}; default native/algebra.
Algebra: one English GeoGebra statement. CAS: one materialized id, not dynamic.
outputs defaults to [id]; otherwise include id and every actual returned label.
initial:[x,y] positions that movable point, preserving its native constraint.
Dependencies first; base labels stay exact, including Unicode/subscripts.
Lowercase tuple names may create vectors; use uppercase point anchors and type checks.
Constrain interior points; initial coordinates do not constrain dragging.
New IDs: ASCII letter + letters/digits/underscore, optional final {subscript};
max 32 chars. No constants/logical operators/protected names/GgbProbe prefix;
no scripts, deletion, renaming or undeclared outputs.

## Checks

Check: kind, subjects:[exact labels], scope:initial|sampled.
Type checks use objectType, not expected; expected belongs only to expression.
Forms (add scope):
- exists: one subject, no extra fields.
- type: one subject, objectType:<actual engine type>; sliders use numeric.
- coordinate: one point, coordinates:[x,y]; only justified fixed values.
- pointOn: [point,line|circle|conic], no extra fields.
- dependsOn: [derived,...given defining objects,...used intermediates];
  transitive dependence, at least two. A helper cannot replace a given root.
- style: one subject, properties:<requested style fields>.
- expression: subjects occurring literally in expression, expression, mode:algebra|cas,
  expected:<independently derived finite number,boolean,nested array>.
Equality: residual, expected:0; equation is not boolean.
No passed/tolerance. initial: construction/reload; sampled: also input changes.
Keep full verification.

## Presentation and samples

styles:[{object,properties}]. Properties: visible/labelVisible/fixed booleans,
color:#RRGGBB, lineThickness:1..13, lineStyle:0..4, filling:0..1, caption:1..100 chars.
Caption changes display only. For hidden algebra values,
prefer visible:false alone; explicit label flags must survive reload.
view:{xMin,xMax,yMin,yMax}; display:graphics(default)|algebra.
With a base: no view; edits:[{object,properties}] is appearance only and exclusive
with program/updates/styles. Edits allow only color/lineThickness/lineStyle/
filling/labelVisible/visible. updates:[{object,value}|{object,coords:[x,y]}] changes
independent base values/points. No fixed edit on base objects.
interactions:[{parameter,value}|{point,dx,dy}]. Parameter: independent movable unfixed
numeric slider; changed in-range value on its step grid. Mouse: movable point,
20<=hypot(dx,dy), each |component|<=120; no mouse sample in algebra view.
With a base, modifications support parameter samples only; edits support none.
Reload each copy; restore parameters and verify full state.
Zero samples means not_sampled.

```json
{"requestText":"{\"plan\":{\"program\":[{\"id\":\"P\",\"source\":\"P=(0,0)\"}],\"requirements\":[{\"id\":\"point\",\"source\":\"point P\",\"checks\":[{\"kind\":\"exists\",\"subjects\":[\"P\"],\"scope\":\"initial\"}]}],\"interactions\":[]}}","locale":"en"}
```

Save returns revision/domainRequestDigest; ggb_check({revision}) is structural and
returns checkedRequestId; ggb_build({checkedRequestId}) executes/verifies/reloads it.
Accepted saves invalidate checks/deliveries; rejections retain state.
Repair complete requestText; preserve conditions/dependencies.
Receipts bind the final request. Body and escaped arguments each fit 128 KiB.
