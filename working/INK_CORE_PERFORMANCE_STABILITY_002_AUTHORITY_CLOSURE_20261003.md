# Core performance stability 002 — Authority closure — 2026-10-03

STATUS = CLOSED / ACCEPTED / MERGED / DEPLOYED / FORMAL LIVE QUALIFIED

PR #146: https://github.com/thedoorw/INK-Browser-QA/pull/146
Original DEV candidate: f2dd755e54d53cd1d5f2f67b77f6d17917ade31a; return 72a4850d42fd58a5289eaf3d4e69e19c3272334d.
Browser-tested integration candidate: 87158d5c372cfd40deff5ee6c887ddecbc7a4e69.
Final PR candidate: 6d426f75f852e86528d39d71548f16a3fa7c6a2c.
Merged/deployed source: f56e492af4954ae6da3be39cf10d2dbe2859d87e.
Product/source tree: ed54c54c458859b1f39f785fa4cd45cde07d6d3f; source entry blob: 413f5eb4c5f1de8baa04b4eabd699e22f23a5fae.
Final integrated product tree matches the browser-tested candidate exactly; later changes were QA/documentation only. No repeated candidate run is claimed for identical product bytes.

## Accepted change

Existing studio-core Renderer image-stack cache no longer includes global document modifiedAt for external-source images. Source, adjustments, filters, effects and raster mask remain canonical cache identities. Raster-state images retain document modifiedAt because native History restores raster content. One existing cache, one Renderer, unchanged Image Core/History/FORMAT_VERSION/UI authority.

## Validation

- 23 local checks PASS: package 002, package 001, singleton Paper, WebGL Paper roughness, existing History. Existing relocated History tests required temporary source-path resolution; no production/test source change for that resolution.
- Candidate browser run 37107672964, request commit 39235f0ea86923d0ad35b2ac092fe919a291b141, artifact 11268232713, digest sha256:1104ecc8d78facf5680670e77ad7df64f24e1c2a31780995ce87d18f85a72654.
- Real browser Canvas2D confirms retained cache on unrelated edits, exact fresh-pixel parity, adjustment/source/raster invalidation, exact stack-state roundtrip, raster/external transition, clear/rebuild.
- Each qualified B2 family separately passed: brightnessContrast, gaussianBlur, multiply, colorOverlay, twirl; Preview and exact Undo/Redo included.
- Candidate A1/A2/A3/A5/B4, Raster Mask/source Retouch/advanced ingest regressions PASS.
- Pages deployment 37107901593 PASS; mirror commit c78c122d2257ecb352694f500b3f1e3f32b5d4c5. Existing accepted CSP/base wrapper preserved.
- Formal Live run 37107942149, request commit d4932758768cf2382c802881cc49e8b10209b0ee, artifact 11268014431, digest sha256:55115c7632bcc7207e98a4acfce44d71b0cecd23d5e80cc061ace250812f5386.
- Formal Live source identity exact; apiReady=true; 23 tools. Five B2 families Preview and Undo-before/Redo-after hash equality PASS. Cache pixel hashes match candidate. Natural-media cache warm bypass/invalidation/transient/eviction controls PASS. B4 all three operations/reset/reapplication/distinct semantics PASS. C1 create/rename/duplicate/activate/delete, no-History activation, delete Undo/Redo, minimum-page rejection PASS.

## Performance bounds and retained finding

Formal Live 64x48 cache workload: cold 3.7000000000116415 ms; warm 0.29999999998835847/0.20000000001164153/0.20000000001164153/0.20000000001164153 ms. This is a bounded real Canvas2D reuse check. No before/after browser performance ratio, GPU frame timing, heap/leak or large-document claim. Original DEV timings remain isolated-harness evidence.

Initial full-B2 run 37107512936 stopped at old opaque-image dropShadow RENDER_UNCHANGED. Baseline run 37107617887 reproduced identical failure on unchanged 0793cdbe0d72115962c23ee31353304babfe5472. Evidence retained; this is a pre-existing shadow fixture/behavior finding requiring separate disposition, not a new cache regression. No dropShadow qualification claimed; independent qualified B2 checks remain strict.

## Disposition

CORE_PERFORMANCE_STABILITY_002 = CLOSED
FORMAL_RUNTIME_ACCEPTANCE = PASS
FORMAL_LIVE_ACCEPTANCE = PASS
UI_AUTHORITY = UNCHANGED
FORMAT_VERSION = 4 / UNCHANGED
NO_SECOND_AUTHORITY = CONFIRMED

Manifest: qa/evidence/ink-core-performance-stability-002/authority-evidence-manifest.json
Formal result: qa/evidence/ink-core-performance-stability-002/authority-formal-live.json
Existing UI/capability owners continue; no next optimization package is automatically started.
