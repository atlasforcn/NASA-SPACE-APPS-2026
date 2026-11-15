<script setup>
import { computed, inject, ref, watch } from "vue";
import { missionKey } from "../useMission";
import regions from "../../regions.mjs";
const m = inject(missionKey),
  s = m.state;
const selectedRegion = ref('jezero');
const showAllNames = ref(false);
const filteringNames = computed(() => Boolean(s.query.trim() || s.type));
const listedNames = computed(() => filteringNames.value || showAllNames.value
  ? m.matches.value
  : m.matches.value.filter(place => place.featured));
watch(() => s.siteId, id => {
  if (regions.some(region => region.id === id)) selectedRegion.value = id;
});
function loadPreset() {
  if (selectedRegion.value === 'gale') m.startGale();
  else if (selectedRegion.value === 'valles-ctx') m.startValles();
  else if (selectedRegion.value === 'jezero') m.restore();
}
function selectRegion(event) {
  const region = regions.find(r => r.id === event.target.value);
  if (region) { s.lat = region.lat; s.lng = region.lng; }
}
</script>
<template>
  <div>
    <section class="group">
      <h2>Choose an exploration region</h2>
      <label>Terrain region<select id="dem-region-preset" v-model="selectedRegion" :disabled="!s.ready || s.regionLoading" @change="selectRegion">
        <option v-for="r in regions" :key="r.id" :value="r.id">{{ r.title }} · {{ r.cellMeters }} m/cell</option>
      </select></label>
      <button id="load-region" class="primary wide" :disabled="!s.ready || s.regionLoading" @click="loadPreset">{{ s.regionLoading ? 'Loading terrain…' : 'Load selected region →' }}</button>
      <h3 class="subheading">Custom coordinates / global MOLA</h3>
      <p class="hint">Custom regions have a minimum grid spacing of 4 km.</p>
      <p class="hint">Enter the coordinates of the mission center. Coverage expands to include starting points, destinations and drawn routes across regions.</p>
      <div class="field-pair">
        <label
          >Latitude °N<input
            id="region-lat"
            @focus="s.coordinateEditing = true"
            @blur="s.coordinateEditing = false"
            v-model="s.lat"
            type="number"
            min="-90"
            max="90"
            step="0.0001" /></label
        ><label
          >Longitude °E<input
            id="region-lng"
            @focus="s.coordinateEditing = true"
            @blur="s.coordinateEditing = false"
            v-model="s.lng"
            type="number"
            min="-180"
            max="180"
            step="0.0001"
        /></label>
      </div>
      <button
        id="region-start"
        class="primary wide"
        :disabled="!s.ready || s.regionLoading"
        @click="m.startRegion"
      >
        {{
          s.regionLoading ? "Loading MOLA…" : "Create regional mission here →"
        }}</button>
      <p id="region-status" class="hint" role="status">{{ s.regionStatus }}</p>
      <p class="hint">{{ s.elevation }}</p>
    </section>
    <section class="group">
      <p class="eyebrow">IAU / USGS GAZETTEER · NASA LANDING</p>
      <h2>Mars place names and landing sites</h2>
      <label
        >Search places and landing sites<input
          id="named-search"
          v-model="s.query"
          type="search"
          placeholder="Olympus Mons, Jezero, Valles Marineris…" /></label
      ><label
        >Feature type<select id="named-type" v-model="s.type">
          <option value="">All types</option>
          <option value="LANDING">Historical landing site</option>
          <option v-for="(label, key) in m.typeLabels" :key="key" :value="key">
            {{ label }}
          </option>
        </select></label
      >
      <p id="named-count" class="hint">
        {{
          s.namesError ||
          (filteringNames ? `Found ${listedNames.length} places` : showAllNames ? `All ${listedNames.length} places` : `Featured ${listedNames.length} places`)
        }}
      </p>
      <button v-if="!filteringNames && s.entries.length" type="button" aria-controls="named-list" :aria-expanded="showAllNames" @click="showAllNames = !showAllNames">
        {{ showAllNames ? "Show featured places" : `Show all ${s.entries.length} places` }}
      </button>
      <div id="named-list" class="list">
        <button
          v-for="p in listedNames"
          :key="p.name"
          @click="m.selectName(p)"
        >
          {{ p.zh || p.name
          }}<small
            >{{ p.zh && p.name !== p.zh ? p.name : m.typeLabels[p.code] || p.type }} ↗</small
          >
        </button>
      </div>
      <article v-if="s.selected" class="detail-card">
        <h3>{{ s.selected.zh || s.selected.name }}</h3>
        <p>
          <template v-if="s.selected.zh && s.selected.zh !== s.selected.name">{{ s.selected.name }} · </template>
          {{ m.typeLabels[s.selected.code] || s.selected.type }}
        </p>
        <p>{{ s.selected.kind || `IAU name · approved ${s.selected.approvedAt}` }}</p>
        <p>{{ s.selected.description }}</p>
        <p>{{ s.selected.origin }}</p>
        <p>
          {{ s.selected.kind ? 'Historical landing coordinates' : 'Catalog center' }} {{ s.selected.lat.toFixed(4) }}°N /
          {{ s.selected.eastLongitude.toFixed(4) }}°E<span v-if="!s.selected.kind"> · Diameter {{ s.selected.diameterKm }} km</span>
        </p>
        <div class="button-row">
          <button id="named-add-stop" :disabled="!s.ready || s.regionLoading" @click="m.addNamedTarget(s.selected, 'stop')">Add to stop sequence</button>
          <button id="named-set-destination" :disabled="!s.ready || s.regionLoading" @click="m.addNamedTarget(s.selected, 'destination')">Set as destination</button>
        </div>
        <p class="hint" role="status">{{ s.namedTargetStatus }}</p>
        <a :href="s.selected.url" target="_blank" rel="noopener noreferrer"
          >{{ s.selected.kind ? 'NASA naming record ↗' : 'USGS / IAU record ↗' }}</a
        ><button
          class="primary wide"
          :disabled="s.regionLoading"
          @click="
            s.lat = s.selected.lat;
            s.lng = s.selected.lng;
            m.startRegion();
          "
        >
          Create a regional mission here
        </button>
      </article>
    </section>
    <section class="group">
      <h2>Mission sites and candidate peaks</h2>
      <div class="list">
        <button v-for="p in s.pois" :key="p.id" @click="m.selectPoi(p)">
          {{ p.name }}<small>{{ p.kind }}</small>
        </button>
      </div>
      <article v-if="s.poi" class="detail-card">
        <h3>{{ s.poi.name }}</h3>
        <p>{{ s.poi.kind }}</p>
        <p>{{ s.poi.status || s.poi.science }}</p>
        <a
          v-if="s.poi.source"
          :href="s.poi.source"
          target="_blank"
          rel="noopener noreferrer"
          >NASA naming source ↗</a
        >
      </article>
    </section>
  </div>
</template>
