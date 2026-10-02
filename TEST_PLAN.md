# INK Live Test Plan

## Purpose

This repository is the deployed test mirror for INK.

Development authority remains:
`thedoorw/INK-Browser-QA`

The Live lane validates whether INK's practical creative capabilities actually work in use. The current method is **breadth-first**: quickly probe every selected mature-work case and its mapped capabilities before spending time completing one whole artwork.

A Live test must always identify the exact deployed source SHA before conclusions are recorded.

## Strategy

```text
Round 1 — case-by-case capability sweep
→ record PASS / PARTIAL / BLOCKED / NOT EXPOSED
→ collect defects and gaps
→ repair a bounded batch in INK-Browser-QA
→ republish exact SHA

Round 2 — rerun failed/weak probes + combine related capabilities
→ verify functions still work together
→ collect integration defects
→ repair / republish / rerun

Round 3 — complete representative artworks
→ end-to-end workflow
→ Preview / correction / History / Revision / export
→ mature-work reproduction evidence
```

Round 1 does **not** try to finish each artwork. Each case should be reduced to the smallest useful probe that exercises its distinctive mapped capabilities.

## Round 1 — breadth scan rules

For each candidate case:

1. identify its distinctive mapped capability families;
2. perform only 1–3 minimal operations needed to exercise them;
3. observe the actual visible/structural result;
4. make one small correction if the operation is editable;
5. classify the result;
6. move immediately to the next case unless the defect prevents further testing.

Result classes:

- `PASS` — usable for the intended probe;
- `PARTIAL` — works but with a material defect or missing sub-operation;
- `BLOCKED` — cannot complete the probe;
- `NOT_EXPOSED` — capability exists/planned but cannot be reached through the current usable surface;
- `TEST_ENVIRONMENT_LIMIT` — current environment prevents a valid test.

A source symbol, menu item, tool call, or command return by itself is **not** a PASS.

## Round 1 stop rule

Do not stop the whole sweep for an isolated defect.

Record it and continue unless:

- the app cannot initialize;
- document/canvas state becomes corrupt;
- the defect destroys later test validity;
- continuing risks overwriting evidence or product data.

After the first sweep, group findings by shared root cause before repairing them.

## Round 2 — combined capability checks

After the first repair batch, combine capabilities that commonly occur together:

- drawing + navigation + erasing + history;
- vector path + shapes + boolean + align;
- text + hierarchy + layout + transform;
- raster + mask + adjustment/filter/blend;
- reference import + extraction/reconstruction + transform;
- repeat/material/component + reuse;
- Preview/compare + correction + Revision/provenance;
- output/export after mixed-content editing.

Round 2 exists to find failures that isolated probes cannot reveal.

## Round 3 — representative finished works

Only after the major Round-1/2 blockers are cleared:

- select representative mature-work cases;
- reproduce complete works;
- Preview / compare;
- bounded correction;
- verify History / Revision / provenance;
- export;
- record final capability/workflow gaps.

## Drawing priority

Drawing remains a primary creative path. The breadth scan must include:

- Pencil / Marker / Brush / Airbrush / Eraser;
- brush preset/engine behavior;
- natural-media modes;
- dynamics where testable;
- Blender / Smudge;
- stroke editing/session;
- drawing + zoom/pan;
- undo/redo and layer interaction;
- export fidelity.

UI incompleteness is recorded when it blocks or degrades a capability, but visual UI polish alone is not the purpose of this lane.

## Finding classes

Each finding must be classified as one or more of:

- DRAWING_DEFECT
- PRODUCT_DEFECT
- CHAT_EXPOSURE_GAP
- TARGETING_GAP
- PREVIEW_FEEDBACK_GAP
- HISTORY_REVISION_GAP
- WORKFLOW_USABILITY_GAP
- DEPLOYMENT_GAP
- TEST_ENVIRONMENT_LIMIT

## Repair rule

```text
Live finding in thedoorw/INK
→ record exact deployed SHA
→ reproduce/classify
→ continue Round-1 sweep when safe
→ group related findings
→ repair only in thedoorw/INK-Browser-QA
→ focused QA / required review
→ publish a new exact SHA to thedoorw/INK
→ rerun failed/weak probes
```

Never repair product source directly in this repository.

Current case queue and per-case probe definitions:
`CASE_SWEEP.md`
