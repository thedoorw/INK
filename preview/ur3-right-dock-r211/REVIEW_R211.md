# UR3 R2.11 — Single-round Draft Review / Fidelity Gate (2026-10-26)

**STATUS: DRAFT_STATIC_QA_PASS / USER_VISUAL_REVIEW_PENDING / NATIVE_NOT_CHANGED / PUBLIC_NOT_RELEASED**

This is a **standalone preview**, not Native INK Web/Portable. It reuses the confirmed R2.10 preview (commit `d626b1b7de0204027a41bebd4a28dc9f940bd9fb`). The source-of-truth for user-visible layout is the fixed HTML in this directory; the released INK Runtime has NOT been edited here.

## USER's eight bounded UI findings

| ID | Finding | R2.11 standalone review representation | Actual Native status |
|---|---|---|---|
| 01 | New Document brings a stray gray strip / cropped right Dock header | Standalone illustrative New Document overlay; opens without inserting any header strip, focuses with `preventScroll` | **NOT FIXED**. Must identify native modal → Dock scrolling/focus cause with Web/Portable DOM coordinates before editing. |
| 02 | Dock default and min must be 240px | `--dock:240px`, `min-width:240px`, resize clamps to 240..520px | **NOT FIXED** |
| 03 | Horizontal range thumbs disagree in size/shape | One `::-webkit-slider-thumb` and one `::-moz-range-thumb` rule, shared 11×11px five-sided PS shape; 2px track | **NOT FIXED** |
| 04 | Vertical hue arrow oversized, endpoint clips | Matching 11×11px right-pointing five-sided shape; `top: calc(percent + edge offset)`, handles initially hidden Color pane; drag and keyboard range preserved | **NOT FIXED** |
| 05 | Scrollbars differ between panels | Uniform 6px track; leave thumb length proportional to content | **NOT FIXED** |
| 06 | Layer opacity falsely squeezed next to blend mode | Blend-mode select left; number 0..100 at right with unit; pop-up slider only on button click; numeric and slider synchronized | **NOT FIXED** |
| 07 | Color-plane circular selection marker clips at black/borders | 9px circle, pointer selection clamped 5px inside all four edges | **NOT FIXED** |
| 08 | Foreground/background chips differ from Photoshop / draft | Pure-color 20×20px squares: foreground x3/y2 over background x13/y12; one exterior border + foreground white inset; no native `input[type=color]` rendering in the draft | **NOT FIXED** |

Keep color demo values separate from actual Native user colors; do not force current Native black/white into demo red or vice versa. Never replace the Native color picker with a visual-only mock.

## Self-check, bounded to draft source

- Ten required tabs and ten panel containers: **PASS** (1 tab per panel).
- All four visible range controls use shared `.ps-range` class; single WebKit thumb rule and single Firefox thumb rule: **PASS**.
- Shared thumb 11×11px, 2px track, scrollbar width 6px: **PASS by CSS source**.
- Native-facing cursor expectations: navigator cursor default, Dock boundary ew-resize: **PRESERVED**.
- Layer opacity number, toggle popup, value binding: **PASS by source**.
- Color indicator dimensions and horizontal / vertical end-point clamps: **PASS by source**.
- Standalone dialog has no Native file-creation/storage operations: **PASS by source**.
- Two JS script chunks parse without errors: **PASS**.
- Branch versus Public main changes only preview HTML and this review note: **PASS after this commit**, subject to re-check.
- Actual Chrome computed CSS/layout, screenshots at 1280×1024 and 240/274 Dock, per-tab scrolling and drag interactions: **NOT YET EXECUTED**, not a PASS.
- User's visual approval of this complete R2.11 revision: **PENDING**.

## Prevent another misleading publication

1. **Stage 1 (this branch)** — USER reviews fixed standalone draft at the immutable commit URL; source checks do not replace rendered Chrome screenshots or USER approval.
2. **Stage 2** — only after visual signoff, create bounded Private Native implementation; compare actual Web and Portable assembled UI at 1280×1024, no doc / doc / New Document, widths 240px and 274px. Fix issue 01 in the actual Native modal + Dock integration; preserve existing save/history/IndexedDB.
3. **Stage 3** — publish only the exact accepted Private source commit/product tree via qualified Transport009 request, pinned Public head, independent Public Draft review and Pages/Live Build ID verification. Do not infer acceptance from GitHub Pages deployment alone. No unmerged Startup work, unrelated UI, user data clearing, or automatic merge ahead of stage gates.

**USER reference ledger:** Private `thedoorw/INK-Browser-QA/working/ur3-right-dock-003/UR3_DRAFT_VISUAL_DECISION_LEDGER_20261024.md`; PSD reference index `PS_VISUAL_REFERENCE_CANONICAL.md`. Newer USER decision overrides historical 252px default/min: current **240px default + minimum**.
