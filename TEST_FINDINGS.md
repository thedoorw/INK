# INK Live Test Findings

This file records only findings observed against a deployed `thedoorw/INK` build.

Development fixes belong in `thedoorw/INK-Browser-QA`.

## Current deployment

- Live URL: https://thedoorw.github.io/INK/
- Source SHA: `468873503155f66585564a6ca7b11f7a82586d7a`
- Status: PUBLISHED / B4 THREE-OPERATION FORMAL LIVE PASS / REQUIRED REGRESSIONS PASS

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

### R1-PAINT-SESSION-BOUNDS-001 — Paint Session content bounds repaired

```text
FINDING_ID = R1-PAINT-SESSION-BOUNDS-001
CASE_ID = C016 / C017 / C018
DEPLOYED_SOURCE_SHA = be6baa7085b9520a67e0952968650d4648af4d0a
CAPABILITY_FAMILY = C29 C30 C34 / Preview geometry
RESULT = PASS / REPAIRED
OBSERVED = The previous 49×49 generic content-bounds fallback is closed. PR #126 exact candidate b7c73f7ea32a25013dddd9721e1a35e7e052fc26 reused native Paint Session replay + existing strokeBoundingBox through the Renderer world-bounds authority; merged source be6baa7085b9520a67e0952968650d4648af4d0a was deployed without a second Document / History / Renderer / drawing authority.
EXPECTED = Content Preview / fit / selection geometry derives bounds from replay/session stroke geometry rather than a generic fallback box.
MINIMAL_REPRO = paint-session-bounds-live-rerun-003
CLASS = PRODUCT_INTEGRATION_GAP → REPAIRED
LIVE_EVIDENCE = Runtime sourceSha be6baa7085b9520a67e0952968650d4648af4d0a; apiReady=true; 23 public tools; one native paint-session chat-paint-fnv1a32-5a313234; one scoped History entry; content Preview bounds x=-135.13 y=-120.46648 w=274.0064 h=231.12032; render fingerprint fnv1a32:1b8d3443; Undo returned zero objects; Redo restored the same object and identical Preview bounds/fingerprint.
TRANSPORT_NOTE = live-rerun-001 and -002 stopped before API readiness while the newly pinned exact-SHA jsDelivr module graph was propagating (first run multiple transient 403/404; second run only tiled-export.js 403). GitHub SSOT showed tiled-export.js was byte-identical to the prior Live-qualified source. rerun-003 on the same exact source completed successfully, so those failures are recorded as deployment transport/readiness variability, not a product regression.
UPSTREAM_DISPOSITION = PR #126 merged and Live-qualified. Paint Session bounds issue closed; A1 remains closed. Continue separate A2 native Stroke/NaturalMedia/Airbrush exposure.
RERUN_RESULT = PASS
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



### TEST-B-B4-C1-C2-EXPOSURE-001 — Vector / Layout qualification blocked at CHAT exposure

```text
FINDING_ID = TEST-B-B4-C1-C2-EXPOSURE-001
DEPLOYED_SOURCE_SHA = cc9b623258123da0e00e31a9e686357fba0d4ec0
RESULT = BLOCKED_AT_PUBLIC_EXPOSURE
OBSERVED = Formal Live capability inventory testB-capability-inventory-002 completed on exact deployed source SHA with apiReady=true and 23 named tools. No path.warp.v1 / path.distort.v1 / path.perspective.v1, Page CRUD/activate, object.align.v1, guide/snap, or page.artboard.set.v1 operation is exposed. Existing B4 discovery reproducer fails at describeWarp with INK_CAPABILITY_NOT_FOUND before a legal edit proposal can reach native state, Canvas, History, Preview, Undo or Redo.
EXPECTED = Expose bounded operations over the existing native Path deformation, Page, align/distribute, guide/snap and Artboard authorities, then rerun the full CHAT → public API → native state → Canvas → History → Preview → Undo/Redo qualification.
MINIMAL_REPRO = clusterB-B4-discovery-live-001 + testB-capability-inventory-002
CLASS = EXPOSURE_GAP
SOURCE_RECORD = INK-Browser-QA/working/INK_TEST_B_VECTOR_LAYOUT_QUALIFICATION_20261003.md
SOURCE_RECORD_COMMIT = 668819134601d9a870748d4713c2789037036c39
PRODUCT_MUTATION = NONE
POINTER_MOUSE_SIMULATION = NONE
TEXT_DEFORMATION = EXCLUDED
RERUN_RESULT = PENDING_PUBLIC_EXPOSURE
```


### TEST-A-A2-STROKE-NATURALMEDIA-AIRBRUSH-001 — blocked at CHAT exposure

```text
FINDING_ID = TEST-A-A2-STROKE-NATURALMEDIA-AIRBRUSH-001
CASE_ID = C016 / C017 / C018
DEPLOYED_SOURCE_SHA = cc9b623258123da0e00e31a9e686357fba0d4ec0
LIVE_REPO_HEAD_AT_TEST = 145a00587bcc6dbc9717b05179f2c5e131a5b587
CAPABILITY_FAMILY = C29 C30 C31 C34
AFFECTED_CAPABILITY = native Stroke / NaturalMedia / Airbrush
RESULT = BLOCKED_AT_PUBLIC_EXPOSURE
EXPECTED = stroke.create.v1 is discoverable and can create the existing native type:'stroke' through proposal/approval/execute so Renderer/Canvas, History, Preview, Undo and Redo can be qualified for pencil, brush/drybrush and airbrush.
ACTUAL = describe_ink_capability("stroke.create.v1") returned INK_CAPABILITY_NOT_FOUND. The formal lifecycle cannot legally advance past discovery on this deployment.
REPRO_STEPS = get_ink_capabilities → describe_ink_capability("stroke.create.v1")
MINIMAL_REPRO = clusterA-A2-native-stroke-discovery-live-001
REQUEST_COMMIT = 0753b4971abdb41749fbc66fadb663243d716660
RESULT_COMMIT = 9f7dd86e246014e18e8be71010b3a545e07bfd42
CLASS = EXPOSURE_GAP
EXISTING_NATIVE_AUTHORITY = YES — interactive beginStroke / native Stroke / NaturalMediaController / airbrush remain product-owned upstream
POINTER_MOUSE_SIMULATION = NONE
UPSTREAM_DISPOSITION = Record only. Do not treat this test failure as authorization to implement. Reuse existing native Stroke/NaturalMedia authorities if a later work order exposes them.
SOURCE_RECORD = INK-Browser-QA/working/INK_TEST_A_DRAWING_NATURAL_MEDIA_QUALIFICATION_20261003.md
SOURCE_RECORD_COMMIT = 230483602831f7e5bf7fc907ccf49c7517bbcae3
RERUN_RESULT = PENDING_PUBLIC_EXPOSURE
```

### TEST-A-A3-PAPER-001 — blocked at CHAT exposure

```text
FINDING_ID = TEST-A-A3-PAPER-001
CASE_ID = C016
DEPLOYED_SOURCE_SHA = cc9b623258123da0e00e31a9e686357fba0d4ec0
LIVE_REPO_HEAD_AT_TEST = 145a00587bcc6dbc9717b05179f2c5e131a5b587
CAPABILITY_FAMILY = C31 C38
AFFECTED_CAPABILITY = page Paper profile / mutation
RESULT = BLOCKED_AT_PUBLIC_EXPOSURE
EXPECTED = page.paper.set.v1 is discoverable and reuses existing page.paper + InkApp.changePaper + History/cache invalidation so paper state and natural-media render can be qualified through Preview and Undo/Redo.
ACTUAL = describe_ink_capability("page.paper.set.v1") returned INK_CAPABILITY_NOT_FOUND. No formal CHAT paper mutation can reach native state on this deployment.
REPRO_STEPS = get_ink_capabilities → describe_ink_capability("page.paper.set.v1")
MINIMAL_REPRO = clusterA-A3-paper-discovery-live-001
REQUEST_COMMIT = 00a1bcc4503b1367a889ff7a8c2308c1234ba85b
RESULT_COMMIT = b66739f60e79b7705b2f8a7b5b228f1d20d1e674
CLASS = EXPOSURE_GAP
EXISTING_NATIVE_AUTHORITY = YES — page.paper / InkApp.changePaper / render/paper-profile.js
POINTER_MOUSE_SIMULATION = NONE
UPSTREAM_DISPOSITION = Record only. No second Paper model or implementation task is created by this test package.
SOURCE_RECORD = INK-Browser-QA/working/INK_TEST_A_DRAWING_NATURAL_MEDIA_QUALIFICATION_20261003.md
SOURCE_RECORD_COMMIT = 230483602831f7e5bf7fc907ccf49c7517bbcae3
RERUN_RESULT = PENDING_PUBLIC_EXPOSURE
```

### TEST-A-A1-REGRESSION-001 — Paint Session remains PASS

```text
FINDING_ID = TEST-A-A1-REGRESSION-001
CASE_ID = C016 / C017
DEPLOYED_SOURCE_SHA = cc9b623258123da0e00e31a9e686357fba0d4ec0
LIVE_REPO_HEAD_AT_TEST = 145a00587bcc6dbc9717b05179f2c5e131a5b587
CAPABILITY_FAMILY = C29 C30 C34
RESULT = PASS / REGRESSION CLEAN
OBSERVED = Current Live source exposes paint.session.create.v1. CHAT proposed, approved and executed a two-stroke pencil+watercolor native paint-session with 6 samples. Document changed from 0→1 object. History added exactly one scoped entry "CHAT create Paint Session". Preview completed with render fingerprint fnv1a32:a6535881. Undo removed the object; Redo restored the same stable object id chat-paint-fnv1a32-a5525b8e and the exact same Preview fingerprint.
EXPECTED = Previously accepted A1 remains functional after later Live source integrations.
MINIMAL_REPRO = clusterA-A1-regression-live-001
REQUEST_COMMIT = b96ac419baa9a1f7ae65609ffdee90106a7714aa
RESULT_COMMIT = 9b26e502664b38f2068840d9b6eb3852087eebda
CLASS = PASS
JSON_SAFE = YES
POINTER_MOUSE_SIMULATION = NONE
KNOWN_NON_BLOCKING = paint-session content Preview still uses the previously recorded 49×49 fallback world/content bounds.
UPSTREAM_DISPOSITION = A1 remains closed. Do not reopen A1 from the A2/A3 exposure gaps.
SOURCE_RECORD = INK-Browser-QA/working/INK_TEST_A_DRAWING_NATURAL_MEDIA_QUALIFICATION_20261003.md
SOURCE_RECORD_COMMIT = 230483602831f7e5bf7fc907ccf49c7517bbcae3
RERUN_RESULT = PASS
```

### R1-A2-NATIVE-STROKE-001 — native Stroke four-mode Live qualified

```text
FINDING_ID = R1-A2-NATIVE-STROKE-001
DEPLOYED_SOURCE_SHA = d0248e9661cc242081507e4bf73fc8b73aeb6256
RESULT = PASS / A2 REPRESENTATIVE QUALIFICATION
MINIMAL_REPRO = clusterA-A2-native-stroke-live-002
REQUEST_COMMIT = fce87d4a853d9e209665cb581a33e024cf74bf63
RESULT_COMMIT = e1967d7342a3b72f9bba72e683d1a4a92d863e9e
RUN = 37041501266
ARTIFACT = 11242318263
OBSERVED = Exact source / apiReady true; Pencil, Brush, Airbrush and DryBrush each created one native Stroke through proposal/approval/execute. Four scoped History entries. Content Preview fingerprint fnv1a32:28606ccc, bounds x=-233.6 y=-182 w=451 h=350.6. Four Undo remove all objects; four Redo restore identical objects and identical Preview fingerprint. Candidate QA independently proved native NaturalMediaController/WebGL path and Canvas delta.
CLASS = EXPOSURE_GAP → REPAIRED
POINTER_MOUSE_SIMULATION = NONE
TRANSPORT_NOTE = First request stopped before readiness while newly pinned modules returned transient HTTP failures. Same exact source warm rerun completed.
VISUAL_LIMIT = Hosted Live screenshot captures closed-document shell; it is not visible Canvas evidence. Renderer-backed content Preview and candidate Canvas checks are the rendering evidence.
UPSTREAM_DISPOSITION = A2 closed for four representative modes. Continue A3 Paper; Eraser and Blender/Smudge remain separate.
```


## Round 2 combined qualification — Draw + Reference — 2026-10-03

Test-time deployment identity:
- Live wrapper: `8d2fba408efc205c903efaae24a958440a6a71b1`
- exact source: `ab84aafc3006f0f14a74d231ca862200bd0b5d94`
- runtime: Public Creative API ready; 23 named tools.

### INK-QA-C Draw — PASS

Request `ink-qa-c-draw-combined-001`; QA request commit `b6033cc2f8b107844084ce5cfd11b6f4cb3e4a0d`; result commit `f50c885ed80a0056dd9df098879e9473b3e5f071`; run `37086517849`; artifact `11261115603`.

Native Paper + Brush + DryBrush produced two editable Stroke objects. CHAT then made a concrete Airbrush correction as a third native Stroke. Preview fingerprint changed `fnv1a32:287f934e → fnv1a32:eb357f3b`; Undo restored `287f934e`; Redo restored `eb357f3b`. Final History contains the Paper entry plus three native Stroke entries. A4 PNG export completed with fingerprint `fnv1a32:73678494`.

Classification: `PASS`.

Retained separate gaps: `PAPER_SINGLE_STROKE_RENDER_INTEGRATION` and `PAPER_WEBGL_ROUGHNESS_PARITY`. They are not regressions in the already-qualified adjacent Brush/DryBrush combined route and did not stop the exercise.

### INK-QA-B Reference — PASS

Request `ink-qa-b-reference-combined-001`; QA request commit `61cb1278f4f84a79fe58396570b5509ab10a5ee5`; result commit `d889043a6d653ea96946f1643e9ddf6c150e696b`; run `37086642087`; artifact `11261355427`.

Reference intake and mutable raster import from the same fixture remain structurally separate: the Reference is locked/non-editable while the imported 1086×1448 native image is editable. CHAT translated the mutable raster, captured baseline Revision r1, applied one brightness/contrast correction, captured corrected Revision r2, then verified History and Undo/Redo.

Preview fingerprint changed `fnv1a32:c3bd4f5f → fnv1a32:f279be47`; Undo restored `c3bd4f5f`; Redo restored `f279be47`. Final History contains Reference import, editable raster import, transform and brightness/contrast entries. A4 PNG export and output inspection completed with fingerprint `fnv1a32:0e7e514b`.

Classification: `PASS`.

No product code or deployed source was changed by these tests. Full evidence authority remains in `thedoorw/INK-Browser-QA/working/INK_COMBINED_CAPABILITY_QUALIFICATION_20261003.md` and its evidence manifest.


### LIVE-B4-NATIVE-PATH-DEFORMATION-001 — closed

## B4 native Path deformation — closed 2026-10-03

USER authorized bounded extension of existing deformation Core, superseding the prior authority-mismatch STOP. No direct CHAT projective anchor mutation, second deformation model or FORMAT_VERSION change.

- PR #131 merged; exact accepted source: `468873503155f66585564a6ca7b11f7a82586d7a`.
- Exact final candidate: `938016b79e10c6ac1c06ad930be35a67654c381b`.
- Candidate and merge complete product/source tree: `8d35c9a8a3f69d2f51cf02703fd78b9d8b090e4b`; equivalence verified before publication.
- Live wrapper deployment commit: `a588bdb8a016a45dbd676f54e66a4b0f28d78e6d`.
- Final candidate request: clusterB-B4-final-candidate-regressions-003; run 37088355232; artifact 11261835640; digest sha256:c0ac8df74e4fa0288af4beb0e2d84e8e40d70e5070e1a5d20385cbb9952f8b15.
- Local required/focused regressions: 65/65 PASS, including existing deformation/reset and transform-advanced projective consumers.
- Exact candidate fresh-browser A1 Paint Session, A2 four-mode native Stroke, A3 Paper and B2 brightnessContrast: PASS.
- Formal Live request: clusterB-B4-warp-distort-perspective-live-001; request commit `e59bf09375295b0ae10a05db9494711b6aaf88a9`; run 37088553315; artifact 11261089242; digest sha256:4b56cf001a39fca1fd5b6d38ea6aa099fb2f1a044d4c933915f76808b47213c3.
- Live apiReady=true; exact accepted source verified; 23 named tools; no pointer emulation.
- Warp / Distort / Perspective each independently complete discovery → propose → approve → execute → stable native Path state → Canvas → History → Preview → exact Undo/Redo. Native reset and repeat-from-base compatibility probes PASS for all three.
- path.deformation retains type INK-NON-DESTRUCTIVE-DEFORMATION, baseSubpaths, JSON-safe inspectable parameters, reversible=true and revision. Projective point/handle mapping remains exclusively in existing deformation mutation authority; math/planning remains in transform-advanced.
- Distort moves two upper corners independently while retaining the lower edge; Perspective constrains opposing edge pairs. Same base Path and offsets produce different canonical mapping and subpaths.

| Operation | Canvas baseline → result | Preview baseline → result | Undo / Redo / reset |
| --- | --- | --- | --- |
| Warp | ca5e221b → ac22a30d | a94d0df7 → 08317eb1 | exact |
| Distort | ca5e221b → 4e17a235 | a94d0df7 → 9f578833 | exact |
| Perspective | ca5e221b → b1149dd5 | a94d0df7 → 5105c73e | exact |

Candidate and formal Live screenshots inspected: native filled/stroked Path visible in open document Canvas. Structured render/state evidence is preserved in `qa/evidence/live-b4-20261003/`; MR acceptance is `working/INK_LIVE_B4_NATIVE_DEFORMATION_MR_REVIEW_20261003.md`.

```text
B4_WARP = PASS / LIVE QUALIFIED
B4_DISTORT = PASS / LIVE QUALIFIED
B4_PERSPECTIVE = PASS / LIVE QUALIFIED
DISTORT_RESULT != PERSPECTIVE_RESULT
B4 = CLOSED / MERGED / DEPLOYED / FORMAL LIVE QUALIFIED
A1_A2_A3_B2_REGRESSIONS = PASS
FORMAT_VERSION = 4 / UNCHANGED
TEXT_DEFORMATION = OUTSIDE_SCOPE / NOT_QUALIFIED
C1_C2_LAYOUT = SEPARATE / NOT_CLOSED_BY_B4
```

Source closure: https://github.com/thedoorw/INK-Browser-QA/blob/0a363d0def9073da1b444c79ef135b78815b3d72/working/INK_LIVE_B4_NATIVE_DEFORMATION_CLOSURE_20261003.md

### PAPER-LOCAL-MAIN-PROGRAM-OPTIMIZATION — closed 2026-10-03

Two previously evidenced Paper renderer integration gaps are closed without changing Paper, Stroke, Renderer authority, UI, or FORMAT_VERSION.

- `PAPER_SINGLE_STROKE_RENDER_INTEGRATION`: PR #130; accepted source `701c3777dba854df893f61f1d75b97ea694ede62`; formal Live run `37087999061`. A single native Brush and DryBrush now consume existing `page.paper` through the existing multichannel NaturalMedia renderer. Stroke identity remained stable; Paper created one scoped History entry; Preview and exact Undo/Redo passed. Existing 2+ adjacent Stroke behavior plus A1/A2/A3 regressions passed.
- `PAPER_WEBGL_ROUGHNESS_PARITY`: PR #134; accepted source `698ce0ef781eeb5899ab5b84183d9a0d0eb8e6f5`; product/source tree `6f616cdbf54f172c569d69d14b197c3b6eae746f`. WebGL multichannel simulation now consumes the existing Paper `roughness` authority as paper resistance instead of incorrectly using `granulation` for that role. Existing absorbency and granulation semantics remain separate.
- Exact merged source roughness qualification: roughness-only state change `0.42 -> 0.95`; WebGL Preview delta; exact Undo/Redo; direct Canvas2D and WebGL roughness responses; higher roughness increases resistance; absorbency remains unchanged. A1/A2/A3 merged-source regressions passed.
- Formal Live run `37089417471`: exact source identity `698ce0ef...`; Preview `fnv1a32:f4fdfe1a -> fnv1a32:633c4d8e`; Undo restored `f4fdfe1a`; Redo restored `633c4d8e`. Paper result retained absorbency `0.58`, set roughness `0.95`, and History retained only one native Stroke entry plus one scoped Paper entry.
- B4 native Path deformation remains present because the deployed source is the post-B4 accepted main plus the bounded roughness patch.

```text
PAPER_SINGLE_STROKE_RENDER_INTEGRATION = CLOSED / MERGED / DEPLOYED / QUALIFIED / RECORDED
PAPER_WEBGL_ROUGHNESS_PARITY = CLOSED / MERGED / DEPLOYED / QUALIFIED / RECORDED
A1_A2_A3_REGRESSION = CLEAN
NO_B4_CONFLICT = TRUE
SECOND_AUTHORITY = NONE
UI_CHANGE = NONE
FORMAT_VERSION_CHANGE = NONE
```


## A4 targeted native Stroke Eraser — closed 2026-10-03

```text
FINDING = R2-A4-TARGETED-ERASER-001
CLASS = EXPOSURE_GAP → REPAIRED
PR = #136
EXACT_CANDIDATE = daff9553dfc8c433eadc6ee2119703c9770b49a6
MERGED_SOURCE_SHA = 3ab58f771f927f50d4548c40ca153834df08600d
FORMAL_LIVE_REQUEST = clusterA-A4-targeted-eraser-live-001
REQUEST_COMMIT = 9d1b2fc843ca884fe8de7a54178ada135ab0b391
RESULT_COMMIT = 5009f13bcbc95a29910886d399f383229150e1b3
RUN = 37091594541
ARTIFACT = 11262089933
ARTIFACT_DIGEST = sha256:cf8c1f4f0108aee825138531a8f0f03b6630f35b9e49367c2bec6002d3d70da1
RESULT = PASS / MERGED / DEPLOYED / FORMAL LIVE QUALIFIED
```

Formal Live evidence:
- runtime exact source `3ab58f771f927f50d4548c40ca153834df08600d`; `apiReady=true`; 23 named tools.
- `stroke.erase.circle.v1` is discoverable and explicitly constrained to stable editable native Stroke targets.
- one native Pencil Stroke (`live-a4-source-stroke`) was erased with a world-space circle `x=0 y=0 radius=32`.
- the existing native geometry authority produced exactly two native Stroke fragments: `chat-erase-fnv1a32-06181049` and `chat-erase-fnv1a32-24a2dcee`.
- History added one scoped `CHAT erase Stroke` entry. No pointer/mouse simulation or area-wide `eraseAt()` orchestration was used.
- Preview render fingerprint changed `fnv1a32:482bfe2b → fnv1a32:786ce305`; Undo restored `fnv1a32:482bfe2b`; Redo restored `fnv1a32:786ce305` and the same two fragment refs.
- stale proposal protection rejected the outdated target with `CHAT_EDIT_TARGET_STALE`.
- a circle that did not intersect the explicit target was rejected with `CHAT_EDIT_NO_OP`.
- exact candidate regression batch passed A1 Paint Session, A2 native Stroke/NaturalMedia, A3 Paper, and B2 brightnessContrast.
- implementation reuses existing `eraseStrokeWithCircle()`, proposal target fingerprints/revision validation, scoped History, document structure, spatial invalidation, and Renderer refresh. No second Eraser/Stroke/Renderer/History authority, UI change, or FORMAT_VERSION change.

```text
A4_TARGETED_ERASER = CLOSED
A5_BLENDER_SMUDGE = OPEN / SEPARATE PRODUCT_RENDER_INTEGRATION_GAP
```
