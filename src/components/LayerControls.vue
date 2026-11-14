<script setup>
import { inject } from 'vue';
import { missionKey } from '../useMission';
defineProps({ compact: Boolean });
const s = inject(missionKey).state;
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
      ><label
        >疊加資料<select :id="compact ? 'map-analysis-layer' : 'analysis-layer'" v-model="s.layer">
          <option value="none">
            不疊加資料
          </option>
          <option value="terrain">{{ s.globalView ? "MOLA 全球高程" : "真實 DEM 高程" }}</option>
          <option value="slope" :disabled="s.globalView">DEM 衍生坡度</option>
          <option value="hillshade" :disabled="s.regional || s.globalView">DEM 衍生地形陰影</option>
          <option value="roughness" :disabled="s.regional || s.globalView">DEM 衍生粗糙度</option>
          <option value="geology" :disabled="!s.geologyAvailable || s.globalView">USGS 地質單元{{ !s.geologyAvailable ? "（此區未接入）" : "" }}</option>
          <option value="thermal">熱 · TES 熱慣量格網</option>
          <option value="spectral">光譜 · TES 橄欖石豐度</option>
          <option value="geophysical">地球物理 · GMM-3 重力異常</option>
          <option value="atmospheric">大氣 · MEDA 氣壓測站</option>
          <option value="radiation">輻射 · RAD 吸收劑量測站</option>
          <option value="chemical">化學 · GRS 鐵濃度格網</option>
        </select></label
      >
    <label class="checkbox"><input :id="compact ? 'map-navigation-risk' : 'navigation-risk'" v-model="s.showNavigationRisk" type="checkbox" :disabled="!s.ready" />標示路線避開區域</label>
    <div v-if="s.showNavigationRisk && !s.globalView" class="navigation-risk-key"><span><i></i>超出通行上限</span><span><i class="missing"></i>地形資料不足</span></div>
    <p v-if="s.globalView && s.showNavigationRisk" class="hint">放大至任務區域後顯示避開標記。</p>
    <p v-if="!compact" class="hint">紅色區域包含人工禁行區，或超過任務設定的坡度、粗糙度上限；黃色區域缺少地形資料。路線會避開這兩種位置；其餘位置保留原底圖。</p>
  </div>
</template>
