<script setup>
import { computed, ref, provide, watch, nextTick, onMounted, onBeforeUnmount } from "vue";
import { useMission, missionKey } from "./useMission";
import regions from "../regions.mjs";
import { asset } from "./asset";
import MissionMap from "./components/MissionMap.vue";
import RouteProfile from "./components/RouteProfile.vue";
import ExplorePanel from "./components/ExplorePanel.vue";
import TaskPanel from "./components/TaskPanel.vue";
import LayersPanel from "./components/LayersPanel.vue";
import LocalizationPanel from "./components/LocalizationPanel.vue";
import CuriosityDemo from "./components/CuriosityDemo.vue";
const mission = useMission(),
  { state: s } = mission;
const mola = {
  title: '自訂火星區域', english: 'MOLA', image: 'data/mars-global-dem.jpg',
  description: '火星軌道雷射高度計（MOLA）測量全球地勢。可在所選座標比較山地與盆地的高差；公里級格網無法判斷腳下的岩塊。',
};
const region = computed(() => regions.find(r => r.id === s.siteId) ?? mola);
const choosing = ref(true);
const demoHash = '#dingo-gap';
const demoOpen = ref(window.location.hash === demoHash);
let demoOpener = null;

function openDemo(event) {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  demoOpener = event.currentTarget;
  if (window.location.hash !== demoHash) {
    history.pushState({ ...history.state, curiosityDemoEntry: true }, '', demoHash);
  }
  demoOpen.value = true;
}
function syncDemoFromUrl() {
  const wasOpen = demoOpen.value;
  demoOpen.value = window.location.hash === demoHash;
  if (wasOpen && !demoOpen.value) {
    nextTick(() => {
      const target = demoOpener?.isConnected ? demoOpener : document.getElementById('curiosity-demo-entry');
      target?.focus({ preventScroll: true });
    });
  }
}
function closeDemo() {
  if (history.state?.curiosityDemoEntry) {
    history.back();
  } else {
    history.replaceState(history.state, '', window.location.pathname + window.location.search);
    syncDemoFromUrl();
  }
}
onMounted(() => window.addEventListener('hashchange', syncDemoFromUrl));
onBeforeUnmount(() => window.removeEventListener('hashchange', syncDemoFromUrl));

function enterFree() {
  if (s.walk) mission.reset();
  s.tab = 'explore';
  s.panelOpen = true;
  choosing.value = false;
  nextTick(() => document.getElementById('region-title')?.focus());
}
async function enterWalk() {
  if (!s.ready || s.regionLoading) return;
  if (s.regional || s.siteId !== 'jezero') mission.restore();
  if (!s.walk) await mission.startWalk();
  if (!s.walk) return;
  s.localizationOpen = false;
  s.tab = 'mission';
  s.panelOpen = true;
  choosing.value = false;
  nextTick(() => document.getElementById('region-title')?.focus());
}
function chooseMode() {
  s.localizationOpen = false;
  choosing.value = true;
  nextTick(() => document.getElementById('mode-title')?.focus());
}
function resetMode() {
  const guided = !!s.walk;
  mission.reset();
  if (guided) chooseMode();
}
function showQuestionLayer() {
  s.layer = s.globalView ? 'terrain' : s.siteId === 'jezero' && !s.regional ? 'geology' : 'slope';
  s.tab = 'layers';
}
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
  <header class="topbar" :inert="choosing">
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
      }}<span>{{ s.walk ? '出發前路線檢查' : '真實地形 / 模擬觀測' }}</span>
    </div>
    <button v-if="!s.walk" id="open-localization" aria-controls="localization-tool" :aria-expanded="s.localizationOpen" @click="mission.openLocalization">用山頂相儀找出我的位置</button>
    <button id="reset" :disabled="!s.ready" @click="resetMode">
      ↻ 重設任務
    </button>
  </header>
  <section v-if="choosing" class="mode-landing" :style="{'--landing-image': 'url(' + asset('data/jezero-extended/optical.png') + ')'}" aria-labelledby="mode-title">
    <div class="mode-menu">
      <p class="eyebrow">Journey to the Mars</p><h1 id="mode-title" tabindex="-1">這次想怎麼探索火星？</h1>
      <button id="start-walk" :disabled="!s.ready || s.regionLoading" @click="enterWalk"><strong>Jezero 科學任務</strong><span>前往觀測站 A。找出直線上的陡坡，比較兩條繞行路線的距離與坡度。</span><b>{{ s.walk ? '繼續科學任務' : '開始路線檢查' }} →</b></button>
      <button id="start-free" @click="enterFree"><strong>自由探索</strong><span>選一處隕石坑或峽谷，跟著當地問題讀圖。也可以自選起點和終點，再用山頂相儀找出自己的位置。</span><b>選擇探索區域 →</b></button>
      <a id="curiosity-demo-entry" class="demo-entry" :href="demoHash" aria-haspopup="dialog" @click="openDemo">用好奇號實拍山稜找位置 <span aria-hidden="true">→</span></a>
      <p v-if="s.error" role="alert">{{ s.error }} <button @click="mission.boot">重試載入</button></p>
    </div>
  </section>
  <main :inert="choosing" class="workspace" :class="{ 'panel-closed': !s.panelOpen, 'planning-view': !s.localizationOpen }">
    <section class="map-workspace">
      <div class="map-frame">
        <MissionMap />
        <div v-if="s.error" class="error-banner" role="alert">
          {{ s.error }}<button @click="mission.boot">重試載入</button>
        </div>
        <div class="map-caption">
          <span>{{ s.mapContext }}</span><span>{{ s.coords }}</span>
        </div>
      </div>
      <RouteProfile v-if="!choosing" />
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
            <button class="mode-switch" @click="chooseMode">切換模式</button>
            <p class="region-name">{{ s.walk ? "科學任務" : "自由探索" }} <span lang="en">{{ region.english }}</span></p>
            <h1 id="region-title" tabindex="-1">{{ region.title }}</h1>
            <p v-if="!s.walk" class="region-description">{{ region.description }}</p>
          </div>
          <p v-if="!s.walk || s.warning.includes('失敗')" class="region-status" role="status">{{ s.warning }}</p>
        </header>
        <nav class="tabs" aria-label="控制面板分頁">
          <button
            v-for="tab in [
              { id: 'explore', name: '探索' },
              { id: 'mission', name: '任務' },
              { id: 'layers', name: '圖層' },
            ].filter(t => !s.walk || t.id !== 'explore')"
            :key="tab.id"
            :aria-pressed="s.tab === tab.id"
            @click="s.tab = tab.id"
          >
            {{ s.walk && tab.id === 'mission' ? '路線檢查' : tab.name }}
          </button>
        </nav>
        <div class="panel-scroll">
          <section v-if="!s.walk && s.tab !== 'layers'" class="region-actions">
            <template v-if="s.tab === 'explore'">
              <p>{{ region.question || '這個區域的高地與低地在哪裡？' }}</p>
              <button :disabled="!s.ready || s.regionLoading" @click="showQuestionLayer">{{ s.globalView ? '查看全球高程' : s.siteId === 'jezero' && !s.regional ? '查看地質圖' : '查看坡度圖' }}</button>
            </template>
            <p role="status">{{ s.pickingStart || s.pickingTarget ? s.routeStatus : s.hasStart ? '起始點已設定' : '從哪裡出發？' }}</p>
            <button id="pick-start" :disabled="!s.ready || s.regionLoading" :aria-pressed="s.pickingStart" @click="mission.beginStart">{{ s.pickingStart ? '取消選起點' : s.hasStart ? '重選起始點' : '在地圖上點選起始點' }}</button>
            <button v-if="s.hasStart && s.tab === 'explore'" :aria-pressed="s.pickingTarget" @click="mission.beginTarget">{{ s.pickingTarget ? '取消選點' : '在地圖上選目的地' }}</button>
            <button v-if="s.hasStart && s.destination && s.tab === 'explore'" :disabled="s.regionLoading || s.navigationLoading || !!s.navigationError" @click="s.tab='mission'; mission.plan()">規劃這條路線 →</button>
          </section>
          <ExplorePanel v-if="!s.walk" v-show="s.tab === 'explore'" /><TaskPanel
            v-show="s.tab === 'mission'"
          /><LayersPanel v-show="s.tab === 'layers'" />
        </div>
      </div>
    </aside>
    <LocalizationPanel v-if="!s.walk" v-show="s.localizationOpen" @open-demo="openDemo" />
  </main>
  <CuriosityDemo v-if="demoOpen" @close="closeDemo" />
</template>
