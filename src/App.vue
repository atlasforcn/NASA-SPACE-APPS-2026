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
import RouteLocationChallenge from "./components/RouteLocationChallenge.vue";
const mission = useMission(),
  { state: s } = mission;
const mola = {
  title: 'Custom Mars region', english: 'MOLA', image: 'data/mars-global-dem.jpg',
  description: 'The Mars Orbiter Laser Altimeter (MOLA) measures global topography. Compare mountains and basins on its kilometer-scale grid.',
};
const region = computed(() => regions.find(r => r.id === s.siteId) ?? mola);
const choosing = ref(true);
const demoHash = '#dingo-gap';
const demoOpen = ref(window.location.hash === demoHash);
let demoOpener = null;
const challengeOpen = ref(false);
let challengeOpener = null;

function openRouteChallenge(event) {
  if (!mission.challengeRoute.value) return;
  challengeOpener = event.currentTarget;
  challengeOpen.value = true;
}
async function closeRouteChallenge() {
  challengeOpen.value = false;
  await nextTick();
  const target = challengeOpener?.isConnected ? challengeOpener : document.getElementById('region-title');
  target?.focus({ preventScroll: true });
  challengeOpener = null;
}

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

function enterFree(event, openPhoto = false) {
  if (s.walk) mission.reset();
  s.tab = 'explore';
  s.panelOpen = true;
  choosing.value = false;
  if (openPhoto) mission.openLocalization(event, 'horizon-photo');
  else nextTick(() => document.getElementById('region-title')?.focus());
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
      ><strong>Journey to the Mars</strong></a
    >
    <div class="mission-signal">
      <i :class="{ busy: s.searching || s.loading }"></i
      >{{ s.regional ? "MOLA regional mission" : s.siteName.toUpperCase() + " · MARS"
      }}<span>{{ s.walk ? 'Pre-departure route check' : 'Measured terrain / simulated observation' }}</span>
    </div>
    <button v-if="!s.walk" id="open-localization" aria-controls="localization-tool" :aria-expanded="s.localizationOpen" @click="mission.openLocalization">Find my position with the Mountain Tracker</button>
    <button id="reset" :disabled="!s.ready" @click="resetMode">
      ↻ Reset mission
    </button>
  </header>
  <section v-if="choosing" class="mode-landing" :style="{'--landing-image': 'url(' + asset('data/jezero-extended/optical.png') + ')'}" aria-labelledby="mode-title">
    <div class="mode-menu">
      <p class="eyebrow">Journey to the Mars</p><h1 id="mode-title" tabindex="-1">How would you like to explore Mars?</h1>
      <button id="start-walk" :disabled="!s.ready || s.regionLoading" @click="enterWalk"><strong>Jezero Science Mission</strong><span>Find the steep stretch on the way to observation site A and compare two detours. Then use the skyline to work out where you are on your route.</span><b>{{ s.walk ? 'Continue science mission' : 'Start route check' }} →</b></button>
      <button id="start-free" @click="enterFree"><strong>Free Exploration</strong><span>Choose your starting point and destination. Use the Mountain Tracker to find your position.</span><b>Choose a region →</b></button>
      <div class="landing-skyline-tools">
        <a id="curiosity-demo-entry" class="demo-entry" :href="demoHash" aria-haspopup="dialog" @click="openDemo">Explore Curiosity’s Dingo Gap panorama <span aria-hidden="true">→</span></a>
        <button id="start-photo" type="button" class="demo-entry" aria-controls="localization-tool" @click="enterFree($event, true)">Upload your own Mars photo to find candidate locations <span aria-hidden="true">→</span></button>
      </div>
      <p v-if="s.error" role="alert">{{ s.error }} <button @click="mission.boot">Retry loading</button></p>
      <details class="project-about">
        <summary>About this project</summary>
        <p>Could an astronaut walk this slope on the way from the base to an observation site? If they lost their bearings, could they recognize a distant peak?</p>
        <p>We overlay Mars imagery on an elevation map and use A* to find routes around steep slopes and exclusion zones. The Mountain Tracker compares the observed skyline with horizons predicted from the terrain to find candidate locations.</p>
        <p>In the Jezero demo, walking about 680 m farther reduces the steepest modeled slope from 8.8° to 5.4°. For Curiosity’s Dingo Gap panorama, the top candidate was 815 m from NASA’s recorded camera position.</p>
        <p>We want to test whether machine learning can trace skylines more accurately, then measure positioning error on new photographs. With elevation data and photographs from known locations, we could try the same method on other worlds.</p>
      </details>
    </div>
  </section>
  <main :inert="choosing" class="workspace" :class="{ 'panel-closed': !s.panelOpen, 'planning-view': !s.localizationOpen }">
    <section class="map-workspace">
      <div class="map-frame">
        <MissionMap />
        <div v-if="s.error" class="error-banner" role="alert">
          {{ s.error }}<button @click="mission.boot">Retry loading</button>
        </div>
        <div class="map-caption">
          <span>{{ s.mapContext }}</span><span>{{ s.coords }}</span>
        </div>
      </div>
      <RouteProfile v-if="!choosing" @open-route-challenge="openRouteChallenge" />
    </section>
    <aside class="control-panel" aria-label="Mission controls">
      <button
        class="panel-toggle"
        :aria-expanded="s.panelOpen"
        aria-controls="panel-content"
        @click="s.panelOpen = !s.panelOpen"
      >
        {{ s.panelOpen ? "Collapse panel ↓" : "Open mission panel ↑" }}
      </button>
      <div id="panel-content" v-show="s.panelOpen">
        <header class="panel-heading" :style="{ '--region-image': 'url(' + asset(region.image) + ')' }">
          <div aria-live="polite" aria-atomic="true">
            <button class="mode-switch" @click="chooseMode">Switch modes</button>
            <p class="region-name">{{ s.walk ? "Science Mission" : "Free Exploration" }}</p>
            <h1 id="region-title" tabindex="-1">{{ region.title }}</h1>
            <p v-if="!s.walk" class="region-description">{{ region.description }}</p>
          </div>
          <p v-if="!s.walk || s.warning.includes('failed')" class="region-status" role="status">{{ s.warning }}</p>
        </header>
        <nav class="tabs" aria-label="Control panel tabs">
          <button
            v-for="tab in [
              { id: 'explore', name: 'Explore' },
              { id: 'mission', name: 'Mission' },
              { id: 'layers', name: 'Layers' },
            ].filter(t => !s.walk || t.id !== 'explore')"
            :key="tab.id"
            :aria-pressed="s.tab === tab.id"
            @click="s.tab = tab.id"
          >
            {{ tab.name }}
          </button>
        </nav>
        <div class="panel-scroll">
          <section v-if="!s.walk && s.tab !== 'layers'" class="region-actions">
            <template v-if="s.tab === 'explore'">
              <p>{{ region.question || 'Where are the highlands and lowlands in this region?' }}</p>
              <button :disabled="!s.ready || s.regionLoading" @click="showQuestionLayer">{{ s.globalView ? 'Show global elevation' : s.siteId === 'jezero' && !s.regional ? 'Show geology' : 'Show slope' }}</button>
            </template>
            <p role="status">{{ s.pickingStart || s.pickingTarget ? s.routeStatus : s.hasStart ? 'Starting point set' : 'Where will you start?' }}</p>
            <button id="pick-start" :disabled="!s.ready || s.regionLoading" :aria-pressed="s.pickingStart" @click="mission.beginStart">{{ s.pickingStart ? 'Cancel starting point selection' : s.hasStart ? 'Choose a new starting point' : 'Set starting point on the map' }}</button>
            <button v-if="s.hasStart && s.tab === 'explore'" :aria-pressed="s.pickingTarget" @click="mission.beginTarget">{{ s.pickingTarget ? 'Cancel selection' : 'Choose destination on the map' }}</button>
            <button v-if="s.hasStart && s.destination && s.tab === 'explore'" :disabled="s.regionLoading || s.navigationLoading || !!s.navigationError" @click="s.tab='mission'; mission.plan()">Generate route →</button>
          </section>
          <ExplorePanel v-if="!s.walk" v-show="s.tab === 'explore'" /><TaskPanel
            v-show="s.tab === 'mission'"
            @open-route-challenge="openRouteChallenge"
          /><LayersPanel v-show="s.tab === 'layers'" />
        </div>
      </div>
    </aside>
    <LocalizationPanel v-if="!s.walk" v-show="s.localizationOpen" @open-demo="openDemo" />
  </main>
  <CuriosityDemo v-if="demoOpen" @close="closeDemo" />
  <RouteLocationChallenge v-if="challengeOpen" @close="closeRouteChallenge" />
</template>
