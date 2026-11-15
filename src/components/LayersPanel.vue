<script setup>
import { inject } from "vue";
import { missionKey } from "../useMission";
import LayerControls from './LayerControls.vue';
import ScienceContext from './ScienceContext.vue';
import EnvironmentReadings from './EnvironmentReadings.vue';
const m = inject(missionKey),
  s = m.state;
</script>
<template>
  <div>
    <section class="group">
      <h2 id="layer-settings-title" tabindex="-1">Layer settings</h2>
      <EnvironmentReadings />
      <LayerControls />
      <div v-for="kind in s.layers.filter(id => ['terrain', 'slope', 'roughness', 'hillshade'].includes(id))" :key="kind" class="scale-legend">
        <strong>{{ { terrain: 'Elevation', slope: 'Slope', roughness: 'Roughness', hillshade: 'Hillshade' }[kind] }}</strong>
        <div class="color-scale" :class="{ grayscale: kind === 'hillshade', regional: s.regional || s.globalView }"></div>
        <div class="scale-labels"><span>{{ kind === 'hillshade' ? 'Dark: facing away from the light' : kind === 'slope' ? 'Low slope (0°)' : kind === 'roughness' ? 'Low roughness (0)' : 'Low elevation' }}</span><span>{{ kind === 'hillshade' ? 'Bright: facing the light' : kind === 'slope' ? (s.regional ? 'High slope (≥24°)' : 'High slope (≥30°)') : kind === 'roughness' ? 'High roughness (1)' : 'High elevation' }}</span></div>
        <p class="hint">{{ s.globalView ? 'MOLA global elevation and hillshade. Hover to read elevation.' : s.regional ? 'MOLA elevation scale: −8,200 to 21,800 m. Dots mark regional samples.' : 'Transparent areas have no data. Each region’s scale runs from its lowest to its highest elevation.' }}</p>
      </div>
      <p id="layer-legend" class="hint">{{ s.legend }}</p>
      <div v-for="unit in s.units" :key="unit.label" class="unit-key">
        <i :style="{ background: unit.color }"></i>{{ unit.label }}
      </div>
      <ScienceContext />
    </section>
    <section class="group">
      <h2>Data sources and limits</h2>
      <p class="hint">{{ s.source }}</p>
      <p class="hint">
        The simulation assumes a camera height of 1.7 m and a calibrated orientation. Both simulated observations and predictions use the same DEM. Real-world positioning accuracy requires independent testing.
      </p>
      <a :href="m.asset('docs/SOURCES.md')">Full data record ↗</a><br />
      <a v-if="s.regional" :href="m.dem.value.source.url" target="_blank" rel="noopener noreferrer">NASA PDS MOLA ↗</a>
      <template v-else-if="s.siteId === 'gale'"><a :href="m.dem.value.source.url" target="_blank" rel="noopener noreferrer">USGS Gale DEM ↗</a><br /><a href="https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_orthophoto_mosaic_25cm" target="_blank" rel="noopener noreferrer">USGS Gale orthophoto ↗</a></template>
      <template v-else-if="s.siteId === 'valles-ctx'"><a :href="m.dem.value.source.stac_item" target="_blank" rel="noopener noreferrer">USGS CTX terrain model ↗</a><br /><a :href="m.asset('data/valles/optical-source.json')" target="_blank" rel="noopener noreferrer">Orthophoto processing record ↗</a></template>
      <template v-else><a
        href="https://astrogeology.usgs.gov/search/map/mars_2020_science_investigation_ctx_dem_mosaic"
        target="_blank"
        rel="noopener noreferrer"
        >USGS CTX DEM ↗</a
      ><br v-if="s.siteId === 'jezero'" /><a v-if="s.siteId === 'jezero'"
        href="https://www.usgs.gov/maps/geologic-map-jezero-crater-and-nili-planum-region-mars"
        target="_blank"
        rel="noopener noreferrer"
        >Sun &amp; Stack geological map ↗</a
      ></template>
    </section>
  </div>
</template>
