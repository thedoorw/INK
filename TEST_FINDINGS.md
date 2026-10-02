# INK Live Test Findings

This file records only findings observed against a deployed `thedoorw/INK` build.

Development fixes belong in `thedoorw/INK-Browser-QA`.

## Current deployment

- Live URL: https://thedoorw.github.io/INK/
- Source SHA: `66cdb5b4ddc322a2b1027cab2627426f868027d3`
- Status: PUBLISHED / LIVE CHAT TRANSPORT VERIFIED / ROUND 1 COMPLETE / GAP CLUSTERING

## Findings

Live identity/load and CHAT transport are verified against the deployed exact SHA. Round 1 breadth scan is complete; open findings are now being clustered before repair and Round 2.

### Record format

```text
FINDING_ID =
DEPLOYED_SOURCE_SHA =
TEST =
RESULT =
CLASS =
OBSERVED =
EXPECTED =
REPRO_STEPS =
EVIDENCE =
UPSTREAM_DISPOSITION =
RERUN_RESULT =
```


### LIVE-TRANSPORT-001 — closed

```text
FINDING_ID = LIVE-TRANSPORT-001
CASE_ID = CROSS-CASE
DEPLOYED_SOURCE_SHA = 66cdb5b4ddc322a2b1027cab2627426f868027d3
CAPABILITY_FAMILY = C57 CHAT control
RESULT = PASS / CLOSED
OBSERVED = CHAT successfully invoked Live INK named tools through a GitHub-controlled hosted-browser bridge. Capability discovery, context, proposal, approval, execution, Preview, History and Revision all returned structured INK results.
EXPECTED = CHAT can operate Live INK through INK native authorities without mouse emulation or USER relay.
MINIMAL_REPRO = transport-proof-capabilities-003; transport-proof-context-001; transport-proof-closed-loop-002
CLASS = CHAT_EXPOSURE_GAP → REPAIRED
UPSTREAM_DISPOSITION = GitHub Issue #110 closed; bridge runner/workflow installed in INK-Browser-QA.
RERUN_RESULT = PASS
```

### R1-C001-001 — partial

```text
FINDING_ID = R1-C001-001
CASE_ID = C001
DEPLOYED_SOURCE_SHA = 66cdb5b4ddc322a2b1027cab2627426f868027d3
CAPABILITY_FAMILY = C03 C05 C08 C09 C11 C13 C15 C16 C20 C39
RESULT = PARTIAL
OBSERVED = CHAT created native Path + Text, translated both, grouped them, created a Frame, and verified Context/History/Preview. Six scoped History entries were retained. C05/C08/C09/C39 were not proven in this probe.
EXPECTED = C001 probe should establish its distinctive poster-layout capability subset without completing the artwork.
MINIMAL_REPRO = round1-C001-001
CLASS = CHAT_EXPOSURE_GAP / SEPARATE_MATERIAL_ASSET_GAP
SOURCE_AUDIT = INK-Browser-QA/working/INK_LIVE_CLUSTER_C_LAYOUT_PAGE_ARTBOARD_SOURCE_AUDIT_20261002.md
MATERIAL_SOURCE_AUDIT = INK-Browser-QA/working/INK_LIVE_CLUSTER_D_MATERIAL_RECIPE_SOURCE_AUDIT_20261002.md
UPSTREAM_DISPOSITION = C05/C08/C09 layout-assist side is product-existing: Page/Artboard, align/distribute and precision snap/guide authorities are already History-backed upstream and need bounded CHAT exposure only. C39 is not a Material-engine absence: fresh catalog is empty, existing template/instance authority is not CHAT-exposed, and current Path material rendering has bounded semantics.
RERUN_RESULT = PENDING
```

### R1-MATERIAL-001 — material catalog empty

```text
FINDING_ID = R1-MATERIAL-001
CASE_ID = CROSS-CASE / C001 C002 C008 C013
DEPLOYED_SOURCE_SHA = 66cdb5b4ddc322a2b1027cab2627426f868027d3
CAPABILITY_FAMILY = C39 Material system
RESULT = PARTIAL
OBSERVED = search_ink_library for type=material completed successfully but returned totalMatched=0 in a fresh Live document. path.material.apply.v1 is exposed, but there was no immediately reusable CHAT-visible material entry to apply.
EXPECTED = Mature-work cases mapped to C39 need at least one usable material route: an existing material, a bounded material-creation path, or an explicit case-specific fallback.
MINIMAL_REPRO = round1-library-materials-001
CLASS = CHAT_EXPOSURE_GAP / WORKFLOW_USABILITY_GAP
UPSTREAM_DISPOSITION = Keep open; cluster with all C39 case results after Round 1.
RERUN_RESULT = PENDING
```


### R1-C008-001 — partial

```text
FINDING_ID = R1-C008-001
CASE_ID = C008
DEPLOYED_SOURCE_SHA = 66cdb5b4ddc322a2b1027cab2627426f868027d3
CAPABILITY_FAMILY = C08 C09 C10 C11 C12 C13 C17 C21 C39
RESULT = PARTIAL
OBSERVED = CHAT created vector primitives, executed Boolean union, rotation, radial Repeat and raw SVG import. All mutations produced native History/Revision evidence and final Preview. Align/distribute, smart-guide/snapping and usable material route remain unproven.
EXPECTED = C008 should establish the distinctive geometric-logo vector construction path.
MINIMAL_REPRO = round1-C008-001
CLASS = CHAT_EXPOSURE_GAP / SEPARATE_MATERIAL_ASSET_GAP
SOURCE_AUDIT = INK-Browser-QA/working/INK_LIVE_CLUSTER_C_LAYOUT_PAGE_ARTBOARD_SOURCE_AUDIT_20261002.md
MATERIAL_SOURCE_AUDIT = INK-Browser-QA/working/INK_LIVE_CLUSTER_D_MATERIAL_RECIPE_SOURCE_AUDIT_20261002.md
UPSTREAM_DISPOSITION = Align/distribute and Smart Snap/Guides are confirmed existing product authorities and need bounded CHAT exposure only. Reuse InkApp.alignSelection() and editor/precision-layout.js; do not duplicate layout math. C39 remains a separate catalog/creation/render-semantics integration gap.
RERUN_RESULT = PENDING
```


### R1-C002-001 — partial

```text
FINDING_ID = R1-C002-001
CASE_ID = C002
DEPLOYED_SOURCE_SHA = 66cdb5b4ddc322a2b1027cab2627426f868027d3
CAPABILITY_FAMILY = C02 C18 C19 C20 C22 C39
RESULT = PARTIAL
OBSERVED = CHAT created a Frame and Text, reparented Text, applied Frame layout, registered a Component, edited Text, and rediscovered the Component through Creative Library with a reusable component.instance.create.v1 descriptor. Page mutation, raster/image path, and material path were not established.
EXPECTED = C002 should prove multi-page/layout/component/text/image reuse fundamentals without completing the full deck.
MINIMAL_REPRO = round1-C002-001
CLASS = CHAT_EXPOSURE_GAP / SEPARATE_RASTER_AND_MATERIAL_GAPS
SOURCE_AUDIT = INK-Browser-QA/working/INK_LIVE_CLUSTER_C_LAYOUT_PAGE_ARTBOARD_SOURCE_AUDIT_20261002.md
MATERIAL_SOURCE_AUDIT = INK-Browser-QA/working/INK_LIVE_CLUSTER_D_MATERIAL_RECIPE_SOURCE_AUDIT_20261002.md
UPSTREAM_DISPOSITION = Page mutation is product-existing and needs CHAT exposure; existing add/delete/duplicate/rename routes already use native Document + History authority. Raster/image follows Cluster B. Material engine exists but fresh reusable catalog / CHAT creation semantics remain a Cluster D integration gap. Do not fold New Document/A4 redesign into this finding.
RERUN_RESULT = PENDING
```


### R1-C019-001 — editable text deformation is not yet a rendered product capability

```text
FINDING_ID = R1-C019-001
CASE_ID = C019
DEPLOYED_SOURCE_SHA = 66cdb5b4ddc322a2b1027cab2627426f868027d3
CAPABILITY_FAMILY = C10 C14 C20
RESULT = PARTIAL / PRODUCT_RENDER_GAP
OBSERVED = CHAT created and edited native Text, created a native vector Path, and transformed the Path. The deployed Public Creative API returned INK_CAPABILITY_NOT_FOUND for text.warp.v1. Source audit found a stored pathText descriptor in the Text model, but the installed formal drawText() renderer does not consume it, and current warp/distort/perspective execution is Path-only.
EXPECTED = Curved-text case needs a real editable Text warp/path-text rendering authority in addition to ordinary Text and Path operations.
MINIMAL_REPRO = round1-C019-002
CLASS = PRODUCT_CAPABILITY_GAP / RENDER_INTEGRATION_GAP
SOURCE_AUDIT = INK-Browser-QA/working/INK_LIVE_CLUSTER_B_RASTER_EFFECTS_DEFORMATION_SOURCE_AUDIT_20261002.md
UPSTREAM_DISPOSITION = Do not add a registry-only text.warp operation over the current descriptor. Implement and qualify actual editable text-deformation rendering first, then add bounded CHAT exposure.
RERUN_RESULT = PENDING
```

### R1-C007-001 — recipe route incomplete

```text
FINDING_ID = R1-C007-001
CASE_ID = C007
DEPLOYED_SOURCE_SHA = 66cdb5b4ddc322a2b1027cab2627426f868027d3
CAPABILITY_FAMILY = C55 Recipe / automation
RESULT = PARTIAL
OBSERVED = CHAT created a base design, generated a linked grid Repeat and cloned Text successfully. Creative Library recipe search returned zero entries.
EXPECTED = C55 case should eventually prove reusable Recipe/automation semantics, not only repeat/clone primitives.
MINIMAL_REPRO = round1-C007-001
CLASS = CHAT_GOVERNED_EXECUTION_GAP / CATALOG_INTEGRATION_GAP
SOURCE_AUDIT = INK-Browser-QA/working/INK_LIVE_CLUSTER_D_MATERIAL_RECIPE_SOURCE_AUDIT_20261002.md
UPSTREAM_DISPOSITION = Recipe engines already exist upstream: Studio registers a built-in RecipeEngine recipe and app.flora.recipe provides validated/History-atomic painting recipe execution. Fresh document Creative Library recipe search is correctly empty because it indexes only page-stored FLORA recipes, and reuse is intentionally READ_ONLY pending an accepted CHAT-governed mutation entrypoint. Do not create a third recipe engine.
RERUN_RESULT = PENDING
```


### R1-C003-001 — binary reference transport repaired

```text
FINDING_ID = R1-C003-001
CASE_ID = C003
DEPLOYED_SOURCE_SHA = 66cdb5b4ddc322a2b1027cab2627426f868027d3
CAPABILITY_FAMILY = C07 C19 C22 C40 C42
RESULT = PARTIAL
OBSERVED = Initial JSON-only bridge could not satisfy INK's required File/Blob handoff and returned CHAT_REFERENCE_HANDOFF_BINARY_REQUIRED. MR repaired the bridge with bounded qa/fixtures File materialization. Rerun imported the PNG Reference, recorded history/provenance, and completed reference decomposition. Editable Frame/Text structure also executed.
EXPECTED = CHAT can hand a real binary reference into INK and continue with editable structure/reconstruction.
MINIMAL_REPRO = round1-C003-binary-preflight-001 → round1-C003-001
CLASS = CHAT_EXPOSURE_GAP → REPAIRED / WORKFLOW_USABILITY_GAP
UPSTREAM_DISPOSITION = Binary transport repair retained in INK-Browser-QA Live bridge. Any remaining page/layout-assist coverage follows the existing-authority exposure design in INK-Browser-QA/working/INK_LIVE_CLUSTER_C_LAYOUT_PAGE_ARTBOARD_SOURCE_AUDIT_20261002.md; binary transport itself remains PASS.
RERUN_RESULT = BINARY HANDOFF PASS
```

### R1-TEST-INFRA-001 — decomposition evidence payload oversized / repaired

```text
FINDING_ID = R1-TEST-INFRA-001
CASE_ID = CROSS-CASE / C003 C009
DEPLOYED_SOURCE_SHA = 66cdb5b4ddc322a2b1027cab2627426f868027d3
CAPABILITY_FAMILY = C40 C41 C42
RESULT = PARTIAL
OBSERVED = Successful reference decomposition produced a structured Live result of roughly 1.8 MB because thousands of createdRefs were serialized into working/INK_LIVE_CHAT_RESULT.json. The operation completed, but ordinary connector reads become cumbersome.
EXPECTED = Live test transport should retain full artifact evidence while keeping the GitHub SSOT summary compact enough for rapid CHAT scan/review.
MINIMAL_REPRO = round1-C003-001
CLASS = TEST_ENVIRONMENT_LIMIT / WORKFLOW_USABILITY_GAP
UPSTREAM_DISPOSITION = Live bridge workflow now compacts oversized GitHub SSOT results while retaining the full JSON + screenshot in the workflow artifact; INK product authority was not changed.
RERUN_RESULT = PASS — round1-C009-001 produced a compact SSOT summary from a 1,255,011-byte full result
```


### R1-C009-001 — pass

```text
FINDING_ID = R1-C009-001
CASE_ID = C009
DEPLOYED_SOURCE_SHA = 66cdb5b4ddc322a2b1027cab2627426f868027d3
CAPABILITY_FAMILY = C40 C41 C42
RESULT = PASS
OBSERVED = CHAT imported a real PNG Reference, decomposed it into 1471 editable color Paths plus 1471 editable line Paths, then repainted two reconstructed Paths through INK native proposal/approval/execute. Preview completed.
EXPECTED = Reference can enter INK, become editable reconstructed structure, and receive a bounded correction.
MINIMAL_REPRO = round1-C009-001
CLASS = PASS
UPSTREAM_DISPOSITION = No product repair required for this probe.
RERUN_RESULT = PASS
```


### R1-C004-C005-C006-C012-001 — poster/layout/output batch

```text
FINDING_ID = R1-C004-C005-C006-C012-001
CASE_ID = C004 / C005 / C006 / C012
DEPLOYED_SOURCE_SHA = 66cdb5b4ddc322a2b1027cab2627426f868027d3
CAPABILITY_FAMILY = C03 C05 C11 C16 C20 C53
RESULT = C004 PASS / C005 PARTIAL / C006 PASS / C012 PASS
OBSERVED = CHAT executed native Path/Text/Frame compositions for all four quick probes. C006 additionally exported SVG and PDF successfully. C005 image-specific coverage was not repeated because raster ingest is tested in the dedicated raster cases.
EXPECTED = Overlap-heavy poster/flyer/quote cases should quickly prove layout/text/output without forcing full-artwork reproduction.
MINIMAL_REPRO = round1-batch-C004-C005-C006-C012-001
CLASS = PASS / WORKFLOW_USABILITY_GAP
UPSTREAM_DISPOSITION = No immediate product repair from this batch; C005 image portion follows raster cluster.
RERUN_RESULT = PASS for tested subset
```

### R1-C017-001 — vector path editing works; A1 Paint Session added

```text
FINDING_ID = R1-C017-001
CASE_ID = C017
DEPLOYED_SOURCE_SHA = 58adf13cd98a8594eb8e63faedc735ce0c5179f0
CAPABILITY_FAMILY = C10 C17 C29 C30 C34
RESULT = PARTIAL / A1 PASS
OBSERVED = Existing native Path creation/edit/clone remains proven. The updated Live registry now also exposes paint.session.create.v1; clusterA-A1-live-rerun-004 created a native two-stroke Paint Session through direct bounded-edit proposal/approval/execution and proved Preview plus History Undo/Redo.
EXPECTED = C017 drawing coverage still needs the formal native type:'stroke' / NaturalMedia path where paintbrush/pencil/airbrush identity and paper-coupled stroke behavior are required; Paint Session is now a real drawing route but does not replace that separate native Stroke authority.
MINIMAL_REPRO = round1-C017-001 + clusterA-A1-live-rerun-004
CLASS = CHAT_EXPOSURE_GAP
SOURCE_AUDIT = INK-Browser-QA/working/INK_LIVE_CLUSTER_A_DRAWING_NATURAL_MEDIA_SOURCE_AUDIT_20261002.md
UPSTREAM_DISPOSITION = A1 Paint Session is closed. Continue A2 native Stroke/NaturalMedia/Airbrush exposure; do not reopen the A1 renderer/session authority.
RERUN_RESULT = PARTIAL / A1 PAINT SESSION PASS
```

### R1-RASTER-EDIT-001 — mutable web-raster ingest exposed; raster edit stack remains open

```text
FINDING_ID = R1-RASTER-EDIT-001
CASE_ID = C010 / C011 / C014 / C015
DEPLOYED_SOURCE_SHA = 3a785b90d6f7922175cca3662fd2b72bf95430ce
CAPABILITY_FAMILY = C14 C22 C23 C24 C25 C26 C27 C28 C40
RESULT = PARTIAL / B0+B1 PASS
OBSERVED = Formal Live registry now exposes raster.import / import_ink_raster. clusterB-B1-live-rerun-004 imported rose-window-primary.png through browser-local attachment handoff as one editable native image+rasterState (1086×1448), returned a stable created ref and source SHA-256, rendered a content Preview, created one scoped History entry, Undo removed the image, and Redo restored it. ReferenceImage remains separate and locked.
EXPECTED = Raster-heavy mature cases still require bounded adjustment/filter/blend/effect/Liquify exposure, later masks/local raster edits, and native Path deformation where applicable.
MINIMAL_REPRO = clusterB-B1-live-rerun-004
CLASS = PARTIAL CHAT EXPOSURE / REMAINING RASTER STACK GAPS
SOURCE_AUDIT = INK-Browser-QA/working/INK_LIVE_CLUSTER_B_RASTER_EFFECTS_DEFORMATION_SOURCE_AUDIT_20261002.md
UPSTREAM_DISPOSITION = B0 web-raster conversion bridge and B1 PNG/JPEG/WebP mutable raster named-tool import are merged and Live-qualified. Continue B2 non-destructive image-stack edits next. PSD/TIFF/EXR/RAW native ingest exists upstream but is not included in the current B1 named-tool PASS. Do not unlock ReferenceImage.
RERUN_RESULT = B0+B1 PASS / CLUSTER REMAINS PARTIAL
```

### R1-DRAWING-EXPOSURE-001 — A1 Paint Session exposed; remaining Drawing families open

```text
FINDING_ID = R1-DRAWING-EXPOSURE-001
CASE_ID = C016 / C017 / C018
DEPLOYED_SOURCE_SHA = 58adf13cd98a8594eb8e63faedc735ce0c5179f0
CAPABILITY_FAMILY = C29 C30 C31 C32 C33 C34 C35 C38
RESULT = PARTIAL / A1 PASS
OBSERVED = Live capability discovery now exposes paint.session.create.v1. clusterA-A1-live-rerun-004 used direct propose_ink_edit → approve_ink_edit → execute_ink_edit to create one native paint-session with pencil + watercolor, 2 strokes / 6 samples, one scoped History entry, completed Preview, successful Undo to zero objects, and successful Redo restoring the same paint-session.
EXPECTED = Cluster A still requires bounded exposure for formal native Stroke/NaturalMedia/Airbrush, Paper and targeted Eraser. Blender/Smudge remain a separate pigment-surface render-integration product gap.
MINIMAL_REPRO = clusterA-A1-live-rerun-004
CLASS = CHAT_EXPOSURE_GAP / PRODUCT_RENDER_INTEGRATION_GAP
SOURCE_AUDIT = INK-Browser-QA/working/INK_LIVE_CLUSTER_A_DRAWING_NATURAL_MEDIA_SOURCE_AUDIT_20261002.md
UPSTREAM_DISPOSITION = A1 Paint Session is merged, deployed and Live-qualified. Continue A2 native Stroke/NaturalMedia/Airbrush → A3 Paper → A4 targeted Eraser. Keep A5 Blender/Smudge separate. The earlier CHAT_PLAN_STEPS_INVALID probe was a QA routing mistake because use_ink Creative Plan requires 2–32 steps; single A1 edits correctly use the direct bounded-edit named tools.
RERUN_RESULT = A1 PASS / CLUSTER REMAINS PARTIAL
```

### R1-PAINT-SESSION-BOUNDS-001 — Paint Session content bounds fallback

```text
FINDING_ID = R1-PAINT-SESSION-BOUNDS-001
CASE_ID = C016 / C017 / C018
DEPLOYED_SOURCE_SHA = 58adf13cd98a8594eb8e63faedc735ce0c5179f0
CAPABILITY_FAMILY = C29 C30 C34 / Preview geometry
RESULT = OPEN / NON-BLOCKING FOR A1
OBSERVED = A1 Paint Session renders and History/Preview execute successfully, but get_ink_preview(scope=content) returned 49×49 bounds although recorded stroke samples span roughly x=-110..100 and y=-95..70. Source renderer has an explicit paint-session draw route but no dedicated paint-session world-bounds specialization.
EXPECTED = Content Preview / fit / selection geometry should derive bounds from the replay/session stroke geometry rather than a generic fallback box.
MINIMAL_REPRO = clusterA-A1-live-rerun-004
CLASS = PRODUCT_INTEGRATION_GAP / PREVIEW_BOUNDS_USABILITY
UPSTREAM_DISPOSITION = Keep separate from A1 exposure closure. Reuse Stroke Session/replay geometry to provide bounds; do not create a second drawing model.
RERUN_RESULT = PENDING
```

### R1-C013-001 — raster filter/effect side exists upstream but is not CHAT-exposed

```text
FINDING_ID = R1-C013-001
CASE_ID = C013
DEPLOYED_SOURCE_SHA = 66cdb5b4ddc322a2b1027cab2627426f868027d3
CAPABILITY_FAMILY = C14 C22 C25 C26 C27 C39
RESULT = NOT_EXPOSED
OBSERVED = Live registry exposes no deformation/filter/blend/effect raster-edit route. Source audit confirms the product already has rendered non-destructive adjustment/filter/mask/blend/effect/Liquify authority through image-core + Studio renderer. Material application exists, but the fresh-document material catalog is still empty.
EXPECTED = C013 needs CHAT exposure to the existing raster/filter/effect authorities plus separately usable material semantics.
MINIMAL_REPRO = round1-batch-C010-C011-C014-C015-002 + round1-library-materials-001
CLASS = CHAT_EXPOSURE_GAP / SEPARATE_MATERIAL_ASSET_GAP
SOURCE_AUDIT = INK-Browser-QA/working/INK_LIVE_CLUSTER_B_RASTER_EFFECTS_DEFORMATION_SOURCE_AUDIT_20261002.md
MATERIAL_SOURCE_AUDIT = INK-Browser-QA/working/INK_LIVE_CLUSTER_D_MATERIAL_RECIPE_SOURCE_AUDIT_20261002.md
UPSTREAM_DISPOSITION = Treat raster/filter/effect exposure as Cluster B. Material core/template authority exists, but fresh catalog is empty and current path-material semantics are bounded; keep C39 open until a case-appropriate reusable material route is qualified.
RERUN_RESULT = PENDING
```

### R1-B2-ADJUSTMENT-001 — brightnessContrast Live qualified

```text
FINDING_ID = R1-B2-ADJUSTMENT-001
CASE_ID = C010 / C011 / C013 / C014 / C015
DEPLOYED_SOURCE_SHA = 11551eab8c1ec78e04031f178b7ab24b91b40d26
CAPABILITY_FAMILY = C14 C22 C23 C24 C25 C26 C27 C28
RESULT = PARTIAL / B2 ADJUSTMENT PASS
OBSERVED = CHAT imported one editable native PNG raster, proposed/approved/executed image.adjustment.add.v1 brightnessContrast through the bounded-edit authority, observed renderer fingerprint 34d01658→17debb38, recorded scoped History, captured Preview, then Undo restored 34d01658 and Redo restored 17debb38.
EXPECTED = B2 must qualify existing non-destructive image-stack authorities one family at a time; tool-call success alone is insufficient.
MINIMAL_REPRO = clusterB-B2-adjustment-live-002
CLASS = CHAT_EXPOSURE_GAP → ADJUSTMENT REPAIRED
UPSTREAM_DISPOSITION = PR #121 merged. brightnessContrast is Live-qualified. Filter/blend/effect/Liquify remain separately open and must not inherit this PASS.
RERUN_RESULT = PASS
```

### R1-B2-FILTER-001 — gaussianBlur Live qualified

```text
FINDING_ID = R1-B2-FILTER-001
CASE_ID = C010 / C011 / C013 / C014 / C015
DEPLOYED_SOURCE_SHA = e2ce5e409f42c992bcf411e5e23d8f02435b1a63
CAPABILITY_FAMILY = C14 C22 C23 C24 C25 C26 C27 C28
RESULT = PARTIAL / B2 FILTER PASS
OBSERVED = CHAT imported one editable native PNG raster, proposed/approved/executed image.filter.add.v1 gaussianBlur through the bounded-edit authority, observed renderer fingerprint 34d01658→c6017f2e, recorded scoped History, captured Preview, then Undo restored 34d01658 and Redo restored c6017f2e.
EXPECTED = B2 must qualify existing non-destructive image-stack authorities one family at a time; tool-call success alone is insufficient.
MINIMAL_REPRO = clusterB-B2-filter-live-002
CLASS = CHAT_EXPOSURE_GAP → FILTER REPAIRED
UPSTREAM_DISPOSITION = PR #122 merged. gaussianBlur is Live-qualified. Blend/effect/Liquify remain separately open and must not inherit this PASS.
RERUN_RESULT = PASS
```

### R1-B2-BLEND-001 — multiply Live qualified

```text
FINDING_ID = R1-B2-BLEND-001
CASE_ID = C010 / C011 / C013 / C014 / C015
DEPLOYED_SOURCE_SHA = 789e9efb77d1edaac15420483c9ce71dd43f414b
CAPABILITY_FAMILY = C14 C22 C23 C24 C25 C26 C27 C28
RESULT = PARTIAL / B2 BLEND PASS
OBSERVED = CHAT imported two editable native PNG rasters, proposed/approved/executed image.blend.set.v1 multiply on the upper raster, observed renderer fingerprint 34d01658→89aa5042, recorded scoped History, captured Preview, then Undo restored 34d01658 and Redo restored 89aa5042.
EXPECTED = B2 must qualify existing non-destructive image-stack authorities one family at a time; tool-call success alone is insufficient.
MINIMAL_REPRO = clusterB-B2-blend-live-002
CLASS = CHAT_EXPOSURE_GAP → BLEND REPAIRED
UPSTREAM_DISPOSITION = PR #123 merged. multiply is Live-qualified. Effect/Liquify remain separately open and must not inherit this PASS.
RERUN_RESULT = PASS
```

### R1-B2-EFFECT-001 — colorOverlay Live qualified

```text
FINDING_ID = R1-B2-EFFECT-001
CASE_ID = C010 / C011 / C013 / C014 / C015
DEPLOYED_SOURCE_SHA = 9d73a8018c0c37861aa3c76412951eb26bf78e62
CAPABILITY_FAMILY = C14 C22 C23 C24 C25 C26 C27 C28
RESULT = PARTIAL / B2 EFFECT PASS
OBSERVED = CHAT imported one editable native PNG raster, proposed/approved/executed image.effect.add.v1 colorOverlay, observed renderer fingerprint 34d01658→7cd33282, recorded scoped History, captured Preview, then Undo restored 34d01658 and Redo restored 7cd33282.
EXPECTED = B2 must qualify existing non-destructive image-stack authorities one family at a time; tool-call success alone is insufficient.
MINIMAL_REPRO = clusterB-B2-effect-live-003
CLASS = CHAT_EXPOSURE_GAP → EFFECT REPAIRED
UPSTREAM_DISPOSITION = PR #124 merged. colorOverlay is Live-qualified. Prior dropShadow no-delta evidence was case-visibility limited, not proof of missing native effect authority. Liquify remains separately open.
RERUN_RESULT = PASS
```

### R1-B2-LIQUIFY-001 — twirl Live qualified / B2 representative closure

```text
FINDING_ID = R1-B2-LIQUIFY-001
CASE_ID = C010 / C011 / C013 / C014 / C015
DEPLOYED_SOURCE_SHA = cc9b623258123da0e00e31a9e686357fba0d4ec0
CAPABILITY_FAMILY = C14 C22 C23 C24 C25 C26 C27 C28
RESULT = PASS / B2 FIVE PRIORITY OPERATION FAMILIES QUALIFIED
OBSERVED = CHAT imported one editable native PNG raster, proposed/approved/executed image.liquify.add.v1 with one twirl operation, observed renderer fingerprint 34d01658→755eb849, recorded scoped History, captured Preview, then Undo restored 34d01658 and Redo restored 755eb849.
EXPECTED = B2 qualifies the existing non-destructive image-stack authorities through real native state mutation, observable rendering, History, Preview, Undo and Redo; tool-call success alone is insufficient.
MINIMAL_REPRO = clusterB-B2-liquify-live-003
CLASS = CHAT_EXPOSURE_GAP → LIQUIFY REPAIRED / B2 REPRESENTATIVE CLOSURE
UPSTREAM_DISPOSITION = PR #125 merged. brightnessContrast adjustment, gaussianBlur filter, multiply blend, colorOverlay effect and twirl Liquify are each independently Live-qualified. This closes B2 at the operation-family representative-coverage level; B3 local/destructive raster and masks, B4 Path deformation, and C019 Text warp remain outside this closure.
RERUN_RESULT = PASS
```

