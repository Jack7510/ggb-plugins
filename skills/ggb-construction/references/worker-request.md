# Worker request contract

Use ggb_request once with one complete `requestText` JSON object.
Inside requestText allow only plan and optional clarifications:[{question,answer}].
Host-owned protocolVersion, prompt, outputDir, base, locale and title are forbidden
inside requestText.
Arguments: requestText; optional locale/title/transcription persist on repair. Image tasks require nonempty transcription on the first save:
complete mathematical problem text (givens, equations, labels, constraints and
question), not an image summary. Preserve ambiguity; no solution or invented
conditions. Transcribe before submission. Repairs retain omitted transcription;
a nonempty array replaces it; empty cannot clear it.
Text-only tasks need no transcription.

Plan: program, requirements, interactions, styles, edits, updates, view, display.
Requirement: id, source, optional purpose, nested requirements[].checks; no plan.checks.
Copy source verbatim from user text, transcription or a confirmed answer.
Do not beautify F1 into F₁ in source; display text belongs in caption.
Type checks use objectType, not expected; expected belongs only to expression.
Steps: id/source, optional op:"native"/mode, outputs, initial.
Keep CAS, initial and independent expected. Sampled needs relevant interactions.
With a base, modifications support parameter samples only; edits support none.
Independent movable unfixed sliders only; changed in-range grid values.
Reload, sample, restore and verify each copy.
Never resubmit an unchanged unsupported sample or weaken checks; report the limit.
Zero samples means not_sampled.
Raw body and escaped arguments each fit 128 KiB.

```json
{"requestText":"{\"plan\":{\"program\":[{\"id\":\"P\",\"source\":\"P=(0,0)\"}],\"requirements\":[{\"id\":\"point\",\"source\":\"point P\",\"checks\":[{\"kind\":\"exists\",\"subjects\":[\"P\"],\"scope\":\"initial\"}]}],\"interactions\":[]}}","locale":"en"}
```

Save: revision/domainRequestDigest. ggb_check({revision}) is structural and
returns checkedRequestId. ggb_build({checkedRequestId}) executes, verifies and
reloads it. Repair whole requestText; keep conditions and dependencies.
Accepted saves invalidate checks/deliveries; rejections retain state.
Receipts bind the final request.
