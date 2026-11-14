<script setup>
import { inject, ref, onMounted, onUnmounted } from "vue";
import { missionKey } from "../useMission";
const m = inject(missionKey),
  container = ref();
let observer;
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
  <details class="map-legend" open>
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
    <button id="mars-overview" :disabled="!m.state.ready" @click="m.overview">
      火星全覽 ↗</button>
  </div>
</template>
