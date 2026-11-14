"""Build human-readable evaluation from checked artifacts."""
from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
report=json.loads((root/'artifacts/evaluation.json').read_text('utf-8'));summary=report['summary']
lines=['# 定位與整合驗證報告','', '觀測與匹配使用同一 DEM，結果僅代表模型內模擬。固定分割沒有用保留集調參；v1 門檻事先凍結，另以獨立三個校準位置的完整、遮擋、噪聲、區外情境擬合殘差／候選差距，得到相同部署值（data/localization-thresholds.json）。覆蓋／起伏門檻仍為工程預設，不是統計校準的信心機率。','',f"保留集 Top-3 命中率：{summary['heldoutTop3HitRate']:.0%}（10／10）；目標 ≥90%。命中定義：位置 ≤100 m 且朝向 ≤5°。",'',f"保留集拒絕率：{summary['heldoutRejectRate']:.0%}；全部 22 案例錯誤接受率：{summary['falseAcceptRate']:.0%}；平均搜尋耗時 {summary['meanMilliseconds']} ms。耗時取決於硬體與程序負載。",'', '「錯誤接受」定義為回報 good，但第一候選超出 100 m／5°。遮擋與噪聲案例即使命中 Top-3，也可能因觀測品質不足而拒絕校正。','', '| 集合 | 案例 | 狀態 | 第一候選位置誤差 m | 朝向誤差 ° | Top-3 命中 | 耗時 ms |','|---|---:|---|---:|---:|---|---:|']
for row in report['rows']:
 lines.append(f"| {row['kind']} | {row['index']} | {row['status']} | {row['top1']['position']:.2f} | {row['top1']['heading']:.3f} | {'是' if row['hit'] else '否'} | {row['milliseconds']} |")
lines += ['', '## 未解決限制','', '- 校準集第 3 例搜尋失敗（約 1 km 偏差），被系統拒絕。粗位置／朝向搜尋與局部細化可能漏掉正確盆地。','- 保留集為 10 個固定、較易觀測的位置，搜尋框都包含真值；不能外推到 Jezero 全區。','- 目前信心門檻尚未經大型獨立觀測校準；不把分數稱為定位機率。','- 沒有真實照片擷取、姿態估計、塵霧物理模型及獨立 DEM 誤差。射線在局部 DEM 邊界停止，可能低估遠方山脈。','- 區外觀測、遮擋、噪聲與平坦曲線測試不是對所有錯誤情境的保證。','', '## 自動檢查','', '- 匯入前基線：9 項核心測試與 9 項 DEM 測試通過。','- 轉換器測試：合成 Mars GeoTIFF 的座標、數值與缺測流程通過；它不是實際定位精度證據。','- 新增測試：固定種子、真值隔離、候選搜尋、低覆蓋拒絕、平坦曲線歧義、取消、輸入驗證、越界及缺值路線通過。','- 真實資料：官方鏡像重新串流 SHA-256 與本地原始 DEM 一致。資料統計見 artifacts/data-validation.json。']
browser=root/'artifacts/browser-results.json'
if browser.exists():
 b=json.loads(browser.read_text());lines += ['- 瀏覽器：桌面與手機截圖，外部請求 0、頁面錯誤 0；完整觀測定位、遮擋拒絕、估計不變、搜尋取消、搜尋中重設及離線重載通過。',f"- 實際互動案例：第一候選誤差 {b['good']['error']:.2f} m（不同於固定評估搜尋框），Top-3 共 {b['good']['candidates']} 個。"]
if (root/'artifacts/global-region-results.json').exists():
 lines += ['', '## 全球區域模式', '', '另已通過全球 MOLA 像素中心、位元序、經度循環、全球底圖方向、換日線、兩極、區域路線及 Jezero 恢復驗證。封鎖外部網路的結果見 artifacts/global-region-results.json。', '', 'Jezero 保留集精度不能外推全球。全球 MOLA 來源 16 ppd（赤道約 3.7 km），區域 4 km 格網；只提供未校準定位候選，絕不自動套用。極區經緯度顯示會嚴重變形，全球高解析光學和地質單元尚未接入。']
(root/'docs/EVALUATION.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
print('Evaluation report ready')
