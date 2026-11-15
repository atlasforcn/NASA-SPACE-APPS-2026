<script setup>
import { computed, provide, watch, nextTick } from "vue";
import { useMission, missionKey } from "./useMission";
import regions from "../regions.mjs";
import { asset } from "./asset";
import MissionMap from "./components/MissionMap.vue";
import ExplorePanel from "./components/ExplorePanel.vue";
import TaskPanel from "./components/TaskPanel.vue";
import LayersPanel from "./components/LayersPanel.vue";
import LocalizationPanel from "./components/LocalizationPanel.vue";
const mission = useMission(),
  { state: s } = mission;
const mola = {
  title: '自訂火星區域', english: 'MOLA', image: 'data/mars-global-dem.jpg',
  description: '火星軌道雷射高度計（MOLA）測量全球地勢。可在所選座標比較山地與盆地的高差；公里級格網無法判斷腳下的岩塊。',
};
const region = computed(() => regions.find(r => r.id === s.siteId) ?? mola);
provide(missionKey, mission);
watch(
  () => s.panelOpen,
  async () => {
    await nextTick();
    mission.resize();
  },
);
if (import.meta.env.MODE === "test") window.__mission = mission;
</script>
<template>
  <header class="topbar">
    <a class="brand" href="./"
      ><svg class="brand-mark" viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r="14" fill="currentColor" />
        <path d="M9 22c5-2 8-2 12 0s7 2 10 0M12 14c3 1 5 1 8 0m-6 15c4-2 8-2 12 0" fill="none" stroke="#713f2e" stroke-linecap="round" stroke-width="2" />
        <path d="M5 31c8 5 22 6 31-1" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2" />
      </svg
      ><span><strong>Journey to the Mars</strong><small>MARTIAN NAVIGATOR</small></span></a
    >
    <div class="mission-signal">
      <i :class="{ busy: s.searching || s.loading }"></i
      >{{ s.regional ? "MOLA 區域任務" : s.siteName.toUpperCase() + " · MARS"
      }}<span>真實地形 / 模擬觀測</span>
    </div>
    <button id="reset" :disabled="!s.ready" @click="mission.reset()">
      ↻ 重設任務
    </button>
  </header>
  <main class="workspace" :class="{ 'panel-closed': !s.panelOpen }">
    <section class="map-workspace">
      <MissionMap />
      <div v-if="s.error" class="error-banner" role="alert">
        {{ s.error }}<button @click="mission.boot">重試載入</button>
      </div>
      <div class="map-caption">
        <span>{{ s.mapContext }}</span
        ><span>{{ s.coords }}</span>
      </div>
    </section>
    <aside class="control-panel" aria-label="任務操作">
      <button
        class="panel-toggle"
        :aria-expanded="s.panelOpen"
        aria-controls="panel-content"
        @click="s.panelOpen = !s.panelOpen"
      >
        {{ s.panelOpen ? "收合面板 ↓" : "開啟任務面板 ↑" }}
      </button>
      <div id="panel-content" v-show="s.panelOpen">
        <header class="panel-heading" :style="{ '--region-image': 'url(' + asset(region.image) + ')' }">
          <div aria-live="polite" aria-atomic="true">
            <p class="region-name">探索區域 <span lang="en">{{ region.english }}</span></p>
            <h1>{{ region.title }}</h1>
            <p class="region-description">{{ region.description }}</p>
          </div>
          <p class="region-status" role="status">{{ s.warning }}</p>
        </header>
        <button v-if="!s.walk" id="start-walk" class="primary" :disabled="!s.ready || s.regionLoading || s.regional || s.siteId !== 'jezero'" @click="mission.startWalk">開始 Jezero 科學任務</button>
        <nav class="tabs" aria-label="控制面板分頁">
          <button
            v-for="tab in [
              { id: 'explore', name: '探索' },
              { id: 'mission', name: '任務' },
              { id: 'layers', name: '圖層' },
            ]"
            :key="tab.id"
            :aria-pressed="s.tab === tab.id"
            @click="s.tab = tab.id"
          >
            {{ tab.name }}
          </button>
        </nav>
        <div class="panel-scroll">
          <ExplorePanel v-show="s.tab === 'explore'" /><TaskPanel
            v-show="s.tab === 'mission'"
          /><LayersPanel v-show="s.tab === 'layers'" />
        </div>
      </div>
    </aside>
    <LocalizationPanel />
  </main>
</template>
