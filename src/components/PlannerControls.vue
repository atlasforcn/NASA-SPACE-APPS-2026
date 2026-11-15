<script setup>
import { inject, ref, computed } from 'vue';
import { missionKey } from '../useMission';
const m = inject(missionKey), s = m.state;
const namedQuery = ref(''), namedChoice = ref('');
const namedMatches = computed(() => {
  const query = namedQuery.value.trim().toLowerCase();
  return s.entries.filter(p => query ? `${p.name} ${p.zh || ''}`.toLowerCase().includes(query) : p.featured).slice(0,100);
});
const chosenName = computed(() => s.entries.find(p => p.name === namedChoice.value));
</script>
<template>
  <div class="planner-controls">
    <details id="settings-stops" class="planning-assumptions">
      <summary>Intermediate stops and place search</summary>
      <p class="hint">Add intermediate stops, then choose the final destination.</p>
      <label>Search places and landing sites<input id="stop-named-search" v-model="namedQuery" type="search" placeholder="Olympus Mons, Jezero, Octavia E. Butler Landing…" @input="namedChoice = ''" /></label>
      <label>Select a place<select id="stop-named-place" v-model="namedChoice" :disabled="s.regionLoading">
        <option value="">{{ namedMatches.length ? 'Choose a place' : 'No place found. Try another search.' }}</option>
        <option v-for="p in namedMatches" :key="p.name" :value="p.name">{{ p.zh && p.zh !== p.name ? `${p.zh} · ${p.name}` : p.name }}</option>
      </select></label>
      <div class="button-row">
        <button id="stop-add-named" :disabled="!s.ready || s.regionLoading || !chosenName" @click="m.addNamedTarget(chosenName, 'stop')">Add to stop sequence</button>
        <button id="stop-destination-named" :disabled="!s.ready || s.regionLoading || !chosenName" @click="m.addNamedTarget(chosenName, 'destination')">Set as destination</button>
      </div>
      <p class="hint">Featured places appear before you search. Results are limited to 100. Stops use catalog centers or historical landing coordinates. Terrain coverage expands as needed.</p>
      <p class="hint" role="status">{{ s.namedTargetStatus }}</p>
      <button id="add-stop" :disabled="!s.destination || s.stopIds.includes(s.destination)" @click="m.addStop">Add selected destination as a stop</button>
      <ol class="planner-stops">
        <li v-for="(id, i) in s.stopIds" :key="id">
          <span>{{ s.targets.find(t => t.id === id)?.name }}</span>
          <button :disabled="i === 0" :aria-label="`Move up stop ${i+1}`" @click="m.moveStop(i,-1)">↑</button>
          <button :disabled="i === s.stopIds.length-1" :aria-label="`Move down stop ${i+1}`" @click="m.moveStop(i,1)">↓</button>
          <button :aria-label="`Remove stop ${i+1}`" @click="m.removeStop(i)">Remove</button>
        </li>
      </ol>
      <p class="hint">Destination: {{ s.targets.find(t => t.id === s.destination)?.name || 'Choose a destination' }}</p>
    </details>
    <details id="settings-energy" class="planning-assumptions">
      <summary>Slope and travel energy</summary>
      <div class="field-pair">
        <label>Extra energy per 1% uphill grade (%)<input id="uphill-penalty" v-model.number="s.planner.uphillPenalty" type="number" min="0" max="100" /></label>
        <label>Energy saved per 1% downhill grade (%)<input id="downhill-saving" v-model.number="s.planner.downhillSaving" type="number" min="0" max="100" /></label>
      </div>
      <p class="hint">At the default settings, a 10% uphill grade uses about twice the flat-ground energy per meter. A 10% descent uses about half. Energy use has a 25% floor. Return legs are recalculated in the travel direction. These coefficients are adjustable scenario assumptions.</p>
    </details>
    <details id="settings-assumptions" class="planning-assumptions">
      <summary>Travel time and risk settings</summary>
      <div class="field-pair">
        <label>Level-ground walking speed (km/h)<input id="walk-speed" v-model.number="s.planner.speedKmh" type="number" min="0.1" max="10" step="0.1" /></label>
        <label>Time budget (hours)<input id="time-budget" v-model.number="s.planner.budgetHours" type="number" min="0.1" step="0.5" /></label>
      </div>
      <p class="hint">Walking time uses an Earth-based speed adjusted for slope. Total time includes stops.</p>
      <div class="field-pair">
        <label>Time at each stop (minutes)<input id="stop-minutes" v-model.number="s.planner.stopMinutes" type="number" min="0" step="5" /></label>
        <label>Steep slope threshold (°)<input id="high-slope" v-model.number="s.planner.highSlope" type="number" min="0" max="45" /></label>
      </div>
      <label>Terrain risk weight {{ s.planner.riskWeight }}<input id="risk-weight" v-model.number="s.planner.riskWeight" type="range" min="0" max="5" step="0.25" /></label>
      <label><input id="round-trip" v-model="s.planner.roundTrip" type="checkbox" /> Plan a return to the starting point</label>
    </details>
  </div>
</template>
