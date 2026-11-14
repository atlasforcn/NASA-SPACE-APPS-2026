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
  return labels[m.state.layer] || "地圖圖層";
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
    :class="{ drawing: m.state.drawMode }"
    role="region"
    aria-label="火星地圖"
  ></div>
  <div class="map-badge">
    <p class="eyebrow">02 / TERRAIN EXPLORER</p>
    <h2>{{ m.state.mapTitle }}</h2>
    <p>拖曳移動 · 滾輪縮放 · 在「任務」設定起終點</p>
  </div>
  <details class="map-legend">
    <summary>地圖標示與顏色</summary>
    <div class="legend-grid">
      <span><i class="legend-dot mint"></i>青色圓點：導航估計</span>
      <span><i class="legend-dot gold"></i>亮黃色標記：目的地／站點</span>
      <span><i class="legend-line mint"></i>青色實線：建議路線</span>
      <span><i class="legend-line gold dashed"></i>亮黃色虛線：理想直線</span>
      <span><i class="legend-line red"></i>紅色線段：超出通行條件</span>
      <span><i class="legend-line orange"></i>橘色線：行進軌跡</span>
      <span><i class="legend-dot orange"></i>橘色圓點：模擬真值（開啟時）</span>
      <span><i class="legend-ring"></i>圓環：定位候選，青色為首選</span>
    </div>
  </details>
  <div class="map-actions">
    <div v-if="m.state.tab !== 'layers' || !m.state.panelOpen" class="map-layer-status" aria-live="polite">
      <span class="map-layer-status__label">目前圖層</span>
      <strong>{{ activeLayer }}</strong>
      <LayerControls compact />
      <span class="map-height" role="status">{{ m.state.elevation || "移動游標查看高度" }}</span>
      <span v-if="m.state.legend" class="map-layer-status__detail">{{ m.state.legend }}</span>
      <button type="button" @click="openLayers">調整圖層 ↗</button>
    </div>
    <button id="mars-overview" :disabled="!m.state.ready" @click="m.overview">
      火星全覽 ↗</button>
  </div>
</template>
