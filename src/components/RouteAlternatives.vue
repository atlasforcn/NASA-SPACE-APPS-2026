<script setup>
import { inject } from 'vue';
import { missionKey } from '../useMission';
const m = inject(missionKey), s = m.state;
const hours = value => `${value.toFixed(2)} h`;
const vehicleRows = [
  ['energy','Estimated energy use',v => `${(v/1000).toFixed(2)} units`],
  ['materialEnergy','Extra energy from surface conditions',v => `${(v/1000).toFixed(2)} units`],
  ['unknownMaterialDistance','Distance on unknown material',m.fmt],
 ];
const rows = [
  ['surface','Surface distance',m.fmt],
  ['hours','Walking time',hours],
  ['gain','Total ascent',m.fmt],
  ['loss','Total descent',m.fmt],
  ['maxSlope','Maximum slope',v => `${v.toFixed(1)}°`],
  ['steep','Distance on steep terrain',m.fmt],
  ['riskScore','Mean terrain risk',v => v.toFixed(2)],
  ['totalHours','Total time including stops',hours],
];
</script>
<template>
  <section v-if="s.routeOptions" class="route-comparison" aria-label="Compare three routes">
    <h3>Compare and select a route</h3>
    <p class="hint">The yellow line connects the start and destination directly for comparison with the three planned routes.</p>
    <div class="button-row">
      <button v-for="(label,key) in {energy:'Lowest estimated energy use',shortest:'Shortest route',safer:'Lower-risk route'}" :id="`choose-${key}`" :key="key" :aria-pressed="s.selectedRoute === key" :disabled="!s.routeOptions[key].reachable" @click="m.selectRoute(key)">{{ s.selectedRoute === key ? '● ' : '' }}{{ label }}</button>
    </div>
    <template v-if="s.routeOptions[s.selectedRoute].reachable">
      <p v-if="s.routeOptions[s.selectedRoute].molaDistance">Kilometer-scale MOLA terrain: {{ m.fmt(s.routeOptions[s.selectedRoute].molaDistance) }}. Local roughness is unresolved here.</p>
      <p v-if="s.routeOptions[s.selectedRoute].seamDistance">Distance across dataset boundaries: {{ m.fmt(s.routeOptions[s.selectedRoute].seamDistance) }}. Elevations cannot be compared across this boundary. Time and energy use horizontal distance here. Ascent uses elevations from the same dataset.</p>
      <p v-if="s.routeOptions[s.selectedRoute].marginHours < 0" class="hint red">Selected route exceeds the time budget by {{ hours(-s.routeOptions[s.selectedRoute].marginHours) }}.</p>
    </template>
    <details id="route-comparison-details">
      <summary>Metrics and itinerary</summary>
      <div class="comparison-scroll">
        <table>
          <caption>Same stop order and slope limit. Steep slope threshold: {{ s.planner.highSlope }}°</caption>
          <thead><tr><th scope="col">Metric</th><th scope="col">Shortest route</th><th scope="col">Lower risk</th><th scope="col">Lowest energy</th></tr></thead>
          <tbody>
            <tr v-for="[key,label,format] in rows" :key="key"><th scope="row">{{ label }}</th><td v-for="mode in ['shortest','safer','energy']" :key="mode">{{ s.routeOptions[mode].reachable ? format(s.routeOptions[mode][key]) : 'No reachable route' }}</td></tr>
            <tr><th scope="row">Time budget</th><td v-for="mode in ['shortest','safer','energy']" :key="mode" :class="s.routeOptions[mode].marginHours >= 0 ? 'mint' : 'red'">{{ !s.routeOptions[mode].reachable ? '—' : s.routeOptions[mode].marginHours >= 0 ? 'Remaining: '+hours(s.routeOptions[mode].marginHours) : 'Over by '+hours(-s.routeOptions[mode].marginHours) }}</td></tr>
          </tbody>
        </table>
      </div>
      <details><summary>Rover support · Estimated energy use</summary><ul><li v-for="[key,label,format] in vehicleRows" :key="key">{{ label }} · {{ s.routeOptions[s.selectedRoute].reachable ? format(s.routeOptions[s.selectedRoute][key]) : 'No reachable route' }}</li></ul></details>
      <p class="hint">Terrain risk combines slope, roughness and surface assumptions. Different objectives can yield the same path. One energy unit is the travel energy for 1 km on flat ground. Stops and equipment power are excluded.</p>
      <template v-if="s.routeOptions[s.selectedRoute].reachable">
        <h3>Surface energy costs</h3>
        <ul><li v-for="cause in s.routeOptions[s.selectedRoute].navigationReasons" :key="cause.reason">{{ cause.reason }} · {{ m.fmt(cause.distance) }}</li></ul>
        <p v-if="!s.routeOptions[s.selectedRoute].navigationReasons?.length" class="hint">Surface conditions add no energy cost on this route.</p>
        <h3>Selected itinerary</h3>
        <ol class="itinerary"><li v-for="(leg,i) in s.routeOptions[s.selectedRoute].legs" :key="i"><strong>{{ leg.name }}</strong><span>{{ m.fmt(leg.surface) }} · Energy {{ (leg.energy/1000).toFixed(2) }} units · Walk {{ hours(leg.hours) }} · Stop {{ leg.stopMinutes }} min</span></li></ol>
      </template>
    </details>
    <template v-if="s.routeOptions[s.selectedRoute].reachable">
      <div class="button-row"><button aria-controls="localization-tool" @click="m.openLocalization">Find my position with the Mountain Tracker</button><button id="fit-plan" @click="m.fitRoute">Show entire route</button><button id="export-plan" @click="m.exportPlan">Export mission GeoJSON</button></div>
      <p class="hint">Switching routes returns the rover to the planned starting point.</p>
    </template>
  </section>
</template>
