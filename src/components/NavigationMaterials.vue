<script setup>
import {inject} from 'vue';
import {missionKey} from '../useMission';
const m=inject(missionKey),s=m.state;
</script>
<template>
  <div class="navigation-materials">
    <details id="settings-no-go" class="planning-assumptions">
      <summary>Exclusion zones ({{ s.noGoZones.length }})</summary>
      <label>Zone name<input id="no-go-name" v-model="s.noGoName" maxlength="80" placeholder="e.g. Loose sand or dense boulders" /></label>
      <label>Radius (m)<input id="no-go-radius" v-model.number="s.noGoRadius" type="number" min="10" max="100000" /></label>
      <button id="pick-no-go" :disabled="!s.ready || s.regionLoading" :aria-pressed="s.pickingNoGo" @click="m.beginNoGo">{{ s.pickingNoGo ? 'Cancel marking' : 'Set exclusion zone center on map' }}</button>
      <p v-if="s.pickingNoGo" role="status" class="hint">Select the zone center. The area inside the dashed red circle is off limits.</p>
      <ul class="no-go-list"><li v-for="zone in s.noGoZones" :key="zone.id">{{ zone.name }} · Radius {{ m.fmt(zone.radius) }}<button :aria-label="`Remove exclusion zone ${zone.name}`" @click="m.removeNoGo(zone.id)">Remove</button></li></ul>
      <p class="hint">All three routes avoid exclusion zones, including at their endpoints. Zones retain their coordinates across regional missions.</p>
    </details>
    <details id="settings-material" class="planning-assumptions">
      <summary>Geology and thermal inertia energy settings</summary>
      <p class="hint">Set surface energy costs and exclusion zones independently. Toggling a map layer changes only its visibility.</p>
      <label class="checkbox"><input id="nav-geology" v-model="s.navigation.geologyEnabled" type="checkbox" />Adjust energy use by geological unit</label>
      <div class="field-pair">
        <label>Windblown sand multiplier<input id="nav-sand-factor" v-model.number="s.navigation.sandFactor" type="number" min="1" max="5" step="0.1" /></label>
        <label>Rugged terrain and crater rim multiplier<input id="nav-rock-factor" v-model.number="s.navigation.rockFactor" type="number" min="1" max="5" step="0.05" /></label>
      </div>
      <p class="hint">Windblown units on the Jezero geological map are treated as sand. Rugged, upper etched, rim and ejecta units use the rough-terrain multiplier. Other known units use 1. Adjust the multipliers to model travel energy use.</p>
      <label class="checkbox"><input id="nav-thermal" v-model="s.navigation.thermalEnabled" type="checkbox" />Model low thermal inertia as a surface cost</label>
      <div v-if="s.navigation.thermalEnabled" class="field-pair">
        <label>Low thermal inertia threshold<input id="nav-thermal-threshold" v-model.number="s.navigation.thermalThreshold" type="number" min="0" max="1000" /></label>
        <label>Low thermal inertia energy multiplier<input id="nav-thermal-factor" v-model.number="s.navigation.thermalFactor" type="number" min="1" max="5" step="0.1" /></label>
      </div>
      <p v-if="s.navigation.thermalEnabled" class="hint">Threshold units: J m⁻² K⁻¹ s⁻½. TES indicates regional surface properties at about 7.4 km per cell. It does not measure current temperature or the probability of getting stuck.</p>
      <label>Unknown surface energy multiplier<input id="nav-unknown-factor" v-model.number="s.navigation.unknownFactor" type="number" min="1" max="5" step="0.05" /></label>
      <p class="hint">The model uses the higher of the geology and thermal inertia multipliers. Unknown material adds an energy cost. Missing terrain blocks passage. The lower-risk and lowest-energy routes consider surface conditions. The shortest route minimizes distance.</p>
      <p v-if="!s.navigation.thermalEnabled && !s.navigationError" class="hint">{{ s.navigationStatus }}</p>
    </details>
  </div>
</template>
