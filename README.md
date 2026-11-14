# 山頂相儀 · Martian Navigator v0.5

支援全火星 MOLA 區域任務，並以較細的 Jezero 光學、地形與地質資料，展示無 GPS 漫遊車的科學路線規劃、里程漂移與 DEM 地平線重新定位。觀測與車輛為模擬，不提供實景相機定位或任務級安全保證。

## 直接啟動（不需網際網路）

需 Node.js 18+。在本目錄執行：

```powershell
node server.js
```

開啟 http://127.0.0.1:18070 。Windows 可雙擊 `start-demo.cmd`。所有必要資料、Leaflet、影像與字型設定均為本機資產；介面使用系統字型。不使用 `file://`，因瀏覽器需透過 HTTP 讀取資料及 Web Worker。

1. 切換光學、地形、坡度、USGS 地質單元圖層。
2. 選擇科學觀測站，規劃路線並開始／暫停加速行進。
3. 掃描地平線，查看 Top-3、仰角 RMS、共同覆蓋與曲線疊合。
4. 定位良好才套用校正，重新規劃後繼續。觀測不足保留估計。
5. 「重設：完整觀測」和「重設：遮擋觀測」可重播兩個情境。評估勾選框顯示模擬真值；預設隱藏。

## 已交付

- `data/jezero_dem.json`：官方真實 CTX DEM，243×176，東向 40.082645 m／北向 40 m，100% 有效。
- `data/ctx.png`：真實 CTX 正射影像裁切；來源原生 5 m，展示約 8.1 m。
- `data/geology.json`：USGS Sun & Stack 2020 地質單元，保留原始描述、單元與配色。
- `data/mission.json`：兩個不同地質單元的可達模擬科學站。
- `skyline.js` / `skyline-worker.js`：數值地平線、固定種子觀測、粗搜尋／細化、獨立候選合併、可信度判斷與背景搜尋。取消與重設終止 worker，工作編號避免過期結果。
- `artifacts/evaluation.json` / `docs/EVALUATION.md`：完整固定測試集與限制。
- `artifacts/demo.webm`：無旁白實際操作錄影，含兩個情境及離線驗證操作；不是三分鐘配音成片。
- `slides.html` / `deliverables/Martian-Navigator.pptx`：五頁展示簡報。
- `docs/DEMO.md`：三分鐘講稿；`docs/SOURCES.md`：資料來源與精度限制。
- `deliverables/Martian-Navigator-offline.zip`：離線展示包，不含原始大 TIFF 或 Python 虛擬環境。解壓後以 Node 啟動。

## 重建資料

需 Python 3.10+（此處已建立 `.venv`），首次重建需網路與約 450 MB 原始 TIFF：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe prepare_jezero_dem.py --download
.\.venv\Scripts\python.exe scripts/prepare_assets.py
node scripts/prepare_mission.js
.\.venv\Scripts\python.exe scripts/verify_data.py
```

USGS 主要網站可能回傳 403，轉換器可使用官方 S3 鏡像。原始 DEM 已透過再次串流計算 SHA-256 與官方鏡像比對一致。圖層先依各自 Mars CRS 轉換；共同座標套疊尚無獨立影像配準誤差量測。

## 檢查與評估

```powershell
node scripts/test.js
.\.venv\Scripts\python.exe tests/test_pipeline.py
node scripts/calibrate.js
node scripts/evaluate.js
.\.venv\Scripts\python.exe -m pip install playwright
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD\.cache\playwright"
.\.venv\Scripts\python.exe -m playwright install chromium
.\.venv\Scripts\python.exe tests/browser_v04.py
.\.venv\Scripts\python.exe scripts/report.py
.\.venv\Scripts\python.exe scripts/package_demo.py
```

瀏覽器測試在 Windows 預設使用 Edge，可用 `BROWSER_EXECUTABLE` 指定 Chromium；錄影需 Playwright 的 FFmpeg。測試啟動臨時本機 HTTP server，封鎖所有外部 URL，驗證完整觀測、遮擋拒絕、行進、取消、搜尋中重設與離線重載。截圖及錄影位於 `artifacts/`。

校準僅使用獨立的三個位置，`data/localization-thresholds.json` 保存完整觀測及負面案例。殘差／候選差距校準與 v1 凍結值一致；覆蓋及起伏門檻仍為工程假設，分數不是信心機率。保留集 10 個完整觀測皆在 Top-3 達到 100 m／5° 目標；校準集有一例搜尋失敗，完整保留。沒有用保留集調參。

## 實作與限制

前端為原生 JS、Canvas 與本機 Leaflet。`app.js` 的 `app.truth` 僅供模擬器／評估；定位 worker 接收 DEM、觀測及搜尋框，沒有真值座標。導航路線從估計位置規劃；模擬器獨立以地面碰撞檢查停止不合理行進。里程誤差隨移動累積。

A* 避開缺測、坡度門檻與斜向穿角；檢查端點連接、所有輸出線段，Jezero 每約 13–15 m、全球區域每約 1.33 km 取樣。這仍不能保證次像素障礙與連續地形安全。24° 是可調展示門檻，不是 Perseverance 工程規格。

Jezero 模式相機高度 1.7 m、假定俯仰／滾轉已校正。射線 80 m 取樣、方位 3°、最遠 6 km；超出或遇缺測即停止，至少有 1.2 km 地形才計為有效射線。局部 DEM 邊界可能截短真正遠方山脈。平坦、重複地形、姿態偏差與真實 DEM 誤差會降低定位能力。完整觀測測試的真值都在搜尋區內；結果不能外推到任意位置。

原本 v0.3 的 `main.js` 與 `docs/reference-v03.html` 保留作參考，未由新首頁載入；舊方位定位數學保留於 `core.js`，不作主要校正。原始下載參考目錄未修改。專案需求依 `題目.md` 與 `想法.md`；競賽官網在此環境無法讀取，正式提交前仍須核對。

## 新增地圖互動

「自由路線繪製」支援逐點設定及按住拖曳手繪。路線從導航估計位置開始，完成後依 DEM 逐段檢查；紅色區段代表越界、缺測或超坡，禁止開始行進。可撤銷、清除及重新繪製。

「火星已命名奇觀」收錄 USGS／IAU 官方目錄的 2055 個核准地名，可搜尋英文、精選中文及依地形類型篩選。預設標記 12 個代表景觀；以火星全覽查看全球 MGS MOLA 彩色地形陰影，返回 Jezero 按鈕回到局部導航區。地名標記採目錄中心，不代表可通行入口、峰頂或實際科學站。

圖上另標示 NASA 任務命名的 Octavia E. Butler Landing 歷史著陸點、模擬任務科學站及 DEM 候選峰；各類名稱均標明來源性質。

重建新增資料：`python scripts/prepare_names.py`、`python scripts/prepare_global_map.py`。互動驗證：`python tests/map_interactions.py`。

## 全火星區域任務（v0.5）

1. 搜尋任何地名，點擊其 popup 的「在此建立區域任務」；或在「全球區域任務」輸入緯度 −90 至 90、經度 −180 至 180。
2. 首次載入約 33 MB 的全球數值 DEM，此後重複使用記憶體中的資料。所有資料均在離線包內。
3. 建立以該地點為中心的 256×256 km 區域，使用 4 km 格網進行區域路線規劃、自由繪製與行進模擬。全球模式以 10,000 m/s 加速展示。
4. 高程／坡度圖層顯示區域取樣點；地質圖層會明確回報此處尚無接入資料，不套用 Jezero 地質分類。
5. 地平線搜尋只輸出未校準的實驗候選，不自動修正導航估計；「回到 Jezero」恢復原本 CTX 模式及原有定位展示。

全球數值來源為 NASA PDS MOLA MEGDR 16 pixels/degree（赤道約 3.705 km），不是影像灰階推高程。來源中無觀測的格子由原產品插值，因此有值不代表每格都直接量測。數值高程為相對 GMM3 areoid；Jezerо CTX 的 MOLA 控制和全球產品仍不能當作無誤差的共同垂直基準。

區域座標使用球面方位等距投影，處理經度換日線及南北極；極點使用最近緯圈均值作顯示插值。全球底圖以原生 16 ppd 數值渲染，正確把 0–360° 來源轉成 −180–180° 顯示。經緯度地圖在極區會嚴重變形；這不影響局部球面座標計算，但極區繪圖不等於極投影地圖。

這是「任意火星地點的區域規劃」，不是一次跨整顆行星的 A* 搜尋，也沒有全火星 20 m DEM、全球 CTX 光學、全球地質單元或全球已驗證定位精度。全球地平線射線 4 km、方位 6°、最遠 100 km，含一階球面曲率近似；相機與地形均為模擬。

重建：`python scripts/prepare_global_dem.py`、`python scripts/render_global_dem.py`。檢查：`node tests/test_planet.js`、`python tests/test_global_assets.py`、`python tests/planet_browser.py`。全球介面與換日線、兩極、圖層、路線、實驗定位、切回 Jezero 均有自動驗證，結果見 `artifacts/global-region-results.json`。


## MarsOps Three Forks 考察流程（基於目前版本新增）

首頁新增「重訪樣本存放區」，保留原本全球區域任務、地圖互動及定位功能。

1. 點「建立往返路線」：以目前 DEM 和坡度門檻計算「規劃起點 → CP-01 → Three Forks → 返回」三段假想人員路線。點選路段或下拉選單，查看距離、最大格網坡度及數值高程剖面；關閉光學影像不影響數值。
2. 點「Malay NASA 紀錄」或金色站點：查看 NASA PDS 原始 ID、Sol、車體座標、LMST、資料版本及原表連結。這些歷史位置不是樣本管端點，也不是真實人員路線。
3. 點 CP-01 或「CP-01 完整觀測」，再點右側掃描。固定搜尋框是目前局部座標 E −2400 至 −400 m、N −1500 至 500 m；確認點 E −1400 / N −500 m，約 18.431565°N、77.395103°E。框內即時計算地平線，沒有使用其他版本的模板。地圖顯示 Top-3 位置和朝向，左側顯示 fix / ambiguous / no_fix、可見方位及下一步。
4. 用「CP-01 遮擋觀測」重播拒絕更新情境。一般重設退出固定確認點搜尋；評估勾選框可揭示真值與誤差。

資料：`data/pds/` 保存 PDS 位置與事件 CSV、XML（1.0）；`python scripts/import_three_forks.py` 以 Sample Designation 串接全部 10 筆並產生 `data/three-forks.geojson`。座標為火星行星中心緯度、東經，GeoJSON 順序 [經度, 緯度]，不可當作地球 WGS84。原始來源： https://pds-geosciences.wustl.edu/m2020/urn-nasa-pds-mars2020_sample_depot_three_forks/ 。資料讀取使用本機檔案，外部原始連結需網路。

地形仍使用現有 243×176 CTX 衍生格網（E 40.082645 / N 40 m，來源原生 20 m），沿線每 ≤15 m 取樣不代表解析度提高。所有路線／確認點／觀測均為情境模擬，岩塊、足下路況與真實全景定位未驗證。Malay 在 CP-01 搜尋框外；終點不沿用確認點的搜尋框。地面歷史影像提供 PDS 索引連結，尚未內嵌產品照片。

新增端到端檢查：`.\.venv\Scripts\python.exe tests/test_three_forks.py`（需 Playwright 與 Edge）。涵蓋三段可達、離線卡片欄位、關閉光學後剖面一致、完整觀測定位、遮擋拒絕更新、重設與窄螢幕。
