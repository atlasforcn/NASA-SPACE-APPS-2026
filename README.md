# 山頂相儀 · Vue 3＋Vite

火星導航靜態網站：地圖探索、圖層、路線規劃與行進、DEM 地平線定位，以及 Three Forks／NASA PDS 科學站。桌面採地圖優先介面，手機可收合操作面板。

「行進中自動以地平線校正」預設開啟。規劃路線並開始行進後，於起步及每行進 250 m（全球區域任務為 4 km）擷取模擬地平線，在背景搜尋位置。可靠結果會補回搜尋期間的里程位移並校正導航估計，保留目前路線；觀測不足時保留里程推估。手動掃描仍會停止行進，成功後需重新規劃。此功能為同 DEM 模擬概念驗證。

## 開發與驗證

需要 Node.js 22.12+（建議 24）及 npm。

```sh
npm ci
npm run dev
npm test
npx playwright install chromium
npm run test:pages
npm run build
npm run preview
```

網站只需靜態 HTTP 服務，不需要後端或 Python。產物位於 `dist/`；全球 DEM 約 33 MB，建立全球區域任務時才載入，失敗可重試。

`test:pages` 對 `/` 和 `/nasa2026/` 建置驗證定位、取消與重設、路線與行進、Three Forks、全球 DEM 重試、換日線、兩極與手機畫面，另驗證正式建置。Windows 預設使用 Edge，可透過 `BROWSER_EXECUTABLE` 指定瀏覽器。截圖位於 `test-results/`；只有測試模式提供 `window.__mission`。

## GitHub Pages

在 repository 的 Settings → Pages 選擇 **GitHub Actions**。PR 和 push 執行驗證；預設分支通過後部署。工作流程從 Pages 設定取得 base，支援專案子路徑與自訂網域。本機模擬子路徑時，設定 `PAGES_BASE_PATH=/nasa2026/` 再執行 build 與 preview，瀏覽相同子路徑。

## 原始碼與資產

- `src/`：Vue 元件、共用任務狀態與定位 Worker。
- `core.mjs`、`planet.mjs`、`skyline.mjs`：網站與測試共用的計算核心。
- `data/`：必要 DEM、底圖、地質、任務、地名、PDS 原表與來源標籤。
- `docs/`：網站的來源說明與 Leaflet 授權。
- `scripts/`、`tests/`：資產檢查與網站自動驗證。

`static-assets.json` 列出靜態資產。建置前複製到自動產生的 `public/`，建置後驗證路徑、大小、SHA-256 與 HTML/CSS 引用。缺檔、大小寫錯誤、未分類檔案或雜湊不符會使建置失敗。修改資料後先檢視內容與清單，再執行 `npm run assets:update`。

## 資料限制

圖層為真實資料，觀測、車輛與漂移為模擬。Jezero 展示格網約 40 m；全球 MOLA 赤道約 3.7 km，區域採 4 km 格網。全球定位候選未校準，不自動校正。24° 為展示門檻，DEM 無法保證腳下或車輪尺度安全。來源與精度限制見 `docs/SOURCES.md`。
