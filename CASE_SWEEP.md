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
| C001 | Figma — minimal poster | C03 C05 C08 C09 C11 C13 C15 C16 C20 C39 | create text + shape, align/snap, transform, group/frame, apply material | PENDING |
| C002 | Figma — year-in-review deck | C02 C18 C19 C20 C22 C39 | create/switch page, text+image hierarchy, layout/component/reuse probe | PENDING |
| C003 | Figma — reference → portfolio design | C07 C19 C22 C40 C42 | import reference, select/target, create editable structure/layout | PENDING |
| C004 | Figma — concept poster | overlap check | short poster probe only where it exercises a path not already proven by C001 | PENDING |
| C005 | Adobe — invitation | mixed text/layout/image | quick text + image + layout/edit probe | PENDING |
| C006 | Adobe — promotional flyer | layout/output | assemble minimal flyer structure and verify output route | PENDING |
| C007 | Adobe — social ads | C55 automation | create one base design, run one repeat/automation-style variant step | PENDING |
| C008 | Adobe — geometric logo | C08 C09 C10 C11 C12 C13 C17 C21 C39 | path/shape → boolean → align → repeat → SVG round-trip | PENDING |
| C009 | Canva — Run Club poster | C40 C41 C42 | import/reference → extraction/reconstruction → editable correction | PENDING |
| C010 | Canva — campaign visual | C22 C23 C40 C42 | raster import → mask/targeted edit → transform/reconstruction probe | PENDING |
| C011 | Canva — pastry hero image | C22 C23 C26 | raster + mask + blend/composition probe | PENDING |
| C012 | Canva — quote card | overlap check | use only to confirm any still-unproven text/format/reuse path | PENDING |
| C013 | Figma — layered shader artwork | C14 C22 C25 C26 C27 C39 | raster/object → deformation/filter/blend/effect/material probe | PENDING |
| C014 | Adobe — surreal texture/light poster | C22 C25 C28 C46 | reusable raster source → filter → compare/before-after | PENDING |
| C015 | Adobe — billboard mockup | C14 C22 C24 C28 | reusable raster instance → deformation → adjustment | PENDING |
| C016 | Adobe — watercolor/oil/pencil/cartoon action | C29 C30 C31 C38 C55 | draw strokes using media/paper settings, then one automation/recipe-style action | PENDING |
| C017 | Adobe — butterfly paintbrush/pencil | C10 C17 C29 C30 C34 | draw/edit stroke/path, repeat/duplicate structural element | PENDING |
| C018 | Adobe — flowing ribbons | C29 C30 C31 C33 | brush/natural media + Blender/Smudge probe | PENDING |
| C019 | Adobe — curved text poster | C10 C14 C20 | editable text → path/warp/deformation → correction | PENDING |

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
