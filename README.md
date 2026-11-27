# INK

INK 的公開 Native Runtime、UI 原始碼與受保護發布入口。

## 現役責任與邊界

正式 INK：[thedoorw.github.io/INK](https://thedoorw.github.io/INK/)。

- **UI：** 已正式啟用 #703 的 **V2、指定 18 個路徑** Public-only UI 更新方式；在核准路徑內可直接修改公開 UI 原始碼，不必經由舊 UI-CONVERT 重建 Core。#765 將共用純 View 整合在同一份 V2 18-path 來源中；[Public UI-first PR #107](https://github.com/thedoorw/INK/pull/107)（HEAD `05409eab`）仍待正式核准，**不是已發布版本**。Public 不擁有 Core／Native 功能邏輯。
- **Core：** Private [`thedoorw/INK-Browser-QA`](https://github.com/thedoorw/INK-Browser-QA) 仍是 Native／Core 原始碼與正式 QA 的唯一權威。Core 更新沿用 Private 驗證、正常整合與 Static Sync009；Public UI 更新不得覆蓋 Core。
- **UI Master：** [#765](https://github.com/thedoorw/INK-Browser-QA/issues/765) 採用既有 **V2 18-path 同源架構**，不是另設 21-path V3。隔離 [Mock Preview 候選](https://github.com/thedoorw/INK/tree/ed0f544c02da12108cdf2e24ec90b7c70c3d819b)（`ed0f544`）與 #107 的 18 個 UI Git blob 已核對一致；Private Native／Core 對應來源 `cc11fd2` 仍須獨立驗證及發布。Preview 不是正式 Live，也不會執行真實文件／Drive 功能。

## UI 修改與預覽

1. 先讀本頁、[Public UI 發布技術紀錄](https://github.com/thedoorw/INK-Browser-QA/blob/main/engineering/publishing/INK_UI_RELEASE_LINE_OPTIMIZATION_REVIEW_20261125.md) 與正式 `BUILD_INFO.json`／`PUBLISH_RECEIPT.json`，確認當次核准的 **18-path UI lease**。其他路徑仍須走相應 Private／Native 流程。
2. AI 在 Public 隔離分支直接修改這一份 UI 原始碼。透過已併入 Private 的 [UI Master Preview 工具（#768、#769）](https://github.com/thedoorw/INK-Browser-QA/pull/768) 載入同一份檔案，修改後即時重載藍圖；從 Private repo 根目錄執行 `node qa/ui-master-preview-765/start.mjs /ABS/PATH/TO/PUBLIC_INK_CLONE`。工具使用獨立 localhost Mock，不會觸碰正式 INK 儲存資料。
3. USER 確認設計後，使用 [Public 驗證器](engineering/public-release/README.md) 及 [Private 發布 SOP](https://github.com/thedoorw/INK-Browser-QA/blob/main/engineering/publishing/README.md) 準備**既有 V2 18-path** Public 候選，不另做 UI-CONVERT。預覽與提交的 UI blob 必須對應同一精確版本；Mock 外觀一致不代替 Native 功能驗收。
4. 讀回 Public 候選的 **PR、HEAD、BASE 與三項 required checks**；USER 對該精確候選另行核准後，才能正常合併、確認 Pages、Live Native、服務工作者和快取。修改藍圖**不會自動更新正式站**，也不得直接推送 `main` 或繞過保護。

目前同源 Preview 仍在隔離設計分支，**尚無永久公開的 Pages 預覽入口**；已合併的 Private 工具是本地設計／QA 能力，不是 Public Runtime。正式線是否包含 #107 與 `cc11fd2`，以實際合併、發布收據和 Live 驗收為準。所有未測範圍標記 `NOT_RUN`，問題回報 Private 權威 Issue／工作表。
