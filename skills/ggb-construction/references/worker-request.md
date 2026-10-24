# Worker request contract

Use ggb_request once with one complete `requestText` JSON object.
Inside requestText allow only plan and optional clarifications:[{question,answer}].
The host owns prompt, paths and base identity. Do not copy CLI
fields (protocolVersion, prompt, outputDir, base, locale, title) into requestText.
Tool arguments: requestText, optional locale/title/transcription. Omitted metadata
is retained on repair; an explicit transcription array replaces prior image text.

Plan carries applicable program, requirements, interactions, styles, edits,
updates, view and display. Each requirement has id, original source, optional
purpose and nonempty checks in plan.requirements[].checks; never plan.checks or
requirementId. Source comes from user text, transcription or a confirmed answer.
Steps: id/source, op:"native", mode (default algebra), outputs, initial.
Preserve CAS, initial and independently derived expected. Sampled checks require
relevant interactions. Raw body and escaped arguments each fit 128 KiB.

```json
{"requestText":"{\"plan\":{\"program\":[{\"id\":\"P\",\"source\":\"P=(0,0)\"}],\"requirements\":[{\"id\":\"point\",\"source\":\"point P\",\"checks\":[{\"kind\":\"exists\",\"subjects\":[\"P\"],\"scope\":\"initial\"}]}],\"interactions\":[]}}","locale":"en"}
```

Save returns revision/domainRequestDigest. ggb_check({revision}) is structural;
success returns checkedRequestId. ggb_build({checkedRequestId}) executes, verifies
and reloads that exact saved request. Repair with a complete requestText, retaining all conditions and dependencies.
Accepted saves invalidate old checks and deliveries; rejected saves retain state.
Receipts bind the final request.
