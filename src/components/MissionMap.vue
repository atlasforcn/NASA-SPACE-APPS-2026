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
    <p>青 · 導航估計　金 · 科學站　圓環 · 定位候選</p>
  </div>
  <div class="map-actions">
    <button id="mars-overview" :disabled="!m.state.ready" @click="m.overview">
      火星全覽 ↗</button
    ><button id="jezero-home" :disabled="!m.state.ready" @click="m.restore">
      返回 Jezero
    </button>
  </div>
</template>
