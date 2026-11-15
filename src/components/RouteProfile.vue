<script setup>
import { computed, inject, nextTick, ref, watch } from 'vue';
import { missionKey } from '../useMission';

const m = inject(missionKey), s = m.state;
defineEmits(['open-route-challenge']);
const panel = ref(null);
const expanded = ref(true);
const hasRoute = computed(() => s.route?.path?.length > 1);
const hasDirect = computed(() => s.directRoute?.path?.length > 1);
const hasExpedition = computed(() => !s.regional && s.expedition.some(leg => leg.path.length > 1));
const canCompare = computed(() => hasExpedition.value || Object.entries(s.routeOptions || {})
  .some(([key, route]) => key !== s.selectedRoute && route.reachable));

watch(() => s.profileRevision, async () => {
  if (!hasRoute.value && !hasDirect.value && !hasExpedition.value) return;
  expanded.value = true;
  await nextTick();
  if (!s.walk && window.matchMedia('(max-width: 700px)').matches) {
    panel.value?.scrollIntoView({ block: 'nearest' });
  }
});

function toggleProfile() {
  expanded.value = !expanded.value;
  if (!expanded.value) m.leaveProfile();
}
</script>

<template>
  <section v-if="hasRoute || hasDirect || hasExpedition" ref="panel" class="map-profile" :class="{ 'is-open': expanded }" aria-label="Route elevation profile">
    <div class="profile-header">
      <h2>
        <button id="profile-toggle" type="button" :aria-expanded="expanded" aria-controls="profile-body" @click="toggleProfile">
          Route elevation profile <span>{{ expanded ? 'Collapse ▴' : 'Expand ▾' }}</span>
        </button>
      </h2>
      <button v-if="m.challengeRoute.value" id="map-route-challenge" type="button" aria-haspopup="dialog" @click="$emit('open-route-challenge', $event)">Where am I on the route? ↗</button>
    </div>
    <div id="profile-body" v-show="expanded">
      <label v-if="hasExpedition" class="profile-leg">Leg
        <select id="expedition-leg" v-model="s.profileIndex">
          <option v-if="hasRoute || hasDirect" :value="-1">{{ hasRoute ? 'Current route' : 'Straight line between endpoints' }}</option>
          <option v-for="(leg, i) in s.expedition" :key="i" :value="i">
            {{ leg.name }}{{ leg.reachable ? '' : ' (unreachable)' }}
          </option>
        </select>
      </label>
      <div class="profile-plot">
        <canvas
          id="route-profile"
          :ref="el => (m.profileCanvas.value = el)"
          width="360" height="120" role="img" aria-label="Route elevation profile from the DEM"
          @pointermove="m.hoverProfile" @pointerdown="m.hoverProfile"
          @pointerleave="m.leaveProfile" @pointercancel="m.leaveProfile"
        ></canvas>
        <p v-if="s.profileHover" class="profile-reading profile-tooltip" role="status">{{ s.profileHover }}</p>
      </div>
      <ul v-if="s.profileLegend.length" class="profile-legend" aria-label="Elevation profiles">
        <li v-for="item in s.profileLegend" :key="item.name"><i :class="{ dashed: item.baseline }" :style="{borderColor: item.color}"></i>{{ item.name }} · {{ item.length }}</li>
      </ul>
      <p v-if="!s.profileLegend.length" class="profile-reading" role="status">{{ s.profileInfo }}</p>
      <div class="profile-options">
        <label v-if="canCompare" class="checkbox"><input type="checkbox" v-model="s.compareProfiles" />Compare routes</label>
        <details id="profile-source">
          <summary>Profile data</summary>
          <p>{{ s.profileInfo }}</p>
          <p v-if="s.profileLegend.some(item => item.baseline)">The dashed yellow line samples a one-way straight line from start to destination, excluding stops and return travel. {{ s.directRoute?.reachable ? '' : 'This straight line fails the current terrain check.' }}</p>
          <p>{{ s.regional ? 'Kilometer-scale MOLA terrain. Grid spacing varies with coverage.' : s.siteId === 'gale' ? 'Gale native spacing: 1 m. Demo DEM sampled at 20 m.' : 'CTX native spacing: about 20 m. Demo DEM sampled at 40 m.' }}</p>
          <p>Hover over or tap a profile to locate the corresponding point on the map. All profiles share the same distance and elevation scales.</p>
        </details>
      </div>
    </div>
  </section>
</template>

<style scoped>
.map-profile {
  position: absolute;
  display: flex; flex-direction: column;
  max-height: 42%;
  right: 56px;
  bottom: 48px;
  width: min(330px, calc(100% - 82px));
  border: 1px solid #516a69;
  border-radius: 10px;
  background: #13242a;
  color: #e0e9e5;
  box-shadow: 0 5px 24px #07101455;
  overflow: hidden;
}
.profile-header { display: flex; align-items: stretch; flex-shrink: 0; background: #1a3036; }
.profile-header h2 { flex: 1; }
#map-route-challenge { margin: 4px; padding: 3px 8px; color: var(--mint); background: #203a39; border-color: #476662; font-size: 12px; }
.map-profile:not(.is-open) { width: auto; }
#profile-toggle {
  display: flex; align-items: center; justify-content: space-between; gap: 18px;
  width: 100%; padding: 8px 13px; background: #1a3036; color: #e0e9e5;
  border: 0; border-radius: 0; font-size: 14px; font-weight: 700; text-align: left;
}
#profile-toggle span { color: var(--mint); font-size: 11px; font-weight: 500; }
#profile-toggle:focus-visible { outline-offset: -3px; }
#profile-body { min-height: 0; overflow-y: auto; padding: 5px 13px 9px; }
.profile-plot { position: relative; }
.profile-tooltip { position: absolute; inset: auto 5px 3px; background: #13242aee; padding: 3px 7px; border-radius: 4px; pointer-events: none; }
#route-profile { background: transparent; cursor: crosshair; }
.profile-leg { display: flex; align-items: center; gap: 8px; margin: 2px 0 5px; }
.profile-leg select { flex: 1; margin: 0; padding: 4px; font-size: 12px; }
.profile-legend { display: flex; flex-wrap: wrap; gap: 3px 13px; list-style: none; padding: 0; margin: 4px 0; }
.profile-legend li, .profile-options, .profile-reading { font-size: 11px; line-height: 1.5; }
.profile-legend li { display: inline-flex; align-items: center; gap: 5px; }
.profile-legend i { width: 14px; border-top: 2px solid; }
.profile-legend i.dashed { border-top-style: dashed; }
.profile-reading { margin: 5px 0; color: var(--mint); }
.profile-options { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 15px; border-top: 1px solid var(--border); margin-top: 7px; padding-top: 6px; }
.profile-options .checkbox { margin: 0; gap: 5px; font-size: inherit; }
.profile-options details { margin: 0; color: var(--muted); }
.profile-options details[open] { flex-basis: 100%; }
.profile-options details p { margin-top: 5px; }
@media (min-width: 701px) and (max-width: 940px) {
  .map-profile { right: 56px; bottom: 96px; width: min(290px, calc(100% - 72px)); }
}
@media (max-width: 700px) {
  .map-profile { position: static; width: 100%; max-height: none; border-radius: 0; border-width: 1px 0; box-shadow: none; }
  #profile-toggle { padding-inline: 16px; }
  #profile-body { padding-inline: 16px; max-height: none; }
  #route-profile { max-height: 120px; }
}
</style>
