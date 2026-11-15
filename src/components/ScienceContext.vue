<script setup>
import { computed, inject } from 'vue';
import { palettes } from '../science-style.mjs';
import { missionKey } from '../useMission';

const m = inject(missionKey), s = m.state;
const location = computed(() => s.walk?.station || s.targets.find(t => t.id === s.destination) || s.poi);
const point = computed(() => m.scienceAt(location.value));
const meta = computed(() => s.scienceMeta);
const cell = computed(() => m.scienceCellAt(point.value));
const stationCells = computed(() => (s.walk?.stations || []).map(p => m.scienceCellAt(m.scienceAt(p))));
const range = computed(() => s.scienceLayers[s.layer]?.range || meta.value?.scale);
const sampled = computed(() => m.scienceValueAt(point.value));
const value = (n, digits = 0) => Number.isFinite(n) ? n.toFixed(digits) : '無有效資料';
const examples = [
  { id: 'optical', name: '光學', example: '地表影像、岩塊與可辨識地標', use: '與地形對照，協助辨識目的地周邊的地表特徵。' },
  { id: 'thermal', name: '熱', example: '日夜地表溫度、熱慣量', use: '補充地表熱環境與活動時段的評估背景。' },
  { id: 'spectral', name: '光譜', example: '礦物吸收特徵、含水礦物分布', use: '協助比較候選科學目標與採樣區域。' },
  { id: 'terrain', name: '地形', example: '高程、坡度、地形陰影與粗糙度', use: '檢視地勢、視線遮蔽與路線坡度條件。' },
  { id: 'geophysical', name: '地球物理', example: '重力、磁場、地下雷達剖面', use: '提供區域構造與地下環境的背景，需配合資料尺度解讀。' },
  { id: 'atmospheric', name: '大氣', example: '氣壓、風、塵埃與能見度', use: '補充觀測能見度與行進時段的環境資訊。' },
  { id: 'radiation', name: '輻射', example: '輻射劑量率、累積曝露', use: '提供停留時間與任務曝露評估的背景。' },
  { id: 'chemical', name: '化學', example: '元素組成、鹽類與樣本分析', use: '補充採樣價值與地表材料的解讀。' },
];
const active = computed(() => examples.filter(e => e.id === (
  s.layer === 'none' ? 'optical' : ['slope', 'hillshade', 'roughness', 'geology'].includes(s.layer) ? 'terrain' : s.layer
)));
</script>

<template>
  <div class="science-context">
    <p class="hint" role="status">{{ location ? `所選位置：${location.name}` : '尚未選擇位置；請在「任務」新增目的地，或在「探索」選擇景點。' }}</p>
    <p v-if="point" class="hint">{{ value(point.lat, 5) }}°N / {{ value(point.lng, 5) }}°E · 火星行星中心座標</p>
    <article v-for="item in active" :key="item.id" class="detail-card">
      <h3>{{ item.name }}</h3>
      <template v-if="item.id === 'terrain'">
        <template v-if="point">
          <p>DEM 高程：{{ value(point.height) }} m<br />DEM 衍生坡度：{{ value(point.slope, 1) }}°<br />格距：約 {{ value(point.cellMeters) }} m</p>
          <p v-if="point.unit">USGS 地質單元：{{ point.unit }}</p>
          <a v-if="point.source" :href="point.source" target="_blank" rel="noopener noreferrer">數值 DEM 原始產品 ↗</a>
          <p class="hint">高程為 DEM 內插值；坡度依格距估算。缺值與邊界不外推，格網無法判定車輪尺度障礙。<span v-if="s.geologyAvailable">地質為 1:75,000 解釋圖。</span></p>
        </template>
        <p v-else class="hint">請先選擇位置，並等待 DEM 載入完成。</p>
      </template>
      <template v-else-if="item.id === 'optical'">
        <template v-if="!s.regional && !s.globalView">
          <p>{{ s.siteId === 'gale' ? 'USGS HiRISE 正射影像：原生 0.25 m/pixel，本站約 6.67 m/pixel；彩色覆蓋約 51.5%，其他區域以灰階補足。' : s.siteId === 'valles-ctx' ? 'USGS CTX 正射影像：原生約 20 m/pixel，本站 40 m/pixel；缺值保持透明。' : 'USGS CTX 正射影像：顯示原始完整影像範圍；原生約 5 m/pixel，本站約 20 m/pixel。DEM 涵蓋中央 30×30 km。' }}</p>
          <button :disabled="!s.ready || s.regionLoading" @click="s.optical = true; s.layer = 'none'">在地圖查看光學影像</button>
          <a :href="m.asset(s.siteId === 'gale' ? 'data/gale/optical-source.json' : s.siteId === 'valles-ctx' ? 'data/valles/optical-source.json' : 'data/jezero-extended/optical-source.json')" target="_blank" rel="noopener noreferrer">影像來源與處理紀錄 ↗</a>
          <p class="hint">靜態拼圖，非即時影像；目的地若在影像裁切範圍外，無該點影像。</p>
        </template>
        <template v-else>
          <p class="hint">USGS Viking 全球彩色光學拼圖 · 展示約 10.4 km/pixel；光學影像不提供地形高程，非即時影像。</p>
          <button :disabled="!s.ready" @click="s.optical = true; s.layer = 'none'">在地圖查看光學影像</button>
          <a href="https://astrogeology.usgs.gov/search/map/mars_viking_colorized_global_mosaic_232m" target="_blank" rel="noopener noreferrer">Viking 影像來源 ↗</a>
        </template>
      </template>
      <template v-else>
        <p class="hint" role="status">{{ s.scienceStatus }}</p>
        <button v-if="!s.scienceLoading && (!meta || s.scienceStatus.includes('失敗'))" @click="m.retryScience">重試載入科學圖層</button>
        <template v-if="meta">
          <template v-if="meta.kind === 'raster'">
            <p>{{ meta.title }}</p>
            <div class="science-scale" :style="{ background: 'linear-gradient(to right,' + palettes[s.layerStyles[s.layer].palette].map(c => 'rgb(' + c.join(',') + ')').join(',') + ')' }" aria-hidden="true"></div>
            <p class="hint">{{ range[0] }} → {{ range[1] }} {{ meta.unit }} · 缺值透明</p>
            <p v-if="cell" class="hint">列 {{ cell.row }}、欄 {{ cell.col }} · 東經 {{ cell.west }}°–{{ cell.east }}°、北緯 {{ cell.south }}°–{{ cell.north }}°</p>
            <p v-if="stationCells.length === 2 && stationCells.every(Boolean)">{{ stationCells[0].row === stationCells[1].row && stationCells[0].col === stationCells[1].col ? 'A、B 位於同一格，此產品無法區分兩站。' : 'A、B 位於不同格，可比較各格有效讀值。' }}</p>
            <p v-if="point" class="science-sample">所選位置：{{ sampled === null ? '此格無有效資料' : value(sampled, 3) + ' ' + meta.unit }}</p>
            <p class="hint">原生產品最高 {{ meta.native_ppd }} pixels/degree；下載展示 {{ meta.display_ppd }} pixels/degree。游標及所選位置讀取下載格網，不跨缺值內插。</p>
            <p v-if="item.id === 'geophysical'" class="hint">GMM-3 截至球諧階數 100 的重力異常模型；顯示格距不代表模型能解析同尺度地形。</p>
            <p v-if="item.id === 'chemical'" class="hint">GRS 鐵濃度是 5° 格網的區域質量百分比，不能解析局部岩樣或小尺度導航障礙。</p>
            <p v-if="item.id === 'spectral'" class="hint">此疊圖為 TES 熱紅外光譜解混的礦物豐度產品，並非 CRISM 高解析礦物圖。</p>
            <button @click="m.focusScience">查看全球疊圖</button>
            <a :href="m.asset(`data/science/${item.id}.bin`)" download>下載數值格網</a>
          </template>
          <template v-else>
            <p>{{ meta.name }}：{{ value(meta.value, 3) }} {{ meta.unit }}</p>
            <p class="hint">{{ meta.start }}{{ meta.stop ? ' 至 ' + meta.stop : ' 起' }} · {{ meta.count }} 筆有效樣本</p>
            <p class="hint">範圍 {{ value(meta.min, 3) }}–{{ value(meta.max, 3) }} {{ meta.unit }}</p>
            <p class="hint">{{ meta.note }}</p>
            <button @click="m.focusScience">查看測站位置</button>
            <a :href="m.asset(meta.source.local)" download>下載觀測原表</a>
            <a :href="meta.coordinate_source" target="_blank" rel="noopener noreferrer">測站座標來源 ↗</a>
          </template>
          <p><a :href="meta.source.url" target="_blank" rel="noopener noreferrer">原始資料來源 ↗</a> · <a :href="m.asset('data/science/manifest.json')" target="_blank" rel="noopener noreferrer">座標、處理與 SHA-256 紀錄 ↗</a></p>
        </template>
      </template>
      <p class="hint">{{ item.use }}</p>
    </article>
    <p class="hint">熱圖可獨立顯示。熱慣量成本{{ s.navigation.thermalEnabled ? "已啟用" : "未啟用" }}，地質材質成本{{ s.navigation.geologyEnabled ? "已啟用" : "未啟用" }}。路線另使用地形與禁行區。歷史觀測不代表所選位置已完成安全評估。</p>
  </div>
</template>

<style scoped>
.science-context .detail-card { margin-top: 10px; }
.science-scale { height: 10px; border-radius: 4px; background: linear-gradient(to right, rgb(35,70,150), rgb(42,180,180), rgb(235,220,100), rgb(210,65,50)); }
.science-context a { overflow-wrap: anywhere; }
.science-context button { margin: 4px 8px 4px 0; }
</style>
