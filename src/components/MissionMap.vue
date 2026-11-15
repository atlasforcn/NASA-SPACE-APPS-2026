<script setup>
import NavigationRiskKey from "./NavigationRiskKey.vue";
import { inject, ref, computed, nextTick, onMounted, onUnmounted } from "vue";
import { missionKey } from "../useMission";
import LayerControls from './LayerControls.vue';
const m = inject(missionKey),
  container = ref();
const showMapHint = ref(true);
const exceeded = computed(() => m.environment.checks.value.filter(check => check.overLimit.length));
async function showReadings() {
  await openLayers();
  await nextTick();
  const details = document.getElementById('environment-readings');
  details.open = true;
  details.querySelector('summary').focus();
}
function dismissMapHint() {
  if (!m.state.walk) showMapHint.value = false;
}
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
async function openLayers() {
  m.state.tab = "layers";
  m.state.panelOpen = true;
  if (window.matchMedia("(max-width: 700px)").matches) {
    await nextTick();
    document.getElementById("layer-settings-title")?.focus();
  }
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
    @pointerdown.capture="dismissMapHint"
    @wheel.capture.passive="dismissMapHint"
    @keydown.capture="dismissMapHint"
  ></div>
  <div class="map-badge">
    <h2>{{ m.state.walk ? '基地 → 觀測點 A' : m.state.mapTitle }}</h2>
    <p v-if="m.state.pickingNoGo" role="status">點選地圖，設定禁行區中心。</p>
    <p v-else-if="m.state.localizationOpen && !m.state.globalView && m.viewBearing.value !== null" aria-live="polite">
      橘色箭頭 · {{ m.state.externalHorizon ? '候選視線方位' : '視線方位' }} {{ Math.round(m.viewBearing.value) % 360 }}°
    </p>
    <p v-else-if="!m.state.walk && showMapHint">拖曳地圖，放大查看地形。</p>
    <div class="station-hints" aria-live="polite" aria-atomic="true">
      <template v-if="exceeded.length">
        <small>歷史測站</small>
        <button v-for="check in exceeded" :key="check.id" :data-check="check.id"
          class="station-exceedance" type="button" aria-controls="environment-readings" @click="showReadings">
          <b aria-hidden="true">!</b> {{ check.label }}超標
        </button>
      </template>
    </div>
  </div>
  <details class="map-legend">
    <summary>地圖標示與顏色</summary>
    <div v-if="m.state.walk" class="legend-grid">
      <span><i class="legend-dot gold"></i>任務基地與觀測點 A</span>
      <span><i class="legend-line gold dashed"></i>基地到 A 的直線</span>
      <span><i class="legend-line mint"></i>符合通行門檻</span>
      <span><i class="legend-line red"></i>直線取樣超過坡度上限的路段</span>
      <span><i class="legend-line orange"></i>暫緩出發</span>
      <span><i class="assessment-marker"></i>判定依據的位置</span>
      <NavigationRiskKey v-if="m.state.showNavigationRisk && !m.state.globalView" />
      <span v-for="option in m.state.walk.alternatives" :key="option.id"><i class="legend-line" :class="{ dashed: m.state.walk.selectedAlternative !== option.id }" :style="{ color: option.color }"></i>{{ option.name }}{{ m.state.walk.selectedAlternative === option.id ? '（已選）' : '' }}</span>
    </div>
    <div v-else class="legend-grid">
      <span><i class="legend-dot mint"></i>青色圓點：導航估計</span>
      <span><i class="legend-dot gold"></i>亮黃色標記：目的地／站點</span>
      <span><i class="legend-line mint"></i>青色實線：建議路線</span>
      <span><i class="legend-line gold dashed"></i>亮黃色虛線：理想直線</span>
      <span><i class="legend-line red"></i>紅色線段：超出通行條件</span>
      <span><i class="legend-line orange"></i>橘色線：行進軌跡</span>
      <span><i class="legend-dot orange"></i>橘色圓點：模擬真值（開啟時）</span>
      <NavigationRiskKey />
      <span><i class="legend-ring"></i>圓環：定位候選，青色為首選</span>
    </div>
  </details>
  <div class="map-actions" :class="{ 'horizon-actions': m.state.localizationOpen }">
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
.station-hints:not(:empty) { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem .45rem; }
.station-hints small { color: var(--muted); font-size: .7rem; }
.station-hints button { pointer-events: auto; margin: 0; border: 0; padding: .25rem 0; background: transparent; font-size: .75rem; }
.station-hints button:hover { text-decoration: underline; }
.assessment-marker { width: 12px; height: 12px; flex-shrink: 0; border: 2px solid #17242a; border-radius: 50%; background: #d8ddd5; outline: 1px solid #a2b5b2; }
</style>
