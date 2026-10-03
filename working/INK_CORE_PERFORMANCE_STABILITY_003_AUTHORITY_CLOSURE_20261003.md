# Core performance stability 003 — Authority closure — 2026-10-03

STATUS = CLOSED / ACCEPTED / MERGED / DEPLOYED / FORMAL LIVE QUALIFIED

PR #150: https://github.com/thedoorw/INK-Browser-QA/pull/150
DEV candidate: b7b4f95f4cec1e5827b537040f916556eeef9b98; DEV return: c721d5c213c8a8945ca20968a329a1ed8aa94fb3.
Authority browser candidate: 28537865a90843b4176c103f09452177fedf2544; final integration candidate: d4dcb3edcf216fc37ae9c1d4362048084e3bbed3.
Merged/deployed source: e139682a8c374e275061872ba9f27bc06ca0d492.
Product/source tree: ee2896ae0272afe4963d85de99b5f878769596dc; source entry blob: 413f5eb4c5f1de8baa04b4eabd699e22f23a5fae.
Integrated product tree exactly equals browser-tested composition; intervening mutations were QA/documentation only. No repeated browser run is claimed for identical product bytes.

## Accepted repair

PageSpatialIndex.syncObjects deduplicates ids once. Unique batches above existing quadtree capacity use the existing rebuild once; small batches retain incremental synchronization. One production file, 6 additions/1 deletion; no new cache, spatial authority, Renderer, History, UI or FORMAT_VERSION.

## Evidence

46 focused/spatial/History/selection/package001/package002 local checks PASS. Relocated existing spatial/History tests used temporary qa/core/src source-path resolution; no committed source mutation.
Candidate request 5bc37fcf337d1433be067c4be44fd0681bfb0ade, run 37109713821, artifact 11269475908, digest sha256:6d3d28ff3fbed1ac0f6ea1b07567aa9c51129e5e3c1e3ef2ebd95b8d0a347679: PASS.
- Primary C2 align/distribute and native 16-Path CHAT create/align PASS.
- One full rebuild, zero per-object incremental updates; exact fresh-index metadata and query parity.
- Observable Renderer delta; Preview; exact geometry and pixel Undo/Redo.
- 3000-object native-Path-derived fixture /100-target batch /20 cycles retained exact index cardinality and final fresh-query parity.
- A1/A2/A3/A4/A5/B2/B4/C1/C3 affected regressions PASS.

Pages deployment run 37109905667: PASS; mirror commit 1e675c44ec1e30790702bf3a3e99b67bfc5ea87e; existing accepted CSP/base wrapper preserved.
Formal Live request 9d541197ad85a42f7cd38c094c1d434a4eb087c9, run 37109933114, artifact 11269336938, digest sha256:0ef52e90d29c8a8bfdfe31c2a61304d922cc07110748809f8e3979ab6fa597b7: COMPLETED/PASS.
Exact source e139682a8c374e275061872ba9f27bc06ca0d492, apiReady=true,23 tools. Native16-object batch one-rebuild,query/metadata parity,Preview,exact Undo/Redo PASS;3000-object/100-target/20-cycle checks PASS. Existing image-stack and natural-media cache/invalidation/transient controls PASS; B4 warp/distort/perspective/reset/reapply/distinct semantics PASS; prior C3 snap/guide public steps completed successfully, including Undo/Redo.

## Measurement boundaries

DEV measurements are isolated algorithm timings. Independent authority Node24 7-trial controls reproduced the bottleneck:3000/100 median73.983→1.387ms;10000/13 median39.282→4.795ms;10000/250 median588.187→5.130ms. These are not browser-frame/GPU timing claims.
Formal Live bounded cycle times are recorded verbatim in the evidence manifest.20 cycles is repeated-operation coverage, not hour-long endurance. No heap profiler evidence; no memory leak, memory improvement, long-duration stability or browser speedup ratio claim. This closes the proven batch-synchronization repair only.

CORE_PERFORMANCE_STABILITY_003 = CLOSED
FORMAL_RUNTIME_ACCEPTANCE = PASS
FORMAL_LIVE_ACCEPTANCE = PASS
FORMAT_VERSION = 4 / UNCHANGED
UI_AUTHORITY = UNCHANGED
NEXT_OPTIMIZATION_PACKAGE = NOT_AUTOMATICALLY_STARTED

Existing capability/UI/C06 owners continue. Pre-existing dropShadow finding remains separate and untouched.
Manifest: qa/evidence/ink-core-performance-stability-003/authority-evidence-manifest.json
