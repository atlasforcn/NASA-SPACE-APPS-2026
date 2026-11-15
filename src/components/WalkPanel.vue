<script setup>
import { computed, inject } from 'vue';
import { missionKey } from '../useMission';

const m = inject(missionKey);
const s = m.state;
defineEmits(['open-route-challenge']);
const verdictLabels = { go: 'Passable', reroute: 'Detour recommended', hold: 'Hold departure' };
const alternatives = computed(() => s.walk?.alternatives ?? []);
const selected = computed(() => alternatives.value.find(option => option.id === s.walk.selectedAlternative));
const visibleRoutes = computed(() => [
  { title: 'Direct route from the base to A', result: s.walk?.assessment, detour: false },
  { title: selected.value?.name, result: s.walk?.detour, detour: true },
].filter(route => route.result));
const directDistance = computed(() => Math.hypot(s.walk.station.x - s.truth.x, s.walk.station.y - s.truth.y));
const tradeoff = computed(() => {
  const shorter = alternatives.value.find(option => option.id === 'shortest')?.result;
  const safer = alternatives.value.find(option => option.id === 'safer')?.result;
  if (!shorter || !safer || safer.length <= shorter.length + 1 ||
      !Number.isFinite(safer.maxSlope) || !(safer.maxSlope < shorter.maxSlope - 0.1)) return '';
  return `The lower-risk detour adds ${m.fmt(safer.length - shorter.length)} and reduces maximum slope from ${shorter.maxSlope.toFixed(1)}° to ${safer.maxSlope.toFixed(1)}°.`;
});
const unavailable = computed(() => !s.ready || s.regionLoading || s.pickingNoGo || s.navigationLoading || !!s.navigationError);
const stationTerrain = computed(() => m.scienceAt(s.walk?.station));
function markNoGo() {
  m.beginNoGo();
  if (s.pickingNoGo) document.getElementById('map')?.scrollIntoView({ block: 'center' });
}
function measurement(value, digits, suffix = '') {
  return Number.isFinite(value) ? value.toFixed(digits) + suffix : 'No data';
}
</script>

<template>
  <article class="group walk-panel">
    <h2>How can we reach Site A to observe the surface ridges while avoiding steep slopes?</h2>
    <p class="mission-brief">The direct distance from the base to Site A is <strong>{{ m.fmt(directDistance) }}</strong>. Check the steepest segment, then compare distance and slope before choosing a route.</p>
    <p class="hint">In Layers, select Thermal to see thermal inertia along the route or Spectral to see olivine abundance around the observation site.</p>

    <details class="limits">
      <summary>Terrain limits and exclusion zones · {{ s.slope }}° / {{ s.roughnessLimit }}</summary>
      <label>Slope limit {{ s.slope }}°<input id="science-slope-limit" v-model.number="s.slope" type="range" min="1" max="45" /></label>
      <label>Roughness limit {{ s.roughnessLimit }}<input id="science-roughness-limit" v-model.number="s.roughnessLimit" type="range" min="0" max="1" step="0.05" /></label>
      <p class="hint">Values closer to 1 indicate rougher terrain.</p>
      <form class="exclusion-form" @submit.prevent="markNoGo">
        <h3>Are there areas to avoid along the route?</h3>
        <div class="field-pair">
          <label>Area name (optional)<input id="science-no-go-name" v-model="s.noGoName" maxlength="80" /></label>
          <label>Radius (m)<input id="science-no-go-radius" v-model.number="s.noGoRadius" type="number" min="10" max="100000" required :disabled="s.pickingNoGo" /></label>
        </div>
        <button id="science-pick-no-go" class="wide" type="submit" :disabled="!s.ready || s.regionLoading" :aria-pressed="s.pickingNoGo">{{ s.pickingNoGo ? 'Cancel marking' : 'Mark an exclusion zone on the map' }}</button>
      </form>
      <ul v-if="s.noGoZones.length" aria-label="Marked exclusion zones" class="no-go-list">
        <li v-for="zone in s.noGoZones" :key="zone.id">{{ zone.name }} · Radius {{ m.fmt(zone.radius) }}<button type="button" :aria-label="`Remove exclusion zone ${zone.name}`" @click="m.removeNoGo(zone.id)">Remove</button></li>
      </ul>
    </details>
    <button id="check-science-route" type="button" class="primary wide" :disabled="unavailable" @click="m.checkScienceRoute()">
      {{ s.walk.assessment ? 'Recheck the route from the base to A' : 'Check the route from the base to A' }}
    </button>
    <button v-if="m.challengeRoute.value" id="science-route-challenge" type="button" class="route-challenge-entry" aria-haspopup="dialog" @click="$emit('open-route-challenge', $event)">
      Find my position with the Mountain Tracker <span aria-hidden="true">↗</span>
    </button>

    <p v-if="s.navigationLoading || s.navigationError" class="hint" role="status">{{ s.navigationLoading ? 'Loading navigation data…' : s.navigationError }}</p>
    <button v-if="s.navigationError && !s.navigationLoading" type="button" @click="m.retryNavigation()">Retry navigation data</button>

    <div aria-live="polite" aria-atomic="false">
      <template v-for="route in visibleRoutes" :key="route.detour">
        <section class="assessment" :data-verdict="route.result.verdict">
          <p class="route-name">{{ route.title }} · {{ m.fmt(route.result.length) }}</p>
          <h3 :id="route.detour ? 'science-detour-verdict' : 'science-route-verdict'" :data-verdict="route.result.verdict">
            {{ verdictLabels[route.result.verdict] }}
          </h3>
          <p class="reason">{{ route.result.reason }}</p>
          <p v-if="!route.detour && route.result.steepDistance > 0" class="hint">The red line marks segments above the slope limit, totaling about {{ m.fmt(route.result.steepDistance) }}.</p>
          <button v-if="route.result.point" :id="route.detour ? 'focus-science-detour' : 'focus-science-evidence'" class="wide" type="button" @click="m.focusScienceEvidence(route.detour)">Show the assessed segment on the map</button>
          <details class="route-evidence">
            <summary>View slope, roughness and terrain coverage</summary>
            <dl class="evidence">
              <div><dt>Maximum slope along the route</dt><dd>{{ measurement(route.result.maxSlope, 1, '°') }}</dd></div>
              <div><dt>Maximum roughness along the route</dt><dd>{{ measurement(route.result.maxRoughness, 2) }}</dd></div>
              <div><dt>Crosses a marked exclusion zone</dt><dd>{{ route.result.noGoCrossed == null ? 'Undetermined' : route.result.noGoCrossed ? 'Yes' : 'No' }}</dd></div>
              <div><dt>Regional DEM coverage</dt><dd>{{ m.fmt(route.result.localDistance) }}</dd></div>
              <div><dt>Kilometer-scale MOLA only</dt><dd>{{ m.fmt(route.result.molaDistance) }}</dd></div>
              <div><dt>Segments with missing terrain data</dt><dd>{{ m.fmt(route.result.missingDistance) }}</dd></div>
            </dl>
          </details>
        </section>
        <button v-if="!route.detour && route.result.verdict === 'reroute' && !alternatives.length && !s.walk.detourUnavailable"
          id="check-science-detour" type="button" class="primary wide compare-routes" :disabled="unavailable" @click="m.checkDetour()">Find and compare detours</button>
        <section v-if="!route.detour && alternatives.length" id="walk-alternatives" aria-labelledby="walk-choice-title">
          <h3 id="walk-choice-title">Choose a detour</h3>
          <p class="hint">{{ tradeoff }} Select a route to inspect it on the map and elevation profile.</p>
          <table>
            <thead><tr><th scope="col">Route</th><th scope="col">Distance</th><th scope="col">Maximum slope</th></tr></thead>
            <tbody>
              <tr class="reference-row">
                <th scope="row">Direct line (reference)</th><td>{{ m.fmt(route.result.length) }}</td><td>{{ measurement(route.result.maxSlope, 1, '°') }}</td>
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
        <p class="route-name">Alternative route from the base to A</p>
        <h3 id="science-detour-verdict" data-verdict="hold">Hold departure</h3>
        <p class="reason">No alternative route to A meets the current limits.</p>
      </section>
    </div>
    <p class="hint">This assessment uses DEM samples and manually marked exclusion zones. Kilometer-scale elevations show broad terrain. Wheel-scale rocks require local observations.<a v-if="stationTerrain?.source" :href="stationTerrain.source" target="_blank" rel="noopener noreferrer">Original Jezero elevation data ↗</a></p>
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
