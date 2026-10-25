# Worker request

requestText JSON: {plan,clarifications?}.
Keep locale/title/transcription outside it; omissions persist.
Host supplies protocolVersion/prompt/outputDir/base.
Image first save: nonempty transcription of givens/equations/labels/constraints/question.
Keep ambiguity; no solutions/invented conditions. Empty cannot clear saved text.
Copy source verbatim from user text/transcription/confirmed answers.
Clarifications are [{question,answer}]; the question alone is not a condition.

Plan: program, requirements, interactions; optional styles/edits/updates/view/display.
Requirements: [{id,source,checks,purpose?}]; sourceRef:"input" copies input +
transcription instead of source. Long inputs: literal excerpts. Unique IDs,
nonempty checks; never plan.checks. purpose: construction/constraint/interaction.

## Program and identities

Step: {id,source,op?:"native",mode?:"algebra",outputs?,initial?}; default native/algebra.
Algebra: one English statement. CAS: one materialized id; no dynamic links.
Omit outputs: accept verified same-command dependents; require id.
Explicit outputs: exact labels including id; declare names used later.
Fixed vertices, face only: {"id":"t","source":"t=Polygon({A,B,C})"}.
Polygon(A,B,C) also returns edges.
initial:[x,y] positions a movable point; native constraints remain.
Dependencies first; base labels stay exact, including Unicode/subscripts.
Lowercase tuples may be vectors; use uppercase point anchors with type checks.
Constrain interior points; initial coordinates do not constrain dragging.
New IDs: ASCII letter + letters/digits/underscore, optional final {subscript};
max 32 chars. No constants/logical operators/protected names/GgbProbe prefix;
no scripts, deletion, renaming or undeclared outputs.

## Checks

Checks: kind, subjects:[exact labels], scope:initial|sampled.
Only expression uses expected; type uses objectType. Add scope to each form:
- exists: one subject, no extra fields.
- type: one subject, objectType:<actual engine type>; sliders use numeric.
- coordinate: one point, coordinates:[x,y]; only justified fixed values.
- pointOn: [point,line|circle|conic], no extra fields.
- dependsOn: [derived,...given defining objects,...used intermediates];
  transitive dependence, at least two. A helper cannot replace a given root.
- style: one subject, properties:<requested style fields>.
- expression: subjects occurring literally in expression, expression, mode:algebra|cas,
  expected:<independently derived finite number,boolean,nested array>.
Equality: residual with expected:0, not an equation.
No passed/tolerance. initial: construction/reload; sampled: also input changes.

## Presentation and samples

styles:[{object,properties}]. Properties: visible/labelVisible/fixed booleans,
color:#RRGGBB, lineThickness:1..13, lineStyle:0..4, filling:0..1, caption:1..100 chars.
Caption affects display only. Hidden values: prefer visible:false;
explicit label flags must survive reload.
view:{xMin,xMax,yMin,yMax}; display:graphics(default)|algebra.
With a base: no view; edits:[{object,properties}] is appearance only and exclusive
with program/updates/styles. Edits allow only color/lineThickness/lineStyle/
filling/labelVisible/visible. updates:[{object,value}|{object,coords:[x,y]}] changes
independent base values/points. No fixed edit on base objects.
interactions:[{parameter,value}|{point,dx,dy}]. Parameter: independent movable unfixed
numeric slider; changed in-range value on its step grid. Mouse: movable point,
20<=hypot(dx,dy), each |component|<=120; no mouse sample in algebra view.
Base modifications: parameter samples only; edits: no samples.
Reload/verify full state in each copy; restore parameters. Zero samples: not_sampled.

```json
{"requestText":"{\"plan\":{\"program\":[{\"id\":\"P\",\"source\":\"P=(0,0)\"}],\"requirements\":[{\"id\":\"point\",\"source\":\"point P\",\"checks\":[{\"kind\":\"exists\",\"subjects\":[\"P\"],\"scope\":\"initial\"}]}],\"interactions\":[]}}","locale":"en"}
```

Save: revision/domainRequestDigest; invalidates checks/deliveries.
Rejections retain state. Structural ggb_check({revision}) returns checkedRequestId;
ggb_build({checkedRequestId}) executes/verifies/reloads.
Repair complete requestText: JSON errors change syntax/argument placement only;
output errors first fix outputs from actual labels. Keep other steps, required
objects, dependencies, checks and samples. Never weaken checks.
Receipts bind requests; body/escaped arguments each <=128 KiB.
