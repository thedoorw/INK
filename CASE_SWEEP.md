# INK Case Capability Sweep

## Method

Round 1 is a fast breadth scan across the selected mature-work cases.

All Round-1 operations are executed by CHAT through INK's Public Creative API / named tools. Do not substitute manual mouse drawing for a CHAT capability test.

Do not reproduce the full artwork. Use each case as a compact probe for the capabilities that make that case useful.

Status values:

`PENDING / PASS / PARTIAL / BLOCKED / NOT_EXPOSED / TEST_ENVIRONMENT_LIMIT`

## Current candidate sweep

| Case | Reference | Distinctive capability probe | Round-1 action | Status |
| --- | --- | --- | --- | --- |
| C001 | Figma — minimal poster | C03 C05 C08 C09 C11 C13 C15 C16 C20 C39 | create text + shape, align/snap, transform, group/frame, apply material | PARTIAL — create/transform/group/frame PASS; align/snap/artboard/material unresolved |
| C002 | Figma — year-in-review deck | C02 C18 C19 C20 C22 C39 | create/switch page, text+image hierarchy, layout/component/reuse probe | PARTIAL — Frame/Layout/Text/Component/Library PASS; page mutation/raster/material unresolved |
| C003 | Figma — reference → portfolio design | C07 C19 C22 C40 C42 | import reference, select/target, create editable structure/layout | PARTIAL — binary Reference import/decompose + editable structure PASS; selection/layout-specific probe pending |
| C004 | Figma — concept poster | overlap check | short poster probe only where it exercises a path not already proven by C001 | PASS — minimal Path+Text poster composition executed; intentionally treated as overlap coverage |
| C005 | Adobe — invitation | mixed text/layout/image | quick text + image + layout/edit probe | PARTIAL — Frame + multi-Text invitation composition PASS; image portion covered separately by raster probes |
| C006 | Adobe — promotional flyer | layout/output | assemble minimal flyer structure and verify output route | PASS — flyer composition + SVG export + PDF export verified |
| C007 | Adobe — social ads | C55 automation | create one base design, run one repeat/automation-style variant step | PARTIAL — Repeat/Clone variant mechanics PASS; Recipe library empty |
| C008 | Adobe — geometric logo | C08 C09 C10 C11 C12 C13 C17 C21 C39 | path/shape → boolean → align → repeat → SVG round-trip | PARTIAL — Path/Boolean/Rotate/Repeat/SVG PASS; align/snap/material unresolved |
| C009 | Canva — Run Club poster | C40 C41 C42 | import/reference → extraction/reconstruction → editable correction | PASS — binary import/decompose/editable repaint/Preview verified |
| C010 | Canva — campaign visual | C22 C23 C40 C42 | raster import → mask/targeted edit → transform/reconstruction probe | PARTIAL — Reference import/Preview/PNG output PASS; mask/raster-edit route not exposed; ReferenceImage generic transform locked |
| C011 | Canva — pastry hero image | C22 C23 C26 | raster + mask + blend/composition probe | PARTIAL — raster/reference ingest PASS; mask/blend capability not exposed through current CHAT registry |
| C012 | Canva — quote card | overlap check | use only to confirm any still-unproven text/format/reuse path | PASS — compact quote-card Path+Text composition verified as overlap case |
| C013 | Figma — layered shader artwork | C14 C22 C25 C26 C27 C39 | raster/object → deformation/filter/blend/effect/material probe | NOT_EXPOSED — Live capability registry exposes no deformation/filter/blend/effect raster-edit route; material catalog also empty in fresh document |
| C014 | Adobe — surreal texture/light poster | C22 C25 C28 C46 | reusable raster source → filter → compare/before-after | PARTIAL — Reference ingest/Preview/output PASS; reusable ReferenceImage clone rejected as locked; filter route not exposed |
| C015 | Adobe — billboard mockup | C14 C22 C24 C28 | reusable raster instance → deformation → adjustment | PARTIAL — Reference ingest PASS; generic clone/transform blocked on ReferenceImage; deformation/adjustment route not exposed |
| C016 | Adobe — watercolor/oil/pencil/cartoon action | C29 C30 C31 C38 C55 | draw strokes using media/paper settings, then one automation/recipe-style action | NOT_EXPOSED — current Live CHAT registry exposes no brush/natural-media/paper stroke authority; Recipe library is empty |
| C017 | Adobe — butterfly paintbrush/pencil | C10 C17 C29 C30 C34 | draw/edit stroke/path, repeat/duplicate structural element | PARTIAL — native Path create/edit + clone PASS; brush/stroke drawing authority not exposed to CHAT |
| C018 | Adobe — flowing ribbons | C29 C30 C31 C33 | brush/natural media + Blender/Smudge probe | NOT_EXPOSED — no brush/natural-media/Blender/Smudge capability appears in current Live CHAT registry |
| C019 | Adobe — curved text poster | C10 C14 C20 | editable text → path/warp/deformation → correction | PARTIAL — Text/Path/edit/transform PASS; text warp/deformation NOT EXPOSED |

## Cross-case capability probes

These are checked opportunistically while moving through the cases:

- C01 Document / project
- C02 Pages
- C03 Layers
- C05 Artboard / print
- C06 Canvas navigation
- C07 Selection
- C43 History
- C44 Revision
- C45 Provenance
- C46 Compare / Variant
- C52 High-resolution export
- C53 Output
- C57 CHAT control
- C58 Semantic grounding
- C59 Creative Library

Do not create a separate artwork solely for these if they can be validated naturally during the sweep.

## Explicit deferred/non-case items

The current mature-work selection does not add artworks merely to cover:

- C36 Stylus — hardware/environment lane;
- C37 Device calibration — hardware/profile lane;
- C56 Program Import — separate R&D lane;
- C60 Creative Memory / Research — later cross-case qualification.

## Finding handling

For every non-PASS result, add a record to `TEST_FINDINGS.md` with:

```text
FINDING_ID
CASE_ID
DEPLOYED_SOURCE_SHA
CAPABILITY_FAMILY
RESULT
OBSERVED
EXPECTED
MINIMAL_REPRO
CLASS
UPSTREAM_DISPOSITION
RERUN_RESULT
```

During Round 1, continue to the next case unless the current finding invalidates later tests.

## After Round 1

1. build one consolidated defect/gap list;
2. cluster findings by likely shared root cause;
3. repair the smallest coherent batches in `INK-Browser-QA`;
4. publish a new exact SHA;
5. rerun all `PARTIAL / BLOCKED / NOT_EXPOSED` rows;
6. then begin combined-capability Round 2.


## Round 1 live evidence

### Transport gate

`CHAT → GitHub SSOT request → hosted browser → Live INK → inkPublicApi → GitHub SSOT result` is operational.

Verified against deployed exact SHA `66cdb5b4ddc322a2b1027cab2627426f868027d3`:

- capability discovery: PASS;
- document context read: PASS;
- same-session proposal → approval → execute: PASS;
- Preview before/after: PASS;
- History receipt: PASS;
- Revision capture/list: PASS.

### C001

Request: `round1-C001-001`

Verified:

- `path.create.v1`: PASS;
- `text.create.v1`: PASS;
- `object.translate.v1`: PASS;
- `group.create.v1`: PASS;
- `frame.create.v1`: PASS;
- Context/History/Preview verification: PASS.

Not yet established for C001:

- C05 Artboard / print;
- C08 Smart guides / snapping;
- C09 Align / distribute;
- C39 Material system.

Separate material-library probe returned zero material entries in a fresh Live document. Material application authority exists, but an immediately reusable CHAT-visible material preset was not available in that state.


### C008

Request: `round1-C008-001`

Verified:

- native vector primitive creation: PASS;
- `boolean.apply.v1` union: PASS;
- `object.rotate.v1`: PASS;
- `repeat.radial.v1`: PASS;
- `svg.import.v1`: PASS;
- Context/History/Preview verification: PASS.

Not established in this probe:

- C08 Smart guides / snapping;
- C09 Align / distribute;
- C39 usable material catalog/apply route.


### C002

Request: `round1-C002-001`

Verified:

- Frame creation + Text creation/edit: PASS;
- object reparent into Frame: PASS;
- Frame layout metadata: PASS;
- Component registration: PASS;
- Creative Library component discovery/reuse descriptor: PASS;
- Context/History/Preview verification: PASS.

Not established:

- C02 page creation/switch mutation through CHAT;
- C22 raster/image creation/import path for this case;
- C39 material path.


### C019

Requests: `round1-C019-001`, corrected evidence run `round1-C019-002`

Verified:

- native editable Text creation/edit: PASS;
- native Path creation: PASS;
- object transform/rotation: PASS;
- Context/Preview verification: PASS.

Exposure gap:

- `describe_ink_capability("text.warp.v1")` returned `INK_CAPABILITY_NOT_FOUND`;
- no CHAT-exposed text warp/deformation route was identified in the deployed capability registry.


### C007

Request: `round1-C007-001`

Verified:

- base Path + Text creation: PASS;
- `repeat.grid.v1` variant generation: PASS;
- `object.clone.v1`: PASS;
- Context/Preview verification: PASS.

Gap:

- Creative Library search for `recipe` returned zero entries in the fresh Live document;
- this proves repeat/variant mechanics, not a complete reusable Recipe/automation workflow.


### C003

Requests: `round1-C003-binary-preflight-001`, repair, then `round1-C003-001`

Transport gap discovered and repaired during the scan:

- preflight failed with `CHAT_REFERENCE_HANDOFF_BINARY_REQUIRED`;
- Live bridge was extended to materialize a bounded fixture into a browser `File`;
- rerun imported a 1086×1448 PNG successfully through `import_ink_reference`.

Verified:

- CHAT binary Reference import: PASS;
- Reference history commit + provenance: PASS;
- `decompose_ink_reference`: PASS;
- editable post-reference Frame/Text structure: PASS.

Observation:

- decomposition returned a very large structured result (~1.8 MB), so evidence-result compaction is needed in the test transport even though the INK operation itself completed.


### C009

Request: `round1-C009-001`

Verified:

- bounded binary fixture → browser `File` → `import_ink_reference`: PASS;
- Reference decomposition: PASS;
- 1471 color Paths + 1471 line Paths created on bounded trace raster;
- two reconstructed native Paths repainted through normal proposal → approval → execute: PASS;
- Context and Preview: PASS.

Test-transport result compaction was also added: full workflow artifact remains available while the GitHub SSOT result keeps counts/samples instead of serializing every created ref.


### C004 / C005 / C006 / C012

Request: `round1-batch-C004-C005-C006-C012-001`

Verified:

- C004 compact Path + Text poster composition: PASS;
- C005 Frame + multi-Text invitation composition: PASS for the tested layout/text subset;
- C006 flyer composition: PASS;
- C006 SVG export: PASS;
- C006 PDF export: PASS;
- C012 quote-card Path + Text composition: PASS;
- combined Context / History / Preview: PASS.

### C017

Request: `round1-C017-001`

Verified:

- native Path creation: PASS;
- `path.edit.v1` anchor edit: PASS;
- `object.clone.v1`: PASS;
- History / Revision / Context / Preview: PASS.

Gap:

- current CHAT capability registry contains no brush/stroke-drawing authority equivalent to the mature paintbrush/pencil workflow.

### C010 / C011 / C014 / C015 raster-edit scan

Requests: `round1-batch-C010-C011-C014-C015-001`, corrected evidence run `round1-batch-C010-C011-C014-C015-002`

Verified:

- browser-local PNG → `import_ink_reference`: PASS;
- Context / Preview: PASS;
- PNG output: PASS.

Observed gap:

- generic clone/transform proposal against imported ReferenceImage returned `CHAT_EDIT_TARGET_LOCKED`;
- the Live capability registry returned no capability descriptor containing the distinctive raster-edit terms `mask`, `filter`, `blend`, `effect`, `adjust`, `warp`, `deform`, or `raster`.

This is a CHAT exposure/product-capability gap, not a transport failure.

### C013 / C016 / C018 exposure gate

The same exact-SHA Live capability registry scan shows no CHAT-exposed:

- raster filter / blend / effect / deformation path for C013;
- brush / natural-media / paper stroke authority for C016;
- brush / natural-media / Blender / Smudge authority for C018.

These cases therefore stop at `NOT_EXPOSED` in Round 1 rather than pretending a vector Path is equivalent to a brush/natural-media operation.
