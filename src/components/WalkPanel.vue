<script setup>
import { computed, inject } from 'vue';
import { missionKey } from '../useMission';

const m = inject(missionKey);
const s = m.state;
const verdictLabels = { go: '可前往', reroute: '建議改道', hold: '暫緩出發' };
const alternatives = computed(() => s.walk?.alternatives ?? []);
const selected = computed(() => alternatives.value.find(option => option.id === s.walk.selectedAlternative));
const visibleRoutes = computed(() => [
  { title: '基地 → A 直線', result: s.walk?.assessment, detour: false },
  { title: selected.value?.name, result: s.walk?.detour, detour: true },
].filter(route => route.result));
const directDistance = computed(() => Math.hypot(s.walk.station.x - s.truth.x, s.walk.station.y - s.truth.y));
const tradeoff = computed(() => {
  const shorter = alternatives.value.find(option => option.id === 'shortest')?.result;
  const safer = alternatives.value.find(option => option.id === 'safer')?.result;
  if (!shorter || !safer || safer.length <= shorter.length + 1 ||
      !Number.isFinite(safer.maxSlope) || !(safer.maxSlope < shorter.maxSlope - 0.1)) return '';
  return `選較低風險繞行會多走 ${m.fmt(safer.length - shorter.length)}，沿途最大坡度從 ${shorter.maxSlope.toFixed(1)}° 降到 ${safer.maxSlope.toFixed(1)}°。`;
});
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
    <h2>到 A 站觀察地表脊紋，該怎麼繞過陡坡？</h2>
    <p class="mission-brief">基地到觀測點 A 的直線距離是 <strong>{{ m.fmt(directDistance) }}</strong>。先檢查直線最陡的一段，再比較繞行的距離與坡度，決定你要走哪條路。</p>
    <p class="hint">在「圖層」勾選「熱」可查看沿途的熱慣量，勾選「光譜」可查看觀測區的橄欖石分布。</p>

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
      <template v-for="route in visibleRoutes" :key="route.detour">
        <section class="assessment" :data-verdict="route.result.verdict">
          <p class="route-name">{{ route.title }} · {{ m.fmt(route.result.length) }}</p>
          <h3 :id="route.detour ? 'science-detour-verdict' : 'science-route-verdict'" :data-verdict="route.result.verdict">
            {{ verdictLabels[route.result.verdict] }}
          </h3>
          <p class="reason">{{ route.result.reason }}</p>
          <p v-if="!route.detour && route.result.steepDistance > 0" class="hint">地圖紅線標出超坡區段，合計約 {{ m.fmt(route.result.steepDistance) }}。</p>
          <button v-if="route.result.point" :id="route.detour ? 'focus-science-detour' : 'focus-science-evidence'" class="wide" type="button" @click="m.focusScienceEvidence(route.detour)">在地圖查看判定路段</button>
          <details class="route-evidence">
            <summary>查看坡度、粗糙度與地形覆蓋</summary>
            <dl class="evidence">
              <div><dt>沿途最大坡度</dt><dd>{{ measurement(route.result.maxSlope, 1, '°') }}</dd></div>
              <div><dt>沿途最大粗糙度</dt><dd>{{ measurement(route.result.maxRoughness, 2) }}</dd></div>
              <div><dt>穿越人工禁行區</dt><dd>{{ route.result.noGoCrossed == null ? '未能判定' : route.result.noGoCrossed ? '是' : '否' }}</dd></div>
              <div><dt>區域 DEM 涵蓋</dt><dd>{{ m.fmt(route.result.localDistance) }}</dd></div>
              <div><dt>僅有公里級 MOLA</dt><dd>{{ m.fmt(route.result.molaDistance) }}</dd></div>
              <div><dt>地形缺測路段</dt><dd>{{ m.fmt(route.result.missingDistance) }}</dd></div>
            </dl>
          </details>
        </section>
        <button v-if="!route.detour && route.result.verdict === 'reroute' && !alternatives.length && !s.walk.detourUnavailable"
          id="check-science-detour" type="button" class="primary wide compare-routes" :disabled="unavailable" @click="m.checkDetour()">搜尋並比較繞行路線</button>
        <section v-if="!route.detour && alternatives.length" id="walk-alternatives" aria-labelledby="walk-choice-title">
          <h3 id="walk-choice-title">選擇繞行路線</h3>
          <p class="hint">{{ tradeoff }}選取一條路線，在地圖和高程剖面核對走法。</p>
          <table>
            <thead><tr><th scope="col">路線</th><th scope="col">距離</th><th scope="col">最大坡度</th></tr></thead>
            <tbody>
              <tr class="reference-row">
                <th scope="row">直線（對照）</th><td>{{ m.fmt(route.result.length) }}</td><td>{{ measurement(route.result.maxSlope, 1, '°') }}</td>
              </tr>
              <tr v-for="option in alternatives" :key="option.id" :style="{ '--route-color': option.color }" :class="{ chosen: option.id === s.walk.selectedAlternative }">
                <th scope="row">
                  <label><input :id="'walk-route-' + option.id" type="radio" name="walk-route" :value="option.id"
                    :checked="option.id === s.walk.selectedAlternative" @change="m.selectScienceAlternative(option.id)" />{{ option.name }}</label>
                </th>
                <td>{{ m.fmt(option.result.length) }}</td><td>{{ measurement(option.result.maxSlope, 1, '°') }}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </template>
      <section v-if="s.walk.detourUnavailable" class="assessment" data-verdict="hold">
        <p class="route-name">基地 → A 替代路線</p>
        <h3 id="science-detour-verdict" data-verdict="hold">暫緩出發</h3>
        <p class="reason">目前的門檻下找不到通往 A 的替代路線。</p>
      </section>
    </div>
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
.assessment .wide { margin-top: .5rem; }
.route-evidence { margin: .5rem 0 0; }
.route-evidence summary { color: var(--muted); font-size: .78rem; }
.compare-routes { margin-top: .85rem; }
#walk-alternatives { margin-block: 1.15rem; }
#walk-alternatives h3 { font-size: 1rem; margin: 0; }
#walk-alternatives table { width: 100%; border-collapse: collapse; font-size: .8rem; font-variant-numeric: tabular-nums; }
#walk-alternatives th, #walk-alternatives td { padding: .45rem .3rem; border-bottom: 1px solid var(--border); text-align: right; }
#walk-alternatives th:first-child { text-align: left; }
#walk-alternatives thead th, #walk-alternatives .reference-row { color: var(--muted); font-weight: 500; }
#walk-alternatives .chosen { background: #1c3036; color: var(--route-color); }
#walk-alternatives label { display: flex; align-items: center; gap: .35rem; margin: 0; cursor: pointer; }
#walk-alternatives input { accent-color: var(--route-color); width: 1rem; margin: 0; }
.evidence { font-size: .8rem; margin-block: .65rem .2rem; }
.evidence div { display: flex; align-items: baseline; justify-content: space-between; gap: .5rem; border-bottom: 1px solid var(--border); padding-block: .32rem; }
.evidence dt { color: var(--muted); }
.evidence dd { margin: 0; font-variant-numeric: tabular-nums; }
</style>
