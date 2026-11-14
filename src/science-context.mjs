// Curated published observations. These are not interpolated into point measurements.
// Region tags select context for the loaded local site, not an observation footprint.
export const scienceRecords = [
  { id: 'thermal', name: '熱', scope: 'global', period: '2009 年研究／THEMIS 夜間紅外線',
    text: 'THEMIS 夜間影像取樣約 100 m/pixel；此研究以熱慣量超過 1,200 J m⁻² K⁻¹ s⁻½ 辨識基岩或岩石主導地表。',
    limit: '這是研究分類門檻；本站尚未下載目的地的熱慣量像素，不能據此判定當地材質或溫度。',
    url: 'https://pubs.usgs.gov/publication/70037394', source: 'USGS／Edwards et al. (2009)' },
  { id: 'spectral', name: '光譜', scope: 'jezero', period: '2020 年發布／MRO CRISM 軌道觀測',
    text: 'CRISM 在 Jezero 區域辨識出橄欖石與碳酸鹽的空間關聯，研究用以探討碳酸鹽的形成環境。',
    limit: '區域礦物研究；沒有為所選座標取樣光譜，也不表示每個位置都含相同礦物。',
    url: 'https://astrobiology.nasa.gov/news/serpenitinzation-and-astrobiological-potential-of-the-mars-2020-landing-site/', source: 'NASA Astrobiology／CRISM' },
  { id: 'geophysical', name: '地球物理', scope: 'global', period: 'InSight 任務（2018–2022）',
    text: 'InSight 記錄超過 1,300 次地震事件；磁力計也測得地殼中保留的古老磁化訊號。',
    limit: '觀測來自 Elysium Planitia 的 InSight，不是 Jezero、Gale 或目的地的地下剖面。',
    url: 'https://science.nasa.gov/mission/insight/science-highlights/', source: 'NASA／InSight 科學成果' },
  { id: 'atmospheric', name: '大氣', scope: 'jezero', period: '2021-02-19 首次量測；2021-04-06 發布',
    text: 'Jezero 的 MEDA 首次報告氣壓為 718 Pa；開始記錄時溫度略低於 −20 °C，30 分鐘後降至 −25.6 °C。',
    limit: '毅力號當時所在處的歷史觀測；不是目前天氣，也不外推為所選座標的氣壓或溫度。',
    url: 'https://www.jpl.nasa.gov/news/nasas-first-weather-report-from-jezero-crater-on-mars/', source: 'NASA/JPL／MEDA 首份天氣報告' },
  { id: 'radiation', name: '輻射', scope: 'gale', period: '2012-08 至 2013-06／Curiosity RAD',
    text: 'Gale 地表在這段觀測期間的平均輻射劑量當量率約為 0.67 mSv／日。',
    limit: '歷史期間平均，隨太陽活動與屏蔽條件改變；不是目的地即時值或個人曝露預測。',
    url: 'https://www.nasa.gov/news-release/nasa-rover-results-include-first-age-measurement-on-mars-and-help-for-human-exploration/', source: 'NASA／Curiosity RAD（2013 年報告）' },
  { id: 'chemical', name: '化學', scope: 'jezero', period: '2021 年坑底科學調查；2023 年綜合研究',
    text: '毅力號在 Máaz 與 Séítah 坑底岩石中觀察到碳酸鹽或鐵鎂層狀矽酸鹽、鹽類與非晶質矽酸鹽，支持岩石曾受水作用改變。',
    limit: '沿歷史行進路線的岩樣結果；不代表所選位置的成分或濃度。',
    url: 'https://ntrs.nasa.gov/api/citations/20230016431/downloads/Sun%20et%20al%202023%20JGR%20Planets%20Jezero%20Campaign.pdf', source: 'NASA NTRS／Sun et al. (2023)' },
  { id: 'chemical', name: '化學', scope: 'gale', period: '2013-03-12 發布／Yellowknife Bay 鑽取岩樣',
    text: 'Curiosity 的 CheMin 分析顯示，該次泥岩鑽樣中黏土礦物至少占 20%。',
    limit: '特定鑽樣的礦物組成；不能當作整個 Gale 或目的地土壤的百分比。',
    url: 'https://www.jpl.nasa.gov/news/nasa-rover-finds-conditions-once-suited-for-ancient-life-on-mars/', source: 'NASA/JPL／CheMin 岩樣分析' },
];

export function recordsForSite(siteId, regional) {
  return scienceRecords.filter(r => r.scope === 'global' || (!regional && r.scope === siteId));
}
