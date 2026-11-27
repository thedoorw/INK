# Issue #765 — paired Browser QA, Public Draft PR #105

## Exact provenance

- Public HEAD: `165ae98b8c76fefe65f36699e015bbb9191d3987`.
- Preview: `preview/ink-ui-shared/index.html` from the same HEAD, Mock Host.
- Real: `index.html` from the same HEAD, Native Real Core.
- Browser: Cloud Chrome `1363 × 936` CSS viewport, DPR `1`; same remote browser and font environment.
- All ten Dock panels were clicked in both pages and inspected with live DOM, `getComputedStyle()` and `getBoundingClientRect()`.
- Normalized DOM comparison removed only volatile inline `style` and `data-native-target` strings; input values, pressed flags, panel HTML and visible text were compared separately.

## Same-source exterior / no document

Compared Preview `?state=empty&tool=pen&clean=1` with Real initial no-document state.

| Check | Observed |
| --- | --- |
| Tools (IDs, labels, SVG markup) | **20/20 exact match**; same order and exact icon `innerHTML`. |
| Customize control | **Exact geometry** `x7.5 y572 32×24` both. |
| Shell | **Exact geometry** `0,0 1363×936`. |
| Workspace | **Exact geometry** `x48 y0 1075×936`. |
| Right Dock | **Exact geometry** `x1123 y0 240×936`. |
| Footer context controls | **Exact geometry** under `tool=pen` (`contextControls` `x584.9765625 y896 w77.0625 h16`, `contextToggle` `x508.9609375 y893 w28 h22`). |
| Dock panel computed CSS | **10/10 exact** (sampled display, position, padding, margin, background, color, font, border, flex/grid). |
| Dock panel bounding rect | **10/10 exact**. |
| Panel inputs and pressed flags | **10/10 exact**. |
| Normalized panel DOM | **9/10 exact**; Brush panel labels differ: Mock `紋理 / Brush grain`, Real `刷毛 / Brush bristle` (value `18` in both). |

**Default-state caveat:** Without an explicit `tool=` query, the remote Mock defaults to `select` while Real no-document Runtime initially selects the Native `pen` tool (`手繪筆`); that changes the footer text and horizontal centering. The first comparison with `tool=brush` also showed a 6-pixel shift due to a different displayed label. In a matched `tool=pen` state the geometry is **exact**. The main agent reports a local fix to the default and Brush label; that unpushed fix was **not** counted as Browser PASS here.

## Fresh A4 state

Real: UI menu **檔案 → 新增文件…**, default `210 × 297 mm`, `300 PPI` (`2480 × 3508 px`), then **Create**; document rendered in Native Core. Preview: `?state=a4&tool=pen&clean=1`.

| Check | Observed |
| --- | --- |
| 10 Dock CSS and bounding rects | **10/10 exact**. |
| Normalized Dock DOM | **7/10 exact**. |
| Navigator | Real displays an actual `data:image/png` thumbnail; Mock shows `Preview unavailable` by design (Host-specific; mask for shared-shell comparison). |
| Brushes | Same one label mismatch (`grain` vs `bristle`) as no-doc. |
| Layers | Mock A4 has `圖層 1` + `背景`; freshly created Native A4 has only `圖層 1`. Dynamic UUIDs require ID normalization, but extra Mock row is a real fixture mismatch. |
| Context tool options | **NOT SAME UI**: Real `pen` displays editable `Size px=2`, `Opacity%=100`, `Smoothing%=66`, and `更多` with `Pressure%=15`, `Taper%=4`. Mock only displays `Size px 12` as static status; no inputs/menu. Requires a safe presentation-only Workbench seam or explicit HOLD, not a CSS change. |

Real A4 artboard/canvas and Mock page should remain different Host surfaces; do not score their pixels as same-source UI.

## Selected vector state

Real: on the fresh A4, select Native `直線` shape tool, drag `425,360` to `590,510`. A rendered line and selection handles appeared; History gained `繪製幾何`. Preview: `?state=selection&tool=line&clean=1`.

- Dock CSS and bounding rects: **10/10 exact**.
- Normalized Dock DOM: **6/10 exact**. The four differences: Navigator real thumbnail; Brushes `grain/bristle`; Layers extra Mock background row and Host IDs; History Mock has only `History start` while Real also has `繪製幾何`.
- Footer context options: **NOT SAME UI**. Real Native Shape workbench exposes `Shape=line/arrow/rect/ellipse/triangle`, `Fill new=Off/On`, selected-object `W/H`, plus `更多` with Rotate/Object fill. Mock shows `No applicable tool options`.
- Selection outline and real canvas objects are Native Renderer/Host-owned and intentionally **not copied into Mock Stage**.

## Mobile and persistence

- Mobile viewport `390×844` / `768×1024`, DPR2: **NOT_RUN**. Cloud Browser exposed only its fixed `1363×936` viewport. Local Playwright's `/usr/bin/chromium` launcher existed but the underlying `/usr/lib/chromium/chromium` binary was absent. An isolated native Chromium window was opened and closed without changing the original user window. Browser DevTools was explicitly disallowed by organization policy; no bypass was attempted. Standard window-resize actions did not produce a smaller viewport.
- Pixel-difference artifacts: **NOT_RUN**. Screenshots were visually inspected in the Browser QA activity, not saved as persistent paired files.
- Pages / SW / offline / Drive: **NOT_RUN** (outside this design-preview QA).

## Acceptance verdict

**PARTIAL PASS, not complete 1:1.** The exact same Public shell, tool icons and all ten Dock module styles are visible in both. The Native tool-option Workbench remains a substantive presentation gap; Mock/Native A4 and selected-state fixture data still differ. The same-source guard and UI release gate must not treat this report as full acceptance.

No Core, workflow, main branch, PR or release operation was performed by this QA agent.
