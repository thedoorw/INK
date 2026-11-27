# INK

正式 INK：[https://thedoorw.github.io/INK/](https://thedoorw.github.io/INK/)

本儲存庫是 INK 的 Public Runtime，也是**已正式核准的 V2 指定 UI 原始碼**來源；不再只是唯讀部署鏡像。

## UI／Core 權責

- **UI（Public）：** #703 已驗證可直接在本儲存庫修改、預覽及發布的範圍，**僅限** `BUILD_INFO.json` → `ui_release.files` 列出的 V2 **18 個指定路徑**。這不代表整套 UI 已獨立，也不需要對這 18 路徑重新執行舊 UI-CONVERT。
- **Core／Native（Private）：** 仍以 [thedoorw/INK-Browser-QA](https://github.com/thedoorw/INK-Browser-QA) 為開發與 QA 權威。Core 更新沿用 [Static Sync009 正式 SOP](https://github.com/thedoorw/INK-Browser-QA/blob/main/engineering/publishing/README.md)，不得覆蓋已核准的 Public UI；不要在 Public 直接開發 Core 功能。
- **發布身分：** `BUILD_INFO.json`、`PUBLISH_RECEIPT.json` 記錄正式載入的 Core／UI 來源。Preview 分支與未合併的 PR **不是正式版本**。

## UI 修改與發布（指定 V2 18 路徑）

1. 從最新 Public `main` 建立隔離分支，只修改已核准的 UI 路徑；修改同一份 HTML／CSS／JavaScript 元件並預覽。模擬 Core 的預覽不等於正式 Native 功能驗收。
2. 對實際變更做必要的 UI／互動與來源檢查；建立 Public PR，確認未改 Core、Service Worker 或其他未授權路徑。
3. 正式發布前，檢查 Public PR 的 **exact HEAD／BASE、diff**，以及三項 `public-release-*` required checks **全部 SUCCESS**，再交由 USER 對該精確版本作**第二次正式發布核准**。
4. 取得核准後才正常合併 Public PR；確認 Pages、正式 Browser 載入、版本身分及受影響功能。未測項目如實標示 `NOT_RUN`。

UI-only 修改不必重新發布 Core。Core 發布也不得把已核准的 Public UI 換回舊版。未納入 V2 18 路徑的產品 UI 仍依 Private 現行規範處理；Public 自有靜態資產（例如 `assets/favicon-user.png`）則依既有檔案權責與核准流程小修，不因此擴張 18 路徑 UI 租約。
