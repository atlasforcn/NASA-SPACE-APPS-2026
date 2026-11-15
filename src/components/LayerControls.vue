<script setup>
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
        />{{ s.globalView || s.regional ? 'Viking 全球光學影像' : s.siteId === 'gale' ? 'HiRISE 彩色正射影像' : 'CTX 光學影像' }}</label
      ><fieldset class="layer-options">
        <legend>疊加資料</legend>
        <label v-for="layer in [
          { id: 'terrain', name: s.globalView ? 'MOLA 全球高程' : '真實 DEM 高程' },
          { id: 'slope', name: 'DEM 衍生坡度', disabled: s.globalView },
          { id: 'hillshade', name: 'DEM 衍生地形陰影', disabled: s.regional || s.globalView },
          { id: 'roughness', name: 'DEM 衍生粗糙度', disabled: s.regional || s.globalView },
          { id: 'geology', name: `USGS 地質單元${!s.geologyAvailable ? '（此區未接入）' : ''}`, disabled: !s.geologyAvailable || s.globalView },
          { id: 'thermal', name: '熱 · TES 熱慣量格網' },
          { id: 'spectral', name: '光譜 · TES 橄欖石豐度' },
          { id: 'geophysical', name: '地球物理 · GMM-3 重力異常' },
          { id: 'atmospheric', name: '大氣 · MEDA 氣壓測站' },
          { id: 'radiation', name: '輻射 · RAD 吸收劑量測站' },
          { id: 'chemical', name: '化學 · GRS 鐵濃度格網' },
        ]" :key="layer.id" class="checkbox">
          <input type="checkbox" :value="layer.id" :checked="s.layers.includes(layer.id)" :disabled="layer.disabled" @change="toggleLayer" />{{ layer.name }}
        </label>
      </fieldset>
      <LayerGuidance v-if="!compact && selectedLayers.length" />
      <button v-if="compact && selectedLayers.length" type="button" @click="s.tab='layers'; s.panelOpen=true">查看 {{ selectedLayers.length }} 項圖層判讀</button>
      <div v-if="selectedLayers.length" class="layer-customization">
        <strong>圖層設定</strong><small>由下至上繪製</small>
        <div v-for="(id, index) in selectedLayers" :key="id" class="layer-customization__item">
          <div class="layer-customization__heading"><span>{{ layerNames[id] }}</span><div><button type="button" :disabled="index === 0" :aria-label="`${layerNames[id]} 下移`" @click="moveLayer(id, -1)">↓</button><button type="button" :disabled="index === selectedLayers.length - 1" :aria-label="`${layerNames[id]} 上移`" @click="moveLayer(id, 1)">↑</button></div></div>
          <label>不透明度 {{ s.layerStyles[id].opacity }}%<input v-model.number="s.layerStyles[id].opacity" type="range" min="0" max="100" step="5" /></label>
          <template v-if="rasterIds.includes(id)">
            <label>色階 <select v-model="s.layerStyles[id].palette"><option value="heat">冷暖</option><option value="terrain">地形</option><option value="gray">灰階</option></select></label>
            <div class="layer-customization__range"><label>下限 <input v-model.number="s.layerStyles[id].min" type="number" step="any" /></label><label>上限 <input v-model.number="s.layerStyles[id].max" type="number" step="any" /></label></div>
            <small v-if="!(s.layerStyles[id].min < s.layerStyles[id].max)">上限須大於下限</small>
          </template>
        </div>
      </div>
    <label class="checkbox"><input :id="compact ? 'map-navigation-risk' : 'navigation-risk'" v-model="s.showNavigationRisk" type="checkbox" :disabled="!s.ready" />標示路線避開區域</label>
    <div v-if="s.showNavigationRisk && !s.globalView" class="navigation-risk-key"><span><i></i>超出通行上限</span><span><i class="missing"></i>地形資料不足</span></div>
    <p v-if="s.globalView && s.showNavigationRisk" class="hint">放大至任務區域後顯示避開標記。</p>
    <p v-if="!compact" class="hint">紅色：人工標記的禁行區，黃色：資料缺失點</p>
  </div>
</template>
