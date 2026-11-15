<script setup>
import { computed, inject } from 'vue';
import { missionKey } from '../useMission';

const m = inject(missionKey);
const s = m.state;
const verdictLabels = { go: '可前往', reroute: '建議改道', hold: '暫緩出發' };
const visibleRoutes = computed(() => [
  { title: '基地 → A 直線', result: s.walk?.assessment, detour: false },
  { title: '基地 → A 替代路線', result: s.walk?.detour, detour: true },
].filter(route => route.result));
const unavailable = computed(() => !s.ready || s.regionLoading || s.pickingNoGo || s.navigationLoading || !!s.navigationError);
const stationTerrain = computed(() => m.scienceAt(s.walk?.station));
function markNoGo() {
  m.beginNoGo();
  if (s.pickingNoGo) document.getElementById('map')?.scrollIntoView({ block: 'center' });
}
function measurement(value, digits, suffix = '') {
  return Number.isFinite(value) ? value.toFixed(digits) + suffix : '無資料';
}
</script>

<template>
  <article class="group walk-panel">
    <h2>從基地前往 A，沿途安全嗎？</h2>
    <p class="mission-brief">基地與觀測點 A 都是這次在 Jezero 隕石坑設定的示範位置。檢查兩點間的直線，依沿途地形決定出發、改道或暫緩。</p>

    <details class="limits">
      <summary>通行門檻與禁行區 · {{ s.slope }}° ／ {{ s.roughnessLimit }}</summary>
      <label>坡度上限 {{ s.slope }}°<input id="science-slope-limit" v-model.number="s.slope" type="range" min="1" max="45" /></label>
      <label>粗糙度上限 {{ s.roughnessLimit }}<input id="science-roughness-limit" v-model.number="s.roughnessLimit" type="range" min="0" max="1" step="0.05" /></label>
      <p class="hint">兩項上限皆為示範設定。粗糙度越接近 1，地形起伏越大。</p>
      <form class="exclusion-form" @submit.prevent="markNoGo">
        <h3>沿途有需要避開的地方嗎？</h3>
        <div class="field-pair">
          <label>區域名稱（選填）<input id="science-no-go-name" v-model="s.noGoName" maxlength="80" /></label>
          <label>半徑（m）<input id="science-no-go-radius" v-model.number="s.noGoRadius" type="number" min="10" max="100000" required :disabled="s.pickingNoGo" /></label>
        </div>
        <button id="science-pick-no-go" class="wide" type="submit" :disabled="!s.ready || s.regionLoading" :aria-pressed="s.pickingNoGo">{{ s.pickingNoGo ? '取消標記' : '在地圖標記禁行區' }}</button>
        <p v-if="s.pickingNoGo" class="hint" role="status">點選地圖，設定禁行區的中心。</p>
      </form>
      <ul v-if="s.noGoZones.length" aria-label="已標記的禁行區" class="no-go-list">
        <li v-for="zone in s.noGoZones" :key="zone.id">{{ zone.name }} · 半徑 {{ m.fmt(zone.radius) }}<button type="button" :aria-label="`移除禁行區 ${zone.name}`" @click="m.removeNoGo(zone.id)">移除</button></li>
      </ul>
    </details>
    <button id="check-science-route" type="button" class="primary wide" :disabled="unavailable" @click="m.checkScienceRoute()">
      {{ s.walk.assessment ? '重新檢查基地到 A' : '檢查基地到 A 的路線' }}
    </button>

    <p v-if="s.navigationLoading || s.navigationError" class="hint" role="status">{{ s.navigationLoading ? '正在載入導航資料…' : s.navigationError }}</p>
    <button v-if="s.navigationError && !s.navigationLoading" type="button" @click="m.retryNavigation()">重試載入導航資料</button>

    <div aria-live="polite" aria-atomic="false">
      <section v-for="route in visibleRoutes" :key="route.title" class="assessment" :data-verdict="route.result.verdict">
        <p class="route-name">{{ route.title }} · {{ m.fmt(route.result.length) }}</p>
        <h3 :id="route.detour ? 'science-detour-verdict' : 'science-route-verdict'" :data-verdict="route.result.verdict">
          {{ verdictLabels[route.result.verdict] }}
        </h3>
        <p class="reason">{{ route.result.reason }}</p>
        <dl class="evidence">
          <div><dt>沿途最大坡度</dt><dd>{{ measurement(route.result.maxSlope, 1, '°') }}</dd></div>
          <div><dt>沿途最大粗糙度</dt><dd>{{ measurement(route.result.maxRoughness, 2) }}</dd></div>
          <div><dt>穿越人工禁行區</dt><dd>{{ route.result.noGoCrossed == null ? '未能判定' : route.result.noGoCrossed ? '是' : '否' }}</dd></div>
          <div><dt>區域 DEM 涵蓋</dt><dd>{{ m.fmt(route.result.localDistance) }}</dd></div>
          <div><dt>僅有公里級 MOLA</dt><dd>{{ m.fmt(route.result.molaDistance) }}</dd></div>
          <div><dt>地形缺測路段</dt><dd>{{ m.fmt(route.result.missingDistance) }}</dd></div>
        </dl>
        <button v-if="route.result.point" :id="route.detour ? 'focus-science-detour' : 'focus-science-evidence'" class="wide" type="button" @click="m.focusScienceEvidence(route.detour)">在地圖查看判定路段</button>
      </section>
      <section v-if="s.walk.detourUnavailable" class="assessment" data-verdict="hold">
        <p class="route-name">基地 → A 替代路線</p>
        <h3 id="science-detour-verdict" data-verdict="hold">暫緩出發</h3>
        <p class="reason">目前的門檻下找不到通往 A 的替代路線。</p>
      </section>
    </div>
    <button v-if="s.walk.assessment?.verdict === 'reroute'" id="check-science-detour" type="button" class="wide" :disabled="unavailable" @click="m.checkDetour()">搜尋並檢查替代路線</button>
    <p class="hint">判定採用 DEM 取樣和地圖上的人工禁行區。公里級高程只能概覽地形，車輪尺度的岩塊仍需現地資料。<a v-if="stationTerrain?.source" :href="stationTerrain.source" target="_blank" rel="noopener noreferrer">Jezero 數值高程原始資料 ↗</a></p>
  </article>
</template>

<style scoped>
.walk-panel { overflow-wrap: anywhere; }
.walk-panel h2 { margin-bottom: .5rem; }
.mission-brief, .reason { font-size: .85rem; line-height: 1.7; }
.limits { margin-block: 1rem .3rem; padding-block: .65rem; border-block: 1px solid var(--border); }
.limits summary { cursor: pointer; font-size: .8rem; }
.limits label { font-size: .8rem; }
.exclusion-form { margin-top: 1rem; }
.exclusion-form h3 { font-size: .85rem; }
.assessment { --verdict-color: var(--mint); margin-top: 1.3rem; }
.assessment[data-verdict="reroute"] { --verdict-color: #ff938c; }
.assessment[data-verdict="hold"] { --verdict-color: #e6b772; }
.route-name { color: var(--muted); font-size: .75rem; margin: 0; }
.assessment h3 { color: var(--verdict-color); border-inline-start: .2rem solid currentColor; padding-inline-start: .6rem; margin-block: .45rem; font-size: 1.25rem; }
.reason { margin: 0; }
.evidence { font-size: .8rem; margin-block: .65rem .2rem; }
.evidence div { display: flex; align-items: baseline; justify-content: space-between; gap: .5rem; border-bottom: 1px solid var(--border); padding-block: .32rem; }
.evidence dt { color: var(--muted); }
.evidence dd { margin: 0; font-variant-numeric: tabular-nums; }
</style>
