# 真實資料與來源

## Gale 高解析區域資料

「探索 → Gale 高解析 DEM＋正射影像」按需載入 `data/gale/`。中心 planetocentric −4.59°、positive-East 137.44°，範圍東西／南北各 10 km，半徑 3,396,190 m，局部等距經緯度公尺框架。中心是示範任務起點，不是好奇號實際位置。

- [USGS MSL Gale Merged DEM](https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m)：Calef／Parker 合併產品 v3，原生像素格距 1 m；使用官方 4 m 基底外部 overview 的數值高程，經雙線性取樣及火星座標重投影成本站 501×501、20 m 格點。混合來源的細節與精度不均勻，不能聲稱處處有 1 m 地形精度。有效格點 100%，高程約 −4542 至 −4079 m。
- [USGS Gale 正射影像](https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_orthophoto_mosaic_25cm)：原生像素格距 25 cm。本站顯示 1500×1500、約 6.67 m/pixel；使用同目錄 HiRISE-LRGB 78 quads 彩色 COG，彩色覆蓋約 51.5%，其餘以同套灰階正射影像 overview 補足，最終有效覆蓋 100%。彩色為人工配準、混色和銳化產品；色彩接縫是來源覆蓋差異，不是地質單元邊界。
- 高程、坡度、粗糙度、陰影：由上述數值 DEM 計算，不是額外獨立觀測。陰影採西北向光源、高度角 45°，只是合成視覺化；粗糙度是鄰域高程指標，無法驗證車輪尺度障礙。
- Gale 尚未接入可追溯的地質多邊形，因此停用地質單元選項。Three Forks 站點、Jezero 著陸標記與考察路線不套用到 Gale。

`scripts/prepare-gale.py` 可重建裁切，需 rasterio、numpy、Pillow 與 pyproj；它透過 HTTP range 讀取官方大型 TIFF 及 overview，不需下載完整約 3.9 GB DEM、24 GB 灰階影像。網站本身仍不需要 Python。來源 URL、ETag、大小、Mars WKT、原生 transform、overview、實際讀取 window 及取樣陣列 SHA-256 保存在 DEM／影像 JSON。未下載整份來源，沒有聲稱取得完整原檔 SHA-256；ETag 也不當作 SHA-256。輸出檔由靜態資產清單另外以 SHA-256 驗證。

影像／DEM 致謝 NASA/JPL-Caltech、USGS、UArizona 與相關團隊；彩色拼圖由 Timothy J. Parker／Fred J. Calef III 製作。DEM 與影像已轉到相同火星局部框架，但尚無獨立控制點配準精度評估。10 km 裁切不保證涵蓋照片的遠山，仍不能宣稱實景定位或安全導航已驗證。

| 資料 | 產品／來源 | 解析度與用途 |
|---|---|---|
| 地形 | [USGS Mars 2020 Science Investigation CTX DEM](https://astrogeology.usgs.gov/search/map/mars_2020_science_investigation_ctx_dem_mosaic) | 原生 20 m；本機 243×176 格網，東 40.082645 m／北 40 m；100% 有效 |
| 光學 | [同套 USGS CTX 正射影像](https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/CTX/ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXortho_mosaic_5m.tif) | 原生 5 m；本機 1200×866 PNG，約 8.09 m；1–99 百分位對比拉伸，只供顯示 |
| 地質 | [Sun & Stack 2020, USGS SIM 3464](https://www.usgs.gov/maps/geologic-map-jezero-crater-and-nili-planum-region-mars)；[官方 GIS FeatureServer](https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/Jezero_FeatureServiceFromPro/FeatureServer/8) | 1:75,000 地質解釋圖，27 個與示範框相交的多邊形；保留單元、原始描述及配色 |

DEM 與光學使用 MRO CTX 產品；DEM 的垂直控制依來源產品以 MOLA 為基礎。這是 MRO 觀測加上 MGS/MOLA 高程控制，並非三種獨立任務的感測觀測。坡度、粗糙度及地平線均為 DEM 衍生量，不另計為獨立資料類別。

局部座標：中心 planetocentric 18.44°N、positive-East 77.42°E，球半徑 3,396,190 m，East/North 以公尺計。DEM、影像從各自原生火星 CRS 轉換；地質先從 Mars Transverse Mercator 反投影，再轉局部座標。沒有使用 Earth EPSG:4326 做資料重投影。Leaflet 僅沿用等距經緯度顯示網格，距離另以火星局部公尺計算。

`data/geology.json` 保留原生 WKT、查詢 URL、原始 JSON SHA-256、所有欄位與 renderer。多邊形保留完整相交要素，顯示框以外不列為有效任務範圍。洞與多重環採 even-odd 點包含測試。

`data/ctx-source.json` 保存影像來源、SHA-256、CRS、實際展示格距及有效率。DEM 來源與原始雜湊亦保存於 `data/jezero_dem.json`。

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
