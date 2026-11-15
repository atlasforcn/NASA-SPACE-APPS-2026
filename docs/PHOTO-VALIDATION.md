# 真實照片地平線驗證：目前結論未定

目前沒有完成真實照片定位實驗，不能宣稱「真實照片的地平線已改善本專案定位」。現有同 DEM 模擬成功不能代替這個結論。

## 優先資料

1. [Mastcam-Z 團隊全景資料集](https://mastcamz.asu.edu/mastcam-zs-360-panorama-collection/)：優先選 Panorama #1，Octavia E. Butler Landing，sols 3/11。來源提供自然色左右眼與投影資訊，照片致謝 NASA/JPL-Caltech/ASU/MSSS。全景由多個 sol 的影像組成，應逐一核對拍攝站位及姿態。應使用完整解析度產品，網頁縮圖只用於挑選資料。
2. Panorama #2（sol 4）來源明示遠方山頂遭裁切，不適合作完整天際線真值。不能將影像頂端視為山頂。
3. [PDS Mars 2020 PLACES](https://pds-geosciences.wustl.edu/missions/mars2020/places.htm)：取得與影像時間、site/drive 相符的定位及姿態資料，閱讀其 SIS 確認座標系與精度。它是外部參考位置，不能假設毫無誤差，也不能當作搜尋答案。

資料集頁面說明「多數」全景採 simple cylindrical、中央北方、左右南方，仰角通常為 −70° 至 +10°，但有例外；必須核對個別產品，不能把這些預設直接套到每張照片。以星球／site frame 的北方定義、相機標定和相應姿態轉到專案方位角。若投影是透視或其他 cylindrical 定義，不能直接線性轉換 y 座標。

## 已知阻礙

預設 Jezero CTX DEM 涵蓋 30×30 km；舊 9.7×7 km 同源裁切已移除。`skyline.profile` 的有效旗標只檢查射線至少到 1200 m，不代表包含照片內真正的遠山；擴區也必須逐照片檢查完整視線。實景實驗須明確遮罩不完整射線；不能靠增加 maxRange 憑空補上地形。MOLA 格距約 3.7 km、區域輸出至少 4 km，不能代替精細山脊 DEM。不同 DEM 的垂直基準、火星投影與相機高度必須一致。

## 已新增的工具

`node scripts/export-regions.mjs` 將既有數值 MOLA 轉為選單各中心的區域 DEM，預設放在 `.build/dem-regions/`，附來源雜湊、格距及中心高程。這是同一觀測來源的不同裁切，並非多份獨立或高解析觀測。網站也提供區域座標快捷選擇，再按建立任務即可載入該區域。

`node scripts/evaluate-photo-horizon.mjs input.json result.json` 接受已完成相機幾何轉換與人工／自動標註的角度曲線；尚不直接處理照片像素。輸入格式如下（示意欄位，不能當作實測資料）：

```text
schema: mars-photo-horizon-evaluation-v1
demPath: 指向與座標一致的 DEM JSON
provenance:
  imageUrl: 個別原始影像產品網址
  projectionSource: 個別產品投影及姿態來源
  annotationMethod: 天際線標註與遮擋處理方法
  referenceSource: 對應時間的外部位置產品與紀錄識別
observation:
  kind: measured-photo-horizon
  angles: [0, 3, 6, ... 357]（等間距全周角度；遮擋處保留角度）
  elevations: 相同長度的仰角，無效處為 null
  valid: 相同長度的布林遮罩
  cameraHeight: 相機相對 DEM 地面的公尺高度
  options: {rayStep: 80, maxRange: 6000, curvature: true}（依 DEM 和實驗預先指定）
search:
  bounds: {minX, maxX, minY, maxY}（依先驗誤差預先指定）
  coarseStep: 搜尋步長公尺
prior: {x, y}（校正前先驗位置，DEM 局部公尺）
reference: {x, y}（外部參考位置，僅搜尋結束後用於評分）
```

報告提供先驗誤差、最佳候選誤差、改善公尺數及候選。`candidateImproves` 只描述單筆候選是否接近參考位置；`simulationThresholdStatus` 沿用模擬門檻，不是實景可信度。工具不授權自動校正。來源欄位是追溯紀錄，工具不能自動證明人工提供的標註真的來自照片。

## 何時能支持改善定位

先固定地形範圍、遮罩、標註規則、搜尋範圍、先驗誤差、模型及門檻；使用不同拍攝站位，保留不參與調整的測試組。比較先驗、單純里程估計與照片校正後的中位數／高分位位置誤差、改善比例、拒絕比例及錯誤校正比例。另測試錯誤區域、視角不足與粉塵遮擋。接受率須與接受後誤差一起報告，不能只挑最佳案例。

只有測試組在考慮參考誤差後仍一致降低位置誤差，且錯誤校正受控，才能支持「在已測試條件下，真實照片地平線改善定位」。這仍不支持輪前避障、路線安全或火星所有地形適用。

## 本次實拍篩選與逐筆結果

[產品清單](photo-sites.json) 保存三個獨立站位的四個產品、下載網址、投影資訊及 PLACES 前後兩筆定位紀錄。定位表採 planetocentric latitude、east longitude。相機光心、姿態與地形配準的不確定性仍待查證；車身 yaw 不能直接用作相機方位。多 sol 全景須追到各曝光才能確認 site/drive，檔名與目錄標示的 Van Zyl 結束 sol 也不一致（64 與 63）。

| 站位 | 產品 | 分組 | 實拍評估 |
|---|---|---|---|
| Butler Landing | 01.02 左眼自然色全景，sol 3、11 | 開發 | 缺逐曝光幾何、已複核的山稜與 DEM 遮罩，排除 |
| Van Zyl | 03.02 左眼自然色全景，sol 53–63 | 開發 | 須先確認組圖時段、相機幾何與遠山覆蓋，排除 |
| Horizon 2 | 05.02 左眼自然色全景，sol 114 | 保留站 | 缺人工複核輪廓與相機高，排除 |
| Horizon 2 | ZL0_0114_0677061671，單張，site 4／drive 1062 | 同一保留站 | 缺單張標定後視角、有效輪廓與遠山遮罩，排除 |

可計分 0 筆。沒有可報告的先驗／候選位置誤差或誤認率。保留站包含其所有裁切。重建清單：

```sh
curl -fL https://mastcamz.asu.edu/mastcam-zs-360-panorama-collection/ -o /tmp/panoramas.html
curl -fL https://pds-geosciences.wustl.edu/m2020/urn-nasa-pds-mars2020_rover_places/data_localizations/best_interp.csv -o /tmp/places.csv
python3 scripts/catalog-photo-sites.py /tmp/panoramas.html /tmp/places.csv > docs/photo-sites.json
```

評估前須固定每組的先驗、搜尋範圍、DEM 版本、相機高及射線設定。單張或裁切的已審查輸入可加 observation.fovMask，全周等間距逐方位記錄是否在視場內。有效遮罩另排除遮擋及 DEM 不支援的方向。評估器分別輸出有效角度、視場內有效比例、輪廓起伏、DEM 重疊、前兩候選分差與拒絕原因。沒有視場遮罩時視場內比例留空。headingSource 與外部相機 heading 同時存在才計方向誤差。原模擬門檻保持 50%，有限視角仍可留下候選供比較。

以 720×360 的水平理想輪廓、3° 取樣重跑既有 perspective 轉換，60°、120°、150° 視場分別保留 19、39、50 個有效方位（全周 120 格的 15.8%、32.5%、41.7%）。與理想輪廓重疊率均為 100%，殘差為零，但缺乏山形起伏，三例均遭原分類器拒絕。執行 `node tests/test_photo_evaluation.mjs` 可重現此算法檢查。
