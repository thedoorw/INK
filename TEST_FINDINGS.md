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
CLASS = WORKFLOW_USABILITY_GAP
UPSTREAM_DISPOSITION = Continue Round 1; do not repair until shared gaps are clustered.
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
CLASS = CHAT_EXPOSURE_GAP / WORKFLOW_USABILITY_GAP
UPSTREAM_DISPOSITION = Continue Round 1; cluster C08/C09/C39 gaps across cases.
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
CLASS = CHAT_EXPOSURE_GAP / WORKFLOW_USABILITY_GAP
UPSTREAM_DISPOSITION = Continue Round 1; cluster page/raster/material gaps.
RERUN_RESULT = PENDING
```


### R1-C019-001 — text deformation not exposed

```text
FINDING_ID = R1-C019-001
CASE_ID = C019
DEPLOYED_SOURCE_SHA = 66cdb5b4ddc322a2b1027cab2627426f868027d3
CAPABILITY_FAMILY = C10 C14 C20
RESULT = PARTIAL
OBSERVED = CHAT created and edited native Text, created a native vector Path, and transformed the Path. The deployed Public Creative API returned INK_CAPABILITY_NOT_FOUND for text.warp.v1, and no text-warp/deformation route appears in the exposed registry.
EXPECTED = Curved-text case needs an editable warp/deformation authority in addition to ordinary Text and Path operations.
MINIMAL_REPRO = round1-C019-002
CLASS = CHAT_EXPOSURE_GAP
UPSTREAM_DISPOSITION = Keep open and cluster with C14 deformation findings after Round 1.
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
CLASS = CHAT_EXPOSURE_GAP / WORKFLOW_USABILITY_GAP
UPSTREAM_DISPOSITION = Keep open; cluster with Recipe/automation findings after Round 1.
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
UPSTREAM_DISPOSITION = Binary transport repair retained in INK-Browser-QA Live bridge; selection/layout-specific C003 coverage remains for later scan.
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

### R1-C017-001 — vector path editing works, brush route absent

```text
FINDING_ID = R1-C017-001
CASE_ID = C017
DEPLOYED_SOURCE_SHA = 66cdb5b4ddc322a2b1027cab2627426f868027d3
CAPABILITY_FAMILY = C10 C17 C29 C30 C34
RESULT = PARTIAL
OBSERVED = CHAT created a native Path, edited one anchor through path.edit.v1, cloned the object, and verified History/Revision/Context/Preview. Current CHAT registry exposes no brush/stroke-drawing authority equivalent to the mature paintbrush/pencil path.
EXPECTED = Vector path editing and freehand brush/pencil drawing should both be callable when this case is used as a drawing probe.
MINIMAL_REPRO = round1-C017-001
CLASS = CHAT_EXPOSURE_GAP
UPSTREAM_DISPOSITION = Cluster brush/stroke exposure with C016/C018 before repair.
RERUN_RESULT = PENDING
```

### R1-RASTER-EDIT-001 — raster/reference ingest works; raster editing is not exposed

```text
FINDING_ID = R1-RASTER-EDIT-001
CASE_ID = C010 / C011 / C014 / C015
DEPLOYED_SOURCE_SHA = 66cdb5b4ddc322a2b1027cab2627426f868027d3
CAPABILITY_FAMILY = C14 C22 C23 C24 C25 C26 C27 C28 C40
RESULT = PARTIAL / NOT_EXPOSED
OBSERVED = CHAT imported a real PNG Reference, captured Preview and exported PNG. A generic clone/transform proposal against the imported ReferenceImage failed with CHAT_EDIT_TARGET_LOCKED. The exact-SHA Live capability registry exposed no capability descriptor matching mask, filter, blend, effect, adjustment, warp, deformation or raster-edit semantics.
EXPECTED = Raster-heavy mature cases need CHAT-callable masking, adjustment/filter/blend/effect and reusable raster placement/deformation routes where the product supports them.
MINIMAL_REPRO = round1-batch-C010-C011-C014-C015-001 → round1-batch-C010-C011-C014-C015-002
CLASS = CHAT_EXPOSURE_GAP / PRODUCT_CAPABILITY_GAP
UPSTREAM_DISPOSITION = Source-audit existing raster authorities before deciding exposure repair versus new product capability work.
RERUN_RESULT = PENDING
```

### R1-DRAWING-EXPOSURE-001 — drawing/natural-media lane not exposed to CHAT

```text
FINDING_ID = R1-DRAWING-EXPOSURE-001
CASE_ID = C016 / C017 / C018
DEPLOYED_SOURCE_SHA = 66cdb5b4ddc322a2b1027cab2627426f868027d3
CAPABILITY_FAMILY = C29 C30 C31 C32 C33 C34 C35 C38
RESULT = NOT_EXPOSED / PARTIAL
OBSERVED = Exact-SHA Live capability discovery contains no CHAT-exposed brush, natural-media, paper, Blender or Smudge capability. C017 proves native vector Path editing, but vector Path editing is not accepted as a substitute for brush/natural-media operation.
EXPECTED = INK is intended for CHAT-operated creative work, so existing drawing authorities must be callable through a bounded CHAT surface before drawing cases can pass.
MINIMAL_REPRO = transport-proof-capabilities-003; round1-C017-001; round1-batch-C010-C011-C014-C015-002 capability registry scan
CLASS = CHAT_EXPOSURE_GAP / possible PRODUCT_CAPABILITY_GAP
UPSTREAM_DISPOSITION = Highest-priority source audit after Round 1; expose existing native drawing authorities rather than creating duplicate drawing state.
RERUN_RESULT = PENDING
```

### R1-C013-001 — shader/filter/effect case not exposed

```text
FINDING_ID = R1-C013-001
CASE_ID = C013
DEPLOYED_SOURCE_SHA = 66cdb5b4ddc322a2b1027cab2627426f868027d3
CAPABILITY_FAMILY = C14 C22 C25 C26 C27 C39
RESULT = NOT_EXPOSED
OBSERVED = Live registry exposes no deformation/filter/blend/effect raster-edit route. Material application operation exists, but the fresh-document material catalog is empty.
EXPECTED = C013 needs at least one CHAT-callable shader/filter/blend/effect path plus usable material semantics.
MINIMAL_REPRO = round1-batch-C010-C011-C014-C015-002 + round1-library-materials-001
CLASS = CHAT_EXPOSURE_GAP / PRODUCT_CAPABILITY_GAP
UPSTREAM_DISPOSITION = Cluster with raster/effect and material repairs.
RERUN_RESULT = PENDING
```

## Round 1 gap clusters

```text
CLUSTER A — DRAWING / NATURAL MEDIA
C29 C30 C31 C32 C33 C34 C35 C38
Cases: C016 C017 C018
Priority: HIGHEST for the CHAT-operated drawing goal

CLUSTER B — RASTER / MASK / FILTER / BLEND / EFFECT / DEFORMATION
C14 C22 C23 C24 C25 C26 C27 C28
Cases: C010 C011 C013 C014 C015 C019

CLUSTER C — LAYOUT ASSIST / PAGE / ARTBOARD
C02 C05 C08 C09
Cases: C001 C002 C003 C008

CLUSTER D — REUSABLE CREATIVE ASSETS
C39 Material / C55 Recipe
Cases: C001 C002 C007 C008 C013

CROSS-CASE VERIFIED
C43 History / C44 Revision / C53 Output / C57 CHAT control / Reference import+decomposition
```

Round 2 does not start until the highest-value open clusters have been source-audited and the smallest coherent repair packages are identified.
