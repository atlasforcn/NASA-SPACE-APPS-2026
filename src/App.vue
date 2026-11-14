<script setup>
import { provide, watch, nextTick } from "vue";
import { useMission, missionKey } from "./useMission";
import MissionMap from "./components/MissionMap.vue";
import ExplorePanel from "./components/ExplorePanel.vue";
import TaskPanel from "./components/TaskPanel.vue";
import LayersPanel from "./components/LayersPanel.vue";
import LocalizationPanel from "./components/LocalizationPanel.vue";
const mission = useMission(),
  { state: s } = mission;
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
      ><span class="brand-mark">✳</span
      ><span><strong>山頂相儀</strong><small>MARTIAN NAVIGATOR</small></span></a
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
        <div class="panel-heading">
          <p class="eyebrow">
            MISSION CONTROL / {{ s.regional ? "GLOBAL" : s.siteName.toUpperCase() }}
          </p>
          <h1>
            {{ s.regional ? "探索火星區域地形" : "探索古湖泊的地質線索" }}
          </h1>
          <p class="hint" role="status">{{ s.warning }}</p>
        </div>
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
