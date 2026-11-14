<script setup>
import { inject } from 'vue';
import { missionKey } from '../useMission';
defineProps({ compact: Boolean });
const s = inject(missionKey).state;
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
    <label class="checkbox"><input :id="compact ? 'map-navigation-risk' : 'navigation-risk'" v-model="s.showNavigationRisk" type="checkbox" :disabled="!s.ready" />標示路線避開區域</label>
    <div v-if="s.showNavigationRisk && !s.globalView" class="navigation-risk-key"><span><i></i>超出通行上限</span><span><i class="missing"></i>地形資料不足</span></div>
    <p v-if="s.globalView && s.showNavigationRisk" class="hint">放大至任務區域後顯示避開標記。</p>
    <p v-if="!compact" class="hint">紅色區域包含人工禁行區，或超過任務設定的坡度、粗糙度上限；黃色區域缺少地形資料。路線會避開這兩種位置；其餘位置保留原底圖。</p>
  </div>
</template>
