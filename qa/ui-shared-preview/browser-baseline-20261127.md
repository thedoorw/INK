# Issue #765 — paired browser QA baseline (before 1:1 fixes)

## Provenance

- Public PR #105 commit: `e9b21b71ad7390b30e0d0759dad5e174d862cb0d`.
- Preview: `preview/ink-ui-shared/index.html` at that commit.
- Real: `index.html` at the same commit.
- Browser: Cloud Chrome; viewport `1363 × 936` CSS pixels, `devicePixelRatio = 1`.
- Compared no-document state. Preview fixture **No document** selected; Real initially displayed **No document**. The two Hosts' initially selected tools were not aligned in the remote baseline.

## Observations

| Check | Result | Evidence |
| --- | --- | --- |
| Fixed commit / URL | PASS | Both navigations loaded pages from the same exact Public commit URL. |
| Shell geometry | PASS | `#shell` `1363×936`; `#workspace` `x48 y0 1075×936`; `#rightDock` `x1123 y0 240×936` in both. |
| UI tool list | FAIL | Preview has 12 rail entries; Real has 20. |
| Customize control | FAIL | `#railCustomize` is `x8 y364 32×24` in Preview, `x8 y572 32×24` in Real. |
| Context controls | FAIL | `#contextControls` is `0×0` in Preview, `77×16` in Real; Mock shows `select`, Real shows `手繪筆 No document`. |
| Colors | STATE MISMATCH | The color panel foreground input is `#202020` in Preview and `#000000` in Real; both background inputs are `#ffffff`. |
| Recent colors | STATE MISMATCH | Preview `[ #202020, #d7eafa, #db7171 ]`, first pressed; Real `[ #202020, #ffffff, #b63c36, #d18b2f, #d7c64b, #3d875d, #2f718f, #594f9a ]`, none pressed. |
| Brushes | STATE MISMATCH | Preview range values `[24,100,100,50,100,0,0,0,0,60]` (10); Real `[12,88,82,46,95,42,36,18,60]` (9). |
| Paths | STATE MISMATCH | `Use Pen tool` `aria-pressed=false` Preview, `true` Real; compare under matched selected tool before calling structural mismatch. |
| Core canvas & Host features | OUT OF SCOPE | Real `stageWrap`/Renderer differs from Mock stage as designed. |
| Mobile/DPR 2 | NOT_RUN | Cloud Browser viewport not adjustable by the available supported API; local `/usr/bin/chromium` launcher lacked `/usr/lib/chromium/chromium`. |
| Pixel-level diff archive | NOT_RUN | Screenshots were visually inspected in Cloud Browser, but no persistent paired image artifact was generated. |

## Reproduction

1. Open the two fixed-commit URLs above under the same Chrome viewport.
2. Choose **No document** on Preview; verify Real is also in no-document state.
3. Open `色票`, `顏色`, `筆刷`, and `路徑` tabs on both sides; inspect the corresponding panel DOM and input values.
4. Read `getBoundingClientRect()` for shell, workspace, Dock, customize and context controls.
5. After Mock fixture corrections, rerun the comparison with identical selected tool and Host-independent data. Changes on new local harness are **not** covered by this baseline.

**Conclusion:** The same-commit design-shell mechanism is useful, but complete exterior 1:1 was **not yet verified** at this commit. This report must not be used as a full-source or mobile acceptance PASS.
