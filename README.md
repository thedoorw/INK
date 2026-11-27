# INK

INK 的公開 Native Runtime、UI 原始碼與受保護發布入口。

## 現役責任與邊界

正式 INK：[thedoorw.github.io/INK](https://thedoorw.github.io/INK/)。

- **UI：** 已正式啟用 #703 的 **V2、指定 18 個路徑** Public-only UI 更新方式；在核准的路徑內，可直接修改公開 UI 程式、預覽與測試，不必每次經由舊 UI-CONVERT 重建 Core。此權限**不是**整套 UI 都已遷至 Public，也不包括 Core／Native 功能邏輯。
- **Core：** Private [`thedoorw/INK-Browser-QA`](https://github.com/thedoorw/INK-Browser-QA) 仍是 Native／Core 原始碼與正式 QA 的唯一權威。Core 更新沿用 Private 驗證、正常整合與 Static Sync009；Public UI 更新不得覆蓋 Core。
- **UI Master：** [#765](https://github.com/thedoorw/INK-Browser-QA/issues/765) 正在驗證「預覽與正式 UI 同源」；其隔離設計分支與 21-path V3 仍是**候選**，不得當成已發布的現役能力。預覽畫面相符不等於真實 Native 功能與 Windows 驗收通過。

## UI 修改與預覽

1. 先讀本頁、[Public UI 發布技術紀錄](https://github.com/thedoorw/INK-Browser-QA/blob/main/engineering/publishing/INK_UI_RELEASE_LINE_OPTIMIZATION_REVIEW_20261125.md) 與實際當次 `BUILD_INFO.json`／`PUBLISH_RECEIPT.json`；確認修改路徑是否屬於**當前正式 UI lease**。不是 lease 的路徑不得假裝走 Public-only UI 快車道。
2. 在隔離分支修改獲准 UI 原始碼，使用與本次候選相符的預覽與真實 Native 狀態比較外觀、互動、字型、快取及未修改範圍。尚未量測／未操作的部分標記 `NOT_RUN`，不宣稱完全 1:1。
3. USER 確認設計後，依現役 [Private 發布 SOP](https://github.com/thedoorw/INK-Browser-QA/blob/main/engineering/publishing/README.md) 與 [Public 驗證器](engineering/public-release/README.md) 使用受保護的 PR／必要檢查。**修改預覽不會自動更新正式站**。
4. 正式 Public 候選的 **PR、HEAD、BASE 與三項 required checks** 須實際確認；USER 對該精確候選另外核准後，才可正常合併、確認 Pages 和 Live Native。不得直接推送 Public `main`、略過檢查或繞過服務工作者／快取驗收。

對 #765 尚未共用來源的 UI 部分，仍需遵守當次正式的設計核准、轉換與真實驗證程序；**只有實際完成同源、通過驗收並正式發布後**，才可將舊 UI-CONVERT 規範退役。測試問題、缺口與能力紀錄回報 Private 權威 Issue／工作表。
