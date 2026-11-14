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
