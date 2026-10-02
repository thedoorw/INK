# INK Live Test Plan

## Purpose

This repository is the deployed test mirror for INK.

Development authority remains:
`thedoorw/INK-Browser-QA`

The primary purpose of the current Live lane is to test whether INK can actually be used to draw and support a complete drawing workflow. UI incompleteness is recorded when it blocks or degrades drawing, but it is not the main test target by itself.

A Live test must always identify the exact deployed source SHA before conclusions are recorded.

## Deployment gate

Before publishing a product build:

1. select one explicit `INK-Browser-QA` source SHA;
2. publish the required product build to `thedoorw/INK`;
3. record the SHA in `BUILD_INFO.json`;
4. verify the GitHub Pages URL loads that build;
5. then run the drawing tests.

Do not treat a moving `main` as the deployed identity.

## Test sequence

### LT-00 — Load preflight

This is only a prerequisite, not the main test.

- Live URL loads;
- `BUILD_INFO.json` identifies the deployed source SHA;
- canvas can initialize;
- no fatal startup error prevents drawing.

### LT-01 — Basic drawing

Primary first test.

- Pencil stroke;
- Brush stroke;
- Eraser;
- short stroke / long stroke;
- slow stroke / fast stroke;
- curves and direction changes;
- repeated strokes;
- foreground/background color use where applicable;
- visible stroke result matches the executed input closely enough for drawing.

Record:
- missed or broken strokes;
- unexpected joins/gaps;
- cursor/stroke-size mismatch;
- latency or visible lag;
- rendering artifacts;
- tool-state failures.

### LT-02 — Drawing + navigation

Verify that drawing remains usable while operating the canvas.

- zoom in / out;
- pan;
- rotate/reset where supported;
- draw at different zoom levels;
- draw near canvas/page edges;
- continue drawing after navigation;
- selection must not unexpectedly capture or move drawing objects.

Known UI/capability gaps may be recorded but do not automatically stop the drawing test unless they prevent the workflow.

### LT-03 — Drawing edit / history / structure

- undo / redo strokes;
- erase then undo / redo;
- layer creation and switching;
- visibility / lock where exposed;
- duplicate / delete selected drawing content where applicable;
- move / resize / rotate selected content where applicable;
- save/reload or equivalent persistence check;
- page/layer state remains coherent.

This stage also catches spatial-index / selection consistency defects exposed by real drawing.

### LT-04 — Drawing output

- preview remains visually consistent with the working canvas;
- export a representative drawing;
- verify exported dimensions / background / crop or page scope as applicable;
- compare exported result with the visible drawing;
- record clipping, scaling, missing-content or fidelity defects.

### LT-05 — CHAT × INK Draw qualification

After manual/basic drawing behavior is usable, test whether CHAT can operate the same drawing capabilities through INK's public/control surface.

Start with the `Draw` bounded multi-capability exercise before expanding to `Construct` or `Reference`.

A command/tool return is not a PASS. Require:

```text
execute
→ visible result
→ inspect
→ correct
→ verify final result
```

### LT-06 — Mature-work drawing reproduction

Only after the drawing workflow is usable:

- choose one selected mature drawing/painting reference case;
- analyze the required INK capabilities;
- reproduce it through INK;
- Preview / compare;
- correct;
- verify History / Revision / provenance where applicable;
- export;
- record capability and workflow gaps.

Do not start by trying to cover every mature-work case.

## Finding classes

Each finding must be classified as one of:

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
→ repair only in thedoorw/INK-Browser-QA
→ focused QA / required review
→ publish a new exact SHA to thedoorw/INK
→ rerun the same drawing test
```

Never repair product source directly in this repository.
