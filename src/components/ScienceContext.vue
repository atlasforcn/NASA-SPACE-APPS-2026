<script setup>
import { computed, inject } from 'vue';
import { missionKey } from '../useMission';
import { recordsForSite } from '../science-context.mjs';

const m = inject(missionKey), s = m.state;
const location = computed(() => s.targets.find(t => t.id === s.destination) || s.poi);
const point = computed(() => m.scienceAt(location.value));
const records = computed(() => recordsForSite(s.siteId, s.regional));
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
          <p class="hint">高程為 DEM 內插值；坡度依格距估算。缺值與邊界不外推，格網無法判定車輪尺度障礙。地質為 1:75,000 解釋圖。</p>
        </template>
        <p v-else class="hint">請先選擇位置，並等待 DEM 載入完成。</p>
      </template>
      <template v-else-if="item.id === 'optical'">
        <template v-if="!s.regional">
          <p>{{ s.siteId === 'gale' ? 'USGS HiRISE 正射影像：原生 0.25 m/pixel，本站約 6.67 m/pixel；彩色覆蓋約 51.5%，其他區域以灰階補足。' : 'USGS CTX 正射影像：原生約 5 m/pixel，本站約 8.09 m/pixel；以百分位對比拉伸顯示。' }}</p>
          <button :disabled="!s.ready || s.regionLoading" @click="s.optical = true; s.layer = 'none'">在地圖查看光學影像</button>
          <a :href="m.asset(s.siteId === 'gale' ? 'data/gale/optical-source.json' : 'data/ctx-source.json')" target="_blank" rel="noopener noreferrer">影像來源與處理紀錄 ↗</a>
          <p class="hint">靜態拼圖，非即時影像；目的地若在影像裁切範圍外，無該點影像。</p>
        </template>
        <p v-else class="hint">全球 MOLA 是高程渲染底圖；此模式沒有接入目的地光學影像。</p>
      </template>
      <template v-else>
        <div v-for="record in records.filter(r => r.id === item.id)" :key="record.url">
          <p class="hint">{{ record.scope === 'global' ? '跨區研究參考' : record.scope + ' 區域歷史觀測' }} · {{ record.period }}</p>
          <p>{{ record.text }}</p>
          <p class="hint">{{ record.limit }}</p>
          <a :href="record.url" target="_blank" rel="noopener noreferrer">{{ record.source }} ↗</a>
        </div>
        <p v-if="!records.some(r => r.id === item.id)" class="hint">目前載入區域尚無已整理的此類觀測，未提供目的地數值。</p>
      </template>
      <p class="hint">{{ item.use }}</p>
    </article>
    <p class="hint">科學背景不改寫路線成本；路線仍依現有 DEM 與坡度門檻計算。歷史觀測不代表所選位置已完成安全評估。</p>
  </div>
</template>

<style scoped>
.science-context .detail-card { margin-top: 10px; }
</style>
