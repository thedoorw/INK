# INK Live Test Plan

## Purpose

This repository is the deployed test mirror for INK.

Development authority remains:
`thedoorw/INK-Browser-QA`

A Live test must always identify the exact deployed source SHA before conclusions are recorded.

## Deployment gate

Before publishing a product build:

1. current bounded development package has reached its required review/stop;
2. select one exact `INK-Browser-QA` source SHA;
3. copy/deploy only the required product files;
4. record the SHA in `BUILD_INFO.json`;
5. verify the GitHub Pages URL loads the same build;
6. only then begin Live testing.

Do not deploy a moving/unreviewed development state merely because it is the newest commit.

## Test sequence

### LT-00 — Identity / load

- GitHub Pages URL loads;
- `BUILD_INFO.json` is readable;
- deployed source SHA matches the selected source baseline;
- no missing required static assets;
- startup completes without a fatal product error.

### LT-01 — Workstation smoke test

- document opens/creates;
- canvas renders;
- Tools / Options Bar / right panels render;
- basic selection works;
- basic vector object can be created and transformed;
- undo / redo works;
- page/layer state remains coherent;
- save/export entry points remain reachable.

### LT-02 — Core mutation consistency

Focused on the current spatial-index/Lasso risk area:

- create;
- move;
- resize;
- rotate;
- duplicate;
- delete;
- undo / redo;
- group / frame / reparent;
- page switch;
- click / marquee / Lasso selection consistency.

### LT-03 — CHAT × INK qualification preparation

Use the accepted capability-qualification plan and mature-case matrix.

Do not attempt the full 19-case reproduction set first.

Begin with bounded multi-capability exercises:

- Construct;
- Reference;
- Draw.

A tool call or command return is not a PASS. Require visible/structural result plus correction and final verification.

### LT-04 — Mature-work reproduction

Only after the prior gates are usable:

- use selected mature reference case;
- analyze required INK capabilities;
- execute through INK native authorities;
- Preview / compare;
- correct;
- verify History / Revision / provenance where applicable;
- export;
- record capability gaps.

## Finding classes

Each finding must be classified as one of:

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
→ normal review / evidence
→ publish a new exact SHA to thedoorw/INK
→ rerun the same Live test
```

Never repair product source directly in this repository.
