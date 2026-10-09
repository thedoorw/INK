# CHAT Runtime Operation

This repository is the deployed `/INK/` Runtime surface. CHAT does not depend on manual UI clicking.

## Canonical control path

1. Read `thedoorw/INK/BUILD_INFO.json` and bind the test to the deployed source identity.
2. Use the GitHub connector against the authoritative source repository `thedoorw/INK-Browser-QA`.
3. Write a structured request to `ACTIVE/INK_LIVE_CHAT_REQUEST.json`.
4. The `INK Live CHAT Request` GitHub Actions workflow launches hosted Chromium and loads `https://thedoorw.github.io/INK/`.
5. The runner waits for `window.INK_APP.inkPublicApi.tools.invoke`, then invokes named INK tools through the public Runtime API.
6. Structured results are written back to `working/INK_LIVE_CHAT_RESULT.json` in `INK-Browser-QA`.
7. Visual evidence is retained as the workflow artifact, including the browser screenshot and, when requested, the genuine INK Preview PNG and Preview manifest.
8. Product fixes and test findings return to `INK-Browser-QA`; this deployment mirror is not the product-development workspace.

## Recipe creative-loop operation

Use one sequenced Live request:

`source Recipe/Script → import_ink_workflow analyze → translate → propose → approve → execute → get_ink_preview`

Use `$ref` between steps for session IDs, proposal IDs, approval tokens and target refs. A required native target may be created first through the existing governed edit tools; it must never substitute for the translated source operation.

Negative proposal checks must leave Document, History and Recipe inventory unchanged. Final evidence is the structured Live result plus the genuine same-handle Preview PNG.

This is the normal CHAT operating method for `/INK/`; repository boundaries do not change the Runtime control model.
