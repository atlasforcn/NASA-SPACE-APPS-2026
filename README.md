# 山頂相儀 · Vue 3 / GitHub Pages

Vue 3＋Vite 火星導航展示：大型地圖、探索／任務／圖層側欄與地平線定位結果，手機可收合操作面板。保留 Three Forks 考察、NASA PDS 科學站與 CP-01 情境。

## 開發與驗證

需要 Node.js 22.12+（建議 24）與 npm。

```sh
npm ci
npm run dev
npm test
npx playwright install chromium
npm run test:pages
npm run build
npm run preview
```

`test:pages` 對實際建置產物分別測試 `/` 與 `/nasa2026/`：Worker、完整／遮擋觀測、取消與重設、路線與行進、Three Forks、全球 DEM 重試、換日線、兩極、圖層、文件及 390px 手機畫面，另驗證正式建置。Windows 預設使用已安裝的 Edge，可用 `BROWSER_EXECUTABLE` 指定瀏覽器。截圖輸出至 `test-results/`。測試模式才提供 `window.__mission`。

## GitHub Pages

連接 GitHub repository 後，至 Settings → Pages 將 Source 設為 **GitHub Actions**。提交鎖定檔及 `static-assets.json` 中所有 publish 來源。PR 與 push 執行驗證；預設分支驗證通過後部署。部署 base 由 Pages 設定取得，支援專案子路徑與自訂網域。目前尚未設定 Git remote。

本機模擬子路徑時，設定 `PAGES_BASE_PATH=/nasa2026/` 再執行 build 與 preview，瀏覽相同子路徑。一般本機與離線建置使用預設 `/`。

## 靜態資產

`static-assets.json` 逐檔分類發布與 repository 專用資產。建置前將 publish 來源複製至 `public/`；建置後比對路徑、大小與 SHA-256，檢查 HTML/CSS 連結。新增未分類資產、缺檔、大小寫錯誤與雜湊不符皆使驗證失敗。修改或新增資料時先明確分類，再執行 `npm run assets:update`。

發布必要 DEM、光學與地質圖層、地名、PDS 原表、來源文件。科學原始檔、評估報告及影片留在 repository，不發布到網站。全球數值 DEM 約 33 MB，首次建立區域任務才載入，失敗可重試。

科學資料與來源保留在 `data/`、`vendor/`、`docs/` 及 `deliverables/`，對應的 public 目錄為自動產生。

## 離線展示

```sh
npm run build
npm run package:offline
node server.js
```

開啟 http://127.0.0.1:18070/；亦可在建置後雙擊 `start-demo.cmd`。server.js 僅提供 dist 靜態檔案。

離線 ZIP 產生於 `deliverables/Martian-Navigator-offline.zip`，打包後解壓逐檔比對；解壓後執行 `node serve.cjs` 或使用任意靜態 HTTP server。必須使用根路徑建置；子路徑產物會拒絕打包。主要工具可在封鎖外部主機時操作，不支援 `file://`，未加入 Service Worker。

## 資料重建與計算

共用數學來源為 `core.mjs`、`planet.mjs`、`skyline.mjs`；介面與 Worker 位於 `src/`。Node 研究腳本與測試直接使用這些模組。

```sh
python -m venv .venv
python -m pip install -r requirements.txt
python prepare_jezero_dem.py --download
python scripts/prepare_assets.py
node scripts/prepare_mission.js
python scripts/verify_data.py
python scripts/prepare_names.py
python scripts/prepare_global_map.py
python scripts/prepare_global_dem.py
python scripts/render_global_dem.py
python scripts/import_three_forks.py
python tests/test_pipeline.py
python tests/test_global_assets.py
node scripts/evaluate.js
```

Python 指令請使用已安裝 requirements 的虛擬環境。原始 CTX TIFF 約 450 MB，首次下載與重建需要網路；一般網站建置使用既有資料，不需要 Python。評估與校準會更新資料或報告，更新後須檢視資產清單與雜湊。

## 科學限制與文件

圖層來自真實火星資料；車輛、觀測與漂移為模擬。Jezero 原生 CTX DEM 約 20 m、展示格網約 40 m；全球 MOLA 16 ppd 赤道約 3.7 km，區域採 4 km 格網。全球地平線候選未校準，不自動校正。24° 為展示門檻，DEM 不足以保證腳下或車輪尺度安全；同 DEM 模擬評估不代表真實相機定位精度。

資料來源與限制見 `docs/SOURCES.md`，評估見 `docs/EVALUATION.md`，展示講稿見 `docs/DEMO.md`。需求原文保留於 `題目.md` 與 `想法.md`。
