<script setup>
import NavigationRiskKey from "./NavigationRiskKey.vue";
import { inject, computed } from 'vue';
import { layerNames } from '../layer-guidance.mjs';
import LayerGuidance from './LayerGuidance.vue';
import { missionKey } from '../useMission';
defineProps({ compact: Boolean });
const s = inject(missionKey).state;
const rasterIds = ['thermal', 'spectral', 'geophysical', 'chemical'];

const selectedLayers = computed(() => s.layers.filter(id => s.layerStyles[id]));
function moveLayer(id, direction) {
  const layers = [...s.layers], index = layers.indexOf(id), next = index + direction;
  if (next < 0 || next >= layers.length) return;
  [layers[index], layers[next]] = [layers[next], layers[index]];
  s.layers = layers;
  s.layer = layers.at(-1) || 'none';
}
function toggleLayer(event) {
  const kind = event.target.value;
  s.layers = event.target.checked ? [...s.layers, kind] : s.layers.filter(id => id !== kind);
  s.layer = s.layers.at(-1) || 'none';
}
</script>
<template>
  <div class="layer-controls">
      <label class="checkbox"
        ><input
          :id="compact ? 'map-optical' : 'optical'"
          v-model="s.optical"
          type="checkbox"
          :disabled="!s.ready"
        />{{ s.globalView || s.regional ? 'Viking global imagery' : s.siteId === 'gale' ? 'HiRISE color orthophoto' : 'CTX optical imagery' }}</label
      ><fieldset class="layer-options">
        <legend>Map overlays</legend>
        <label v-for="layer in [
          { id: 'terrain', name: s.globalView ? 'MOLA global elevation' : 'Digital elevation model (DEM)' },
          { id: 'slope', name: 'DEM slope', disabled: s.globalView },
          { id: 'hillshade', name: 'DEM hillshade', disabled: s.regional || s.globalView },
          { id: 'roughness', name: 'DEM roughness', disabled: s.regional || s.globalView },
          { id: 'geology', name: `USGS geological units${!s.geologyAvailable ? ' (unavailable here)' : ''}`, disabled: !s.geologyAvailable || s.globalView },
          { id: 'thermal', name: 'Thermal · TES thermal inertia' },
          { id: 'spectral', name: 'Spectral · TES olivine abundance' },
          { id: 'geophysical', name: 'Geophysics · GMM-3 gravity anomaly' },
          { id: 'atmospheric', name: 'Atmosphere · MEDA pressure station' },
          { id: 'radiation', name: 'Radiation · RAD absorbed dose rate station' },
          { id: 'chemical', name: 'Chemistry · GRS iron concentration' },
        ]" :key="layer.id" class="checkbox">
          <input type="checkbox" :value="layer.id" :checked="s.layers.includes(layer.id)" :disabled="layer.disabled" @change="toggleLayer" />{{ layer.name }}
        </label>
      </fieldset>
      <LayerGuidance v-if="!compact && selectedLayers.length" />
      <button v-if="compact && selectedLayers.length" type="button" @click="s.tab='layers'; s.panelOpen=true">View {{ selectedLayers.length }} layer readings</button>
      <div v-if="selectedLayers.length" class="layer-customization">
        <strong>Layer settings</strong><small>Drawn from bottom to top</small>
        <div v-for="(id, index) in selectedLayers" :key="id" class="layer-customization__item">
          <div class="layer-customization__heading"><span>{{ layerNames[id] }}</span><div><button type="button" :disabled="index === 0" :aria-label="`${layerNames[id]} down`" @click="moveLayer(id, -1)">↓</button><button type="button" :disabled="index === selectedLayers.length - 1" :aria-label="`${layerNames[id]} up`" @click="moveLayer(id, 1)">↑</button></div></div>
          <label>Opacity {{ s.layerStyles[id].opacity }}%<input v-model.number="s.layerStyles[id].opacity" type="range" min="0" max="100" step="5" /></label>
          <template v-if="rasterIds.includes(id)">
            <label>Color scale <select v-model="s.layerStyles[id].palette"><option value="heat">Warm–cool</option><option value="terrain">Terrain</option><option value="gray">Grayscale</option></select></label>
            <div class="layer-customization__range"><label>Minimum <input v-model.number="s.layerStyles[id].min" type="number" step="any" /></label><label>Maximum <input v-model.number="s.layerStyles[id].max" type="number" step="any" /></label></div>
            <small v-if="!(s.layerStyles[id].min < s.layerStyles[id].max)">The maximum must exceed the minimum</small>
          </template>
        </div>
      </div>
    <label class="checkbox"><input :id="compact ? 'map-navigation-risk' : 'navigation-risk'" v-model="s.showNavigationRisk" type="checkbox" :disabled="!s.ready" />Show areas the route avoids</label>
    <div v-if="!compact || (s.showNavigationRisk && !s.globalView)" class="navigation-risk-key"><NavigationRiskKey /></div>
    <p v-if="s.globalView && s.showNavigationRisk" class="hint">Zoom in to the mission region to see avoidance areas.</p>
  </div>
</template>
