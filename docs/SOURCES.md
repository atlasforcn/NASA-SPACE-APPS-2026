# 真實資料與來源

## 可下載科學疊圖

「整合科學圖層 → 疊加資料」提供四份數值格網及兩個歷史測站。資料下載日期為 2026-11-14；網站只讀取本站靜態副本，無執行期外部 WMS 或 PDS 請求。

| 選項 | 實際產品 | 下載格距與限制 |
|---|---|---|
| 熱 | NASA MGS/TES 熱慣量，ASU `TES_Thermal_Inertia_numeric` | 8 pixels/degree（0.125°），J m⁻² K⁻¹ s⁻½；不是即時溫度或 THEMIS 高解析產品 |
| 光譜 | MGS/TES 橄欖石豐度，Bandfield (2002)，`TES_Olivine_numeric` | 4 pixels/degree（0.25°）；熱紅外光譜解混產品，不是逐點岩樣分析或 CRISM 礦物圖 |
| 地球物理 | GMM-3 重力異常，`grav_ggmro_120_anom_100` | 原產品 16 pixels/degree，本站取樣為 2 pixels/degree（0.5°）；mGal；截至球諧階數 100，模型有效解析度低於顯示格距 |
| 化學 | Odyssey GRS 鐵濃度，Boynton et al. (2007)，`GRS_Fe_conc_numeric` | 0.2 pixels/degree（5°）；質量百分比 wt % Fe，無法分辨 Jezero 或 Gale 內部局部差異 |
| 大氣 | Perseverance MEDA Sol 1 衍生氣壓，PDS v2.0 | 2021-02-19 的 2,330 筆有效樣本，平均約 715.002 Pa；不是全天平均。以 Bell et al. (2022) 的歷史著陸座標 18.4446°N、77.4509°E 定位；Sol 1 尚未行進 |
| 輻射 | Curiosity RAD Sol 1 RDR，PDS v1.0 | B 偵測器的 14 筆有效吸收劑量率，算術平均 8.925 µGy/h（矽）；不是劑量當量 mSv，也不是整日時間加權平均。原表 ROVER_LAT/LON 為 0 佔位，改用 [Vasavada et al. (2014)](https://doi.org/10.1002/2014JE004622) 的 Bradbury Landing 位置 −4.5895°N、137.4417°E（Sol 1 未行進） |

格網下載自 [ASU JMARS WMS](https://ms-mars.mars.asu.edu/?SERVICE=WMS&REQUEST=GetCapabilities)，產品索引見 [ASU 全球資料](https://mars.asu.edu/data/)；重力原產品另見 [NASA PDS Radio Science Digital Maps](https://pds-geosciences.wustl.edu/mro/mro-m-rss-5-sdp-v1/mrors_1xxx/data/rsdmap/)。

`scripts/prepare-science.py` 下載數值 VICAR、依標頭解析型別與位元序，將 0–360°E 欄位循環移成 −180–180°E；不使用地球 CRS。JMARS:4 的軸方向以 Olympus Mons 最大高程位置及與既有 PDS MOLA16 的 108 個粗格點交叉檢查；這只驗證方向與粗略地理對應，不是公尺級配準評估。展示與游標採最近格點，放大不補出細節。來源無效值與超出合理範圍的值轉為 NaN；PNG 對應透明，缺值不內插。

`data/science/manifest.json` 保留完整請求 URL、來源下載大小與 SHA-256、VICAR 標頭、來源 citation／keywords、單位、格距、像素中心定義、有效率及顯示色階；`.bin` 是 little-endian float32 副本，`.png` 為相同格網的固定色階。色階外截色，不截斷數值讀值。大氣與輻射原表及 PDS 標籤保存在 `data/science/raw/`；RAD 依標籤的 1-based byte pointer 讀取 7-byte Total Dose B 值，排除負值及非有限值，不把佔位座標放上地圖。原表未做更進一步科學品質旗標篩選，仍應依任務文件解讀。

所有疊圖附來源，供區域科學背景使用，不改變 DEM 路線成本。測站只標單點，不以單點數值填滿全區；跨區查看測站不會更換目前任務 DEM。

## 目前使用來源總覽

下表列出網站目前載入或展示的外部觀測、地圖產品與衍生資料。原始資料已整理成 `data/` 下的靜態資產；除按需載入的高解析 Gale 區域資料與全球 MOLA 格網外，網站執行時不會向來源服務即時查詢。

| 功能／區域 | 資料來源 | 本機資料與用途 | 類型／限制 |
|---|---|---|---|
| 全球導覽、任務座標 | [NASA PDS MOLA MEGDR](https://pds-geosciences.wustl.edu/missions/mgs/megdr.html) | `data/mola16.bin`、`data/mars-global-dem.jpg`；數值高程、全球底圖與自訂座標任務 | MGS 雷射高度計；16 ppd 全球格網，衍生著色圖僅供顯示 |
| Jezero 任務區 | [USGS CTX DEM](https://astrogeology.usgs.gov/search/map/mars_2020_science_investigation_ctx_dem_mosaic)、[CTX 正射影像](https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/CTX/ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXortho_mosaic_5m.tif)、[USGS 地質圖](https://www.usgs.gov/maps/geologic-map-jezero-crater-and-nili-planum-region-mars) | `data/jezero-extended/dem.json`、`optical.png`、`data/geology.json`；30×30 km 數值高程、完整 CTX 正射影像及中央地質單元 | DEM 原生 20 m、本站 40 m 取樣；光學原生約 5 m、展示約 20 m／像素；影像超出 DEM 範圍，地質圖只覆蓋中央區域 |
| Gale 任務區 | [USGS MSL Gale DEM](https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m)、[USGS Gale 正射影像](https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_orthophoto_mosaic_25cm) | `data/gale/`；按需載入局部地形與光學影像 | MRO HiRISE／合併產品；本機展示格距較原生像素粗，色彩覆蓋不完整 |
| Valles Marineris 局部 | [USGS CTX DTM STAC](https://stac.astrogeology.usgs.gov/docs/tutorials/qgis_3d/) | `data/valles/`；20×20 km 數值高程與灰階正射影像 | 單組 CTX 立體 DTM，原生約 20 m、本站 40 m 取樣；有效高程約 94.2%，缺值不外推 |
| 全球科學圖層 | [ASU JMARS 數值圖層服務](https://ms-mars.mars.asu.edu/) | `data/science/*.bin`、`*.png` 與 `manifest.json`；熱慣量、橄欖石豐度、重力異常、鐵含量 | 多任務儀器產品與模型；解析度、有效覆蓋及引用各異，供區域背景探索 |
| 歷史環境觀測 | [NASA PDS MEDA](https://pds-atmospheres.nmsu.edu/)；[NASA PDS RAD](https://pds-ppi.igpp.ucla.edu/) | `data/science/manifest.json`、`data/science/raw/`；毅力號著陸後 Sol 1 氣壓與好奇號 Sol 1 輻射樣本摘要 | 單站、單日歷史觀測，不代表目前天氣、整日平均或全球風險 |
| Three Forks 樣本存放 | [NASA PDS Sample Depot](https://pds-geosciences.wustl.edu/m2020/urn-nasa-pds-mars2020_sample_depot_three_forks/) | `data/pds/` CSV/XML 與 `data/three-forks.geojson`；樣本名稱、存放點及時間 | 任務紀錄資料；非地形或材料遙測 |
| 官方地名與著陸位置 | [USGS／IAU Mars nomenclature GIS](https://planetarynames.wr.usgs.gov/GIS_Downloads)、NASA 與研究論文 | `data/mars-names.json`、`data/mission.json`；地名和歷史著陸標記 | 地名核准資料與歷史位置；標記不代表漫遊車目前位置 |

局部導航高程採兩來源：有效的局部 DEM 優先；目的地離局部中心不超過 200 km 時，缺測或超出局部 DEM 的區段可載入 MOLA 16 ppd 數值格網補足。MOLA 高程以局部中心點的差值作常數垂直對齊，這不等於完整配準。路線將 MOLA 區段以橘色虛線標示並統計長度。MOLA 約公里尺度，無法估算車輪尺度粗糙度；混合路線只供粗略模擬，不可用於實際導航。超過 200 km 應明確建立 MOLA 區域任務，避免局部平面座標誤差。

坡度、粗糙度、陰影、地平線、彩色 DEM 底圖、樣本 GeoJSON 及介面摘要均為本專案計算或格式轉換後的呈現，不應視為額外獨立觀測。模擬車輛位置、漂移與路線成本也不是資料來源。以下各節記錄重要產品細節及限制。

## Gale 高解析區域資料

預設 Jezero CTX DEM 由 `scripts/prepare-jezero-extended.py` 以 HTTP range 讀取官方 CTX 數值 DEM，中心 18.44°N、77.42°E，取樣 751×751、40 m／格。來源 URL、ETag、尺寸、火星投影、讀取窗與取樣窗雜湊保存在輸出 JSON；未下載整份原始 TIFF，因此未宣稱原檔 SHA-256。有效格點為 100%。`scripts/prepare-jezero-extended-optical.py` 從官方 CTX 正射影像完整範圍降採樣約 4 倍、約 20 m／像素，不裁切原始覆蓋範圍，來源與讀取窗記錄於 `data/jezero-extended/optical-source.json`。光學影像只用於展示，不作數值高程。舊 9.7×7 km 同源 DEM 已移除，避免重複載入。

Valles 局部由 `scripts/prepare-valles.py` 使用 USGS STAC 的單組受控 CTX DTM 與對應正射影像；中心 −10.0°N、−69.3°E，格網 501×501、40 m／格。數值高程約 −364 至 4067 m，有效格點約 94.2%。兩份來源皆重新投影到本站的火星局部框架；正射影像做 1–99 百分位灰階拉伸，僅供顯示。來源項目、URL、原始投影、讀取窗與數值窗雜湊保存在輸出資料。單組 DTM 的缺值、雜訊和垂直誤差仍限制坡度與路線判讀；尚無獨立配準驗證。

「探索 → Gale 高解析 DEM＋正射影像」按需載入 `data/gale/`。中心 planetocentric −4.59°、positive-East 137.44°，範圍東西／南北各 10 km，半徑 3,396,190 m，局部等距經緯度公尺框架。中心是示範任務起點，不是好奇號實際位置。

- [USGS MSL Gale Merged DEM](https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m)：Calef／Parker 合併產品 v3，原生像素格距 1 m；使用官方 4 m 基底外部 overview 的數值高程，經雙線性取樣及火星座標重投影成本站 501×501、20 m 格點。混合來源的細節與精度不均勻，不能聲稱處處有 1 m 地形精度。有效格點 100%，高程約 −4542 至 −4079 m。
- [USGS Gale 正射影像](https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_orthophoto_mosaic_25cm)：原生像素格距 25 cm。本站顯示 1500×1500、約 6.67 m/pixel；使用同目錄 HiRISE-LRGB 78 quads 彩色 COG，彩色覆蓋約 51.5%，其餘以同套灰階正射影像 overview 補足，最終有效覆蓋 100%。彩色為人工配準、混色和銳化產品；色彩接縫是來源覆蓋差異，不是地質單元邊界。
- 高程、坡度、粗糙度、陰影：由上述數值 DEM 計算，不是額外獨立觀測。陰影採西北向光源、高度角 45°，只是合成視覺化；粗糙度是鄰域高程指標，無法驗證車輪尺度障礙。
- Gale 尚未接入可追溯的地質多邊形，因此停用地質單元選項。Three Forks 站點、Jezero 著陸標記與考察路線不套用到 Gale。

`scripts/prepare-gale.py` 可重建裁切，需 rasterio、numpy、Pillow 與 pyproj；它透過 HTTP range 讀取官方大型 TIFF 及 overview，不需下載完整約 3.9 GB DEM、24 GB 灰階影像。網站本身仍不需要 Python。來源 URL、ETag、大小、Mars WKT、原生 transform、overview、實際讀取 window 及取樣陣列 SHA-256 保存在 DEM／影像 JSON。未下載整份來源，沒有聲稱取得完整原檔 SHA-256；ETag 也不當作 SHA-256。輸出檔由靜態資產清單另外以 SHA-256 驗證。

影像／DEM 致謝 NASA/JPL-Caltech、USGS、UArizona 與相關團隊；彩色拼圖由 Timothy J. Parker／Fred J. Calef III 製作。DEM 與影像已轉到相同火星局部框架，但尚無獨立控制點配準精度評估。10 km 裁切不保證涵蓋照片的遠山，仍不能宣稱實景定位或安全導航已驗證。

| 資料 | 產品／來源 | 解析度與用途 |
|---|---|---|
| 地形 | [USGS Mars 2020 Science Investigation CTX DEM](https://astrogeology.usgs.gov/search/map/mars_2020_science_investigation_ctx_dem_mosaic) | 原生 20 m；本機 751×751 格網，40 m／格、30×30 km；100% 有效 |
| 光學 | [同套 USGS CTX 正射影像](https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/CTX/ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXortho_mosaic_5m.tif) | 原生約 5 m；本機完整影像 4442×5059 PNG，約 20 m／像素；1–99 百分位對比拉伸，只供顯示 |
| 地質 | [Sun & Stack 2020, USGS SIM 3464](https://www.usgs.gov/maps/geologic-map-jezero-crater-and-nili-planum-region-mars)；[官方 GIS FeatureServer](https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/Jezero_FeatureServiceFromPro/FeatureServer/8) | 1:75,000 地質解釋圖，27 個與示範框相交的多邊形；保留單元、原始描述及配色 |

DEM 與光學使用 MRO CTX 產品；DEM 的垂直控制依來源產品以 MOLA 為基礎。這是 MRO 觀測加上 MGS/MOLA 高程控制，並非三種獨立任務的感測觀測。坡度、粗糙度及地平線均為 DEM 衍生量，不另計為獨立資料類別。

局部座標：中心 planetocentric 18.44°N、positive-East 77.42°E，球半徑 3,396,190 m，East/North 以公尺計。DEM、影像從各自原生火星 CRS 轉換；地質先從 Mars Transverse Mercator 反投影，再轉局部座標。沒有使用 Earth EPSG:4326 做資料重投影。Leaflet 僅沿用等距經緯度顯示網格，距離另以火星局部公尺計算。

`data/geology.json` 保留原生 WKT、查詢 URL、原始 JSON SHA-256、所有欄位與 renderer。多邊形保留完整相交要素，顯示框以外不列為有效任務範圍。洞與多重環採 even-odd 點包含測試。

`data/jezero-extended/optical-source.json` 保存完整影像來源、CRS、展示格距及有效率；`data/jezero-extended/dem.json` 保存 DEM 來源與取樣窗雜湊。

資料限制：沒有獨立控制點的配準精度評估；共同座標套疊不能證明公尺級對齊。地質圖為區域科學解釋，不是障礙物或逐格材質實測。局部格網邊界會截短遠方視線，1200 m 以上可用射線仍未必包含真正遠方天際線。觀測與匹配使用同一模型，會高估實景表現。

引用：Calef et al. (2021), USGS Astrogeology；Sun, V.Z. and Stack, K.M. (2020), Geologic map of Jezero crater and the Nili Planum region, Mars, USGS Scientific Investigations Map 3464, https://doi.org/10.3133/sim3464。光學影像應致謝 NASA/JPL-Caltech/MSSS 及 USGS。Leaflet 1.9.4 的 BSD-2-Clause 授權附於 `docs/Leaflet-LICENSE.txt`。資料沿用來源機構的授權及引用要求。

## 已命名地形與全球導覽

- 正式地名：取自 [USGS／IAU 官方 GIS 下載](https://planetarynames.wr.usgs.gov/GIS_Downloads) 的 MARS_nomenclature_center_pts.kmz，共 2055 個 Adopted by IAU 項目；`data/mars-names.json` 保存中心、分類、尺度、核准日、名稱由來及逐項官方連結。精選中文為介面翻譯，正式名稱以原文為準。
- 精選地理介紹參考 [NASA Mars Facts](https://science.nasa.gov/mars/facts/)。MOLA 全球底圖由數值高程渲染，僅供彩色地形陰影顯示；數值來源見 `data/mola16.json`。
- Octavia E. Butler Landing 的[命名來源](https://science.nasa.gov/resource/welcome-to-octavia-e-butler-landing/)為 NASA；位置 18.4446°N／77.4509°E 取自 [Bell et al. 2022 原始研究](https://ntrs.nasa.gov/api/citations/20230016428/downloads/Bell%20et%20al%202022sciadv.pdf)。它是歷史著陸位置，不是目前車輛位置，也未列為 IAU 正式地名。

## 全球數值 DEM

[NASA PDS Geosciences MOLA MEGDR](https://pds-geosciences.wustl.edu/missions/mgs/megdr.html) 的 [16 ppd 產品標籤](https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg016/megt90n000eb.lbl)定義 5760×2880、big-endian int16 公尺高程，planetocentric／positive-East；全球最小 −8177 m、最大 21171 m。中位數地形格網中的空格由來源產品插值。

`data/mola16.bin` 是明確轉為 little-endian 的數值副本；來源與副本 SHA-256、像素中心、垂直基準見 `data/mola16.json`，原始標籤見 `data/mola16.lbl`。區域球面近似半徑沿用 3,396,190 m；產品標籤投影半徑 3396 km 的差異不能用來聲稱精密測地精度。

`data/mars-global-dem.jpg` 以數值高程渲染色階／陰影，原生 5760×2880，原始 0–360° 欄位循環平移成 −180–180° 顯示；它取代原本低解析 WMTS 底圖。陰影與極點緯圈均值為本專案衍生顯示處理，不是新觀測。全球來源解析度不足以驗證輪前障礙、個人步行安全或真實相機定位。


### 全球光學底圖（2026-11-14）
- 產品：[USGS Mars Viking Colorized Global Mosaic 232m](https://astrogeology.usgs.gov/search/map/mars_viking_colorized_global_mosaic_232m)。
- 下載： https://astrogeology.usgs.gov/ckan/dataset/7131d503-cdc9-45a5-8f83-5126c0fd397e/resource/5ea881c6-01b3-41fa-a7af-42d2131b54f1/download/mars_viking_mdim21_clrmosaic_1km.jpg
- 將 21339 × 10670 的全球 1 km JPEG 縮為 2048 × 1024，儲存為 `data/mars-global-optical.jpg`；等距圓柱，經度 −180 至 180、緯度 90 至 −90，展示赤道約 10.4 km/pixel。NASA/JPL/USGS，歷史彩色拼圖，非即時影像。
- 總覽高程沿用 `mars-global-dem.jpg` 地形陰影與色階；游標高度直接取樣 `mola16.bin`，不從顏色反推。首次進入總覽即載入數值格網。
