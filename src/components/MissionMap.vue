<script setup>
import { inject, ref, computed, onMounted, onUnmounted } from "vue";
import { missionKey } from "../useMission";
import LayerControls from './LayerControls.vue';
const m = inject(missionKey),
  container = ref();
let observer;
const activeLayer = computed(() => {
  const labels = {
    none: (m.state.globalView || m.state.regional) ? (m.state.optical ? "Viking 全球光學影像" : "MOLA 全球地形陰影") : (m.state.optical ? (m.state.siteId === "gale" ? "HiRISE 彩色正射影像" : "CTX 光學影像") : "底圖影像關閉"),
    terrain: m.state.globalView ? "MOLA 全球高程" : "DEM 高程",
    slope: "DEM 坡度",
    hillshade: "DEM 地形陰影",
    roughness: "DEM 粗糙度",
    geology: "USGS 地質單元",
    thermal: "TES 熱慣量",
    spectral: "TES 橄欖石豐度",
    geophysical: "GMM-3 重力異常",
    atmospheric: "MEDA 氣壓測站",
    radiation: "RAD 吸收劑量測站",
    chemical: "GRS 鐵濃度格網",
  };
  return m.state.layers.length
    ? m.state.layers.map(id => labels[id] || id).join('、')
    : labels.none;
});
function openLayers() {
  m.state.tab = "layers";
  m.state.panelOpen = true;
}
onMounted(() => {
  m.mount(container.value);
  observer = new ResizeObserver(() => m.resize());
  observer.observe(container.value);
});
onUnmounted(() => observer?.disconnect());
</script>
<template>
  <div
    ref="container"
    id="map"
    class="map"
    :class="{ drawing: m.state.drawMode || m.state.pickingNoGo }"
    role="region"
    aria-label="火星地圖"
  ></div>
  <div class="map-badge">
    <h2>{{ m.state.walk ? '基地 → 觀測點 A' : m.state.mapTitle }}</h2>
    <p v-if="m.state.pickingNoGo" role="status">點選地圖，設定禁行區中心。</p>
    <p v-else-if="!m.state.walk">拖曳移動 · 滾輪縮放 · 在「任務」設定起終點</p>
  </div>
  <details class="map-legend">
    <summary>地圖標示與顏色</summary>
    <div v-if="m.state.walk" class="legend-grid">
      <span><i class="legend-dot gold"></i>任務基地與觀測點 A</span>
      <span><i class="legend-line gold dashed"></i>待檢查的直線</span>
      <span><i class="legend-line mint"></i>符合通行門檻</span>
      <span><i class="legend-line red"></i>需改道的路線</span>
      <span><i class="legend-line orange"></i>暫緩出發</span>
      <span><i class="assessment-marker"></i>判定依據的位置</span>
      <template v-if="m.state.showNavigationRisk && !m.state.globalView">
        <span><i class="risk-area red"></i>超出通行門檻或禁行區</span>
        <span><i class="risk-area orange"></i>地形資料不足區</span>
      </template>
      <span v-if="m.state.walk.detour"><i class="legend-line dashed" :class="{ go: 'mint', reroute: 'red', hold: 'orange' }[m.state.walk.detour.verdict]"></i>替代路線</span>
    </div>
    <div v-else class="legend-grid">
      <span><i class="legend-dot mint"></i>青色圓點：導航估計</span>
      <span><i class="legend-dot gold"></i>亮黃色標記：目的地／站點</span>
      <span><i class="legend-line mint"></i>青色實線：建議路線</span>
      <span><i class="legend-line gold dashed"></i>亮黃色虛線：理想直線</span>
      <span><i class="legend-line red"></i>紅色線段：超出通行條件</span>
      <span><i class="legend-line orange"></i>橘色線：行進軌跡</span>
      <span><i class="legend-dot orange"></i>橘色圓點：模擬真值（開啟時）</span>
      <span><i class="legend-dot red"></i>紅色區域：超出通行上限</span>
      <span>黃色區域：地形資料不足</span>
      <span><i class="legend-ring"></i>圓環：定位候選，青色為首選</span>
    </div>
  </details>
  <div class="map-actions">
    <div v-if="m.state.tab !== 'layers' || !m.state.panelOpen" class="map-layer-status" aria-live="polite">
      <span class="map-layer-status__label">目前圖層</span>
      <strong>{{ activeLayer }}</strong>
      <LayerControls v-if="!m.state.walk" compact />
      <span class="map-height" role="status">{{ m.state.elevation || "移動游標查看高度" }}</span>
      <span v-if="m.state.legend" class="map-layer-status__detail">{{ m.state.legend }}</span>
      <button type="button" @click="openLayers">調整圖層 ↗</button>
    </div>
    <button v-if="!m.state.walk" id="mars-overview" :disabled="!m.state.ready" @click="m.overview">
      火星全覽 ↗</button>
  </div>
</template>

<style scoped>
.assessment-marker { width: 12px; height: 12px; flex-shrink: 0; border: 2px solid #17242a; border-radius: 50%; background: #d8ddd5; outline: 1px solid #a2b5b2; }
.risk-area { width: 11px; height: 11px; flex-shrink: 0; background: currentColor; opacity: .8; }
</style>
