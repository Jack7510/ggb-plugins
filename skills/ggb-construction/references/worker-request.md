# Worker request contract

Use ggb_request once with one complete `requestText` JSON object.
Inside requestText allow only plan and optional clarifications:[{question,answer}].
Host-owned protocolVersion, prompt, outputDir, base, locale and title are forbidden
inside requestText.
Arguments: requestText, optional locale/title/transcription. Omitted metadata
is retained on repair. Image tasks require nonempty transcription on the first save:
complete mathematical problem text (givens, equations, labels, constraints and
question), not an image summary. Preserve ambiguity; no solution or invented
conditions. Transcribe before linking sources or submitting. Repairs may omit
saved transcription; a nonempty array replaces it, an empty array cannot clear it.
Text-only tasks need no transcription.

Plan: program, requirements, interactions, styles, edits, updates, view, display.
Each requirement has id, original source, optional
purpose and nested checks in plan.requirements[].checks, never plan.checks.
Copy source verbatim from user text, transcription or a confirmed answer.
Do not beautify F1 into F₁ in source; display text belongs in caption.
Type checks use objectType, not expected; expected belongs only to expression.
Steps: id/source, optional op:"native"/mode, outputs, initial.
Keep CAS, initial and independent expected. Sampled needs relevant interactions.
Raw body and escaped arguments each fit 128 KiB.

```json
{"requestText":"{\"plan\":{\"program\":[{\"id\":\"P\",\"source\":\"P=(0,0)\"}],\"requirements\":[{\"id\":\"point\",\"source\":\"point P\",\"checks\":[{\"kind\":\"exists\",\"subjects\":[\"P\"],\"scope\":\"initial\"}]}],\"interactions\":[]}}","locale":"en"}
```

Save returns revision/domainRequestDigest. ggb_check({revision}) is structural,
returns checkedRequestId; ggb_build({checkedRequestId}) executes, verifies and
reloads that request. Repair with complete requestText, keeping all conditions and dependencies.
Accepted saves invalidate old checks and deliveries; rejected saves retain state.
Receipts bind the final request.
