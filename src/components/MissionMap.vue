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
    none: (m.state.globalView || m.state.regional) ? (m.state.optical ? "Viking global imagery" : "MOLA global hillshade") : (m.state.optical ? (m.state.siteId === "gale" ? "HiRISE color orthophoto" : "CTX optical imagery") : "Basemap imagery off"),
    terrain: m.state.globalView ? "MOLA global elevation" : "DEM elevation",
    slope: "DEM slope",
    hillshade: "DEM hillshade",
    roughness: "DEM roughness",
    geology: "USGS geological units",
    thermal: "TES thermal inertia",
    spectral: "TES olivine abundance",
    geophysical: "GMM-3 gravity anomaly",
    atmospheric: "MEDA pressure station",
    radiation: "RAD absorbed dose rate station",
    chemical: "GRS iron concentration grid",
  };
  return m.state.layers.length
    ? m.state.layers.map(id => labels[id] || id).join(', ')
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
    aria-label="Mars map"
    @pointerdown.capture="dismissMapHint"
    @wheel.capture.passive="dismissMapHint"
    @keydown.capture="dismissMapHint"
  ></div>
  <div class="map-badge">
    <h2>{{ m.state.walk ? 'Base → observation site A' : m.state.mapTitle }}</h2>
    <p v-if="m.state.pickingNoGo" role="status">Select the center of the exclusion zone on the map.</p>
    <p v-else-if="m.state.localizationOpen && !m.state.globalView && m.viewBearing.value !== null" aria-live="polite">
      Orange arrow · {{ m.state.externalHorizon ? 'Candidate viewing direction' : 'Viewing direction' }} {{ Math.round(m.viewBearing.value) % 360 }}°
    </p>
    <p v-else-if="!m.state.walk && showMapHint">Drag the map to explore. Zoom in for terrain detail.</p>
    <div class="station-hints" aria-live="polite" aria-atomic="true">
      <template v-if="exceeded.length">
        <small>Historical station</small>
        <button v-for="check in exceeded" :key="check.id" :data-check="check.id"
          class="station-exceedance" type="button" aria-controls="environment-readings" @click="showReadings">
          <b aria-hidden="true">!</b> {{ check.label }} above limit
        </button>
      </template>
    </div>
  </div>
  <details class="map-legend">
    <summary>Map symbols and colors</summary>
    <div v-if="m.state.walk" class="legend-grid">
      <span><i class="legend-dot gold"></i>Mission base and observation site A</span>
      <span><i class="legend-line gold dashed"></i>Straight line from the base to A</span>
      <span><i class="legend-line mint"></i>Meets terrain limits</span>
      <span><i class="legend-line red"></i>Straight-line segment above the slope limit</span>
      <span><i class="legend-line orange"></i>Hold departure</span>
      <span><i class="assessment-marker"></i>Location used in the assessment</span>
      <NavigationRiskKey v-if="m.state.showNavigationRisk && !m.state.globalView" />
      <span v-for="option in m.state.walk.alternatives" :key="option.id"><i class="legend-line" :class="{ dashed: m.state.walk.selectedAlternative !== option.id }" :style="{ color: option.color }"></i>{{ option.name }}{{ m.state.walk.selectedAlternative === option.id ? ' (selected)' : '' }}</span>
    </div>
    <div v-else class="legend-grid">
      <span><i class="legend-dot mint"></i>Cyan dot: estimated position</span>
      <span><i class="legend-dot gold"></i>Yellow marker: destination or stop</span>
      <span><i class="legend-line mint"></i>Solid cyan line: recommended route</span>
      <span><i class="legend-line gold dashed"></i>Dashed yellow line: straight line</span>
      <span><i class="legend-line red"></i>Red segment: exceeds terrain limits</span>
      <span><i class="legend-line orange"></i>Orange line: traveled path</span>
      <span><i class="legend-dot orange"></i>Orange dot: simulated true position (when enabled)</span>
      <NavigationRiskKey />
      <span><i class="legend-ring"></i>Rings: candidate positions, top candidate in cyan</span>
    </div>
  </details>
  <div class="map-actions" :class="{ 'horizon-actions': m.state.localizationOpen }">
    <div v-if="m.state.tab !== 'layers' || !m.state.panelOpen" class="map-layer-status" aria-live="polite">
      <span class="map-layer-status__label">Active layers</span>
      <strong>{{ activeLayer }}</strong>
      <LayerControls v-if="!m.state.walk" compact />
      <span class="map-height" role="status">{{ m.state.elevation || "Hover to read elevation" }}</span>
      <span v-if="m.state.legend" class="map-layer-status__detail">{{ m.state.legend }}</span>
      <button type="button" @click="openLayers">Adjust layers ↗</button>
    </div>
    <button v-if="!m.state.walk" id="mars-overview" :disabled="!m.state.ready" @click="m.overview">
      Global view ↗</button>
  </div>
</template>

<style scoped>
.station-hints:not(:empty) { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem .45rem; }
.station-hints small { color: var(--muted); font-size: .7rem; }
.station-hints button { pointer-events: auto; margin: 0; border: 0; padding: .25rem 0; background: transparent; font-size: .75rem; }
.station-hints button:hover { text-decoration: underline; }
.assessment-marker { width: 12px; height: 12px; flex-shrink: 0; border: 2px solid #17242a; border-radius: 50%; background: #d8ddd5; outline: 1px solid #a2b5b2; }
</style>
