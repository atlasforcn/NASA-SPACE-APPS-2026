<script setup>
import { computed, inject } from 'vue';
import { palettes } from '../science-style.mjs';
import { missionKey } from '../useMission';

const m = inject(missionKey), s = m.state;
const location = computed(() => s.walk?.station || s.targets.find(t => t.id === s.destination) || s.poi);
const point = computed(() => m.scienceAt(location.value));
const meta = computed(() => s.scienceMeta);
const cell = computed(() => m.scienceCellAt(point.value));
const range = computed(() => s.scienceLayers[s.layer]?.range || meta.value?.scale);
const sampled = computed(() => m.scienceValueAt(point.value));
const value = (n, digits = 0) => Number.isFinite(n) ? n.toFixed(digits) : 'No valid data';
const examples = [
  { id: 'optical', name: 'Optical', example: 'Surface imagery, rocks and recognizable landmarks', use: 'Compare imagery with the terrain to identify features near the destination.' },
  { id: 'thermal', name: 'Thermal' },
  { id: 'spectral', name: 'Spectral' },
  { id: 'terrain', name: 'Terrain', example: 'Elevation, slope, hillshade and roughness', use: 'Inspect terrain, line of sight and slopes along the route.' },
  { id: 'geophysical', name: 'Geophysics' },
  { id: 'atmospheric', name: 'Atmosphere', use: 'Shows atmospheric pressure recorded by Perseverance’s MEDA station.' },
  { id: 'radiation', name: 'Radiation', use: 'Shows historical absorbed dose rates in Curiosity’s RAD silicon detector.' },
  { id: 'chemical', name: 'Chemistry' },
];
const active = computed(() => examples.filter(e => e.id === (
  s.layer === 'none' ? 'optical' : ['slope', 'hillshade', 'roughness', 'geology'].includes(s.layer) ? 'terrain' : s.layer
)));
</script>

<template>
  <div class="science-context">
    <p class="hint" role="status">{{ location ? `Selected location: ${location.name}` : 'Add a destination under Mission or select a site under Explore.' }}</p>
    <p v-if="point" class="hint">{{ value(point.lat, 5) }}°N / {{ value(point.lng, 5) }}°E · Mars planetocentric coordinates</p>
    <article v-for="item in active" :key="item.id" class="detail-card">
      <h3>{{ item.name }}</h3>
      <template v-if="item.id === 'terrain'">
        <template v-if="point">
          <p>DEM elevation: {{ value(point.height) }} m<br />DEM slope: {{ value(point.slope, 1) }}°<br />Grid spacing: about {{ value(point.cellMeters) }} m</p>
          <p v-if="point.unit">USGS geological unit: {{ point.unit }}</p>
          <a v-if="point.source" :href="point.source" target="_blank" rel="noopener noreferrer">Source DEM ↗</a>
          <p class="hint">Elevation is interpolated from the DEM. Slope uses the grid spacing. Samples stop at gaps and boundaries. The grid cannot resolve wheel-scale obstacles.<span v-if="s.geologyAvailable">Geology is mapped at 1:75,000.</span></p>
        </template>
        <p v-else class="hint">Select a location and wait for the DEM to load.</p>
      </template>
      <template v-else-if="item.id === 'optical'">
        <template v-if="!s.regional && !s.globalView">
          <p>{{ s.siteId === 'gale' ? 'USGS HiRISE orthoimage. Native resolution is 0.25 m/pixel, displayed at about 6.67 m/pixel. Color covers about 51.5% of the image. The rest is grayscale.' : s.siteId === 'valles-ctx' ? 'USGS CTX orthoimage. Native resolution is about 20 m/pixel, displayed at 40 m/pixel. Missing pixels are transparent.' : 'Full USGS CTX orthoimage footprint. Native resolution is about 5 m/pixel, displayed at about 20 m/pixel. The DEM covers the central 30 × 30 km.' }}</p>
          <button :disabled="!s.ready || s.regionLoading" @click="s.optical = true; s.layer = 'none'">Show optical imagery on the map</button>
          <a :href="m.asset(s.siteId === 'gale' ? 'data/gale/optical-source.json' : s.siteId === 'valles-ctx' ? 'data/valles/optical-source.json' : 'data/jezero-extended/optical-source.json')" target="_blank" rel="noopener noreferrer">Imagery sources and processing ↗</a>
          <p class="hint">The mosaic covers only locations within the image footprint.</p>
        </template>
        <template v-else>
          <p class="hint">USGS Viking historical image mosaic, about 10.4 km/pixel.</p>
          <button :disabled="!s.ready" @click="s.optical = true; s.layer = 'none'">Show optical imagery on the map</button>
          <a href="https://astrogeology.usgs.gov/search/map/mars_viking_colorized_global_mosaic_232m" target="_blank" rel="noopener noreferrer">Viking imagery source ↗</a>
        </template>
      </template>
      <template v-else>
        <p class="hint" role="status">{{ s.scienceStatus }}</p>
        <button v-if="!s.scienceLoading && (!meta || s.scienceStatus.includes('failed'))" @click="m.retryScience">Retry science layers</button>
        <template v-if="meta">
          <template v-if="meta.kind === 'raster'">
            <p>{{ meta.title }}</p>
            <div class="science-scale" :style="{ background: 'linear-gradient(to right,' + palettes[s.layerStyles[s.layer].palette].map(c => 'rgb(' + c.join(',') + ')').join(',') + ')' }" aria-hidden="true"></div>
            <p class="hint">{{ range[0] }} → {{ range[1] }} {{ meta.unit }} · Transparent where data are missing</p>
            <p v-if="cell" class="hint">Row {{ cell.row }}, column {{ cell.col }} · Longitude {{ cell.west }}°–{{ cell.east }}° E, latitude {{ cell.south }}°–{{ cell.north }}°</p>
            <p v-if="point" class="science-sample">Selected location: {{ sampled === null ? 'No valid data in this cell' : value(sampled, 3) + ' ' + meta.unit }}</p>
            <p class="hint">Native product up to {{ meta.native_ppd }} pixels/degree. Display grid: {{ meta.display_ppd }} pixels/degree. Cursor and location readings use this grid without interpolating across missing values.</p>
            <p v-if="item.id === 'geophysical'" class="hint">GMM-3 gravity anomaly through spherical harmonic degree 100. Grid spacing is finer than the model’s effective resolution.</p>
            <p v-if="item.id === 'chemical'" class="hint">GRS regional iron content is a mass percentage on a 5° grid. Individual rock samples and local navigation hazards are below its resolution.</p>
            <p v-if="item.id === 'spectral'" class="hint">TES thermal infrared spectra provide the estimated olivine abundance.</p>
            <button @click="m.focusScience">Show global overlay</button>
            <a :href="m.asset(`data/science/${item.id}.bin`)" download>Download numerical grid</a>
          </template>
          <template v-else>
            <p>{{ meta.name }}: {{ value(meta.value, 3) }} {{ meta.unit }}</p>
            <p class="hint">{{ meta.start }}{{ meta.stop ? ' to ' + meta.stop : ' onward' }} · {{ meta.count }} valid samples</p>
            <p class="hint">Range {{ value(meta.min, 3) }}–{{ value(meta.max, 3) }} {{ meta.unit }}</p>
            <p class="hint">{{ meta.note }}</p>
            <button @click="m.focusScience">Show station location</button>
            <a :href="m.asset(meta.source.local)" download>Download original observations</a>
            <a :href="meta.coordinate_source" target="_blank" rel="noopener noreferrer">Station coordinates ↗</a>
          </template>
          <p><a :href="meta.source.url" target="_blank" rel="noopener noreferrer">Original data source ↗</a> · <a :href="m.asset('data/science/manifest.json')" target="_blank" rel="noopener noreferrer">Coordinates, processing and SHA-256 ↗</a></p>
        </template>
      </template>
      <p v-if="item.use" class="hint">{{ item.use }}</p>
    </article>
  </div>
</template>

<style scoped>
.science-context .detail-card { margin-top: 10px; }
.science-scale { height: 10px; border-radius: 4px; background: linear-gradient(to right, rgb(35,70,150), rgb(42,180,180), rgb(235,220,100), rgb(210,65,50)); }
.science-context a { overflow-wrap: anywhere; }
.science-context button { margin: 4px 8px 4px 0; }
</style>
