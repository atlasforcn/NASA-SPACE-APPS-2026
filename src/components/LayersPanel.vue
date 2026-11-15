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
      <h2 id="layer-settings-title" tabindex="-1">圖層設定</h2>
      <EnvironmentReadings />
      <LayerControls />
      <div v-for="kind in s.layers.filter(id => ['terrain', 'slope', 'roughness', 'hillshade'].includes(id))" :key="kind" class="scale-legend">
        <strong>{{ { terrain: '高程', slope: '坡度', roughness: '粗糙度', hillshade: '地形陰影' }[kind] }}</strong>
        <div class="color-scale" :class="{ grayscale: kind === 'hillshade', regional: s.regional || s.globalView }"></div>
        <div class="scale-labels"><span>{{ kind === 'hillshade' ? '暗：背光' : kind === 'slope' ? '低坡度（0°）' : kind === 'roughness' ? '低粗糙度（0）' : '低高程' }}</span><span>{{ kind === 'hillshade' ? '亮：迎光' : kind === 'slope' ? (s.regional ? '高坡度（≥24°）' : '高坡度（≥30°）') : kind === 'roughness' ? '高粗糙度（1）' : '高高程' }}</span></div>
        <p class="hint">{{ s.globalView ? 'MOLA 全球高程與陰影；游標讀取數值高程。' : s.regional ? 'MOLA 高程色階：−8,200 至 21,800 m；圓點為區域取樣。' : '透明處缺少資料。各區色階依當地最低與最高高程調整。' }}</p>
      </div>
      <p id="layer-legend" class="hint">{{ s.legend }}</p>
      <div v-for="unit in s.units" :key="unit.label" class="unit-key">
        <i :style="{ background: unit.color }"></i>{{ unit.label }}
      </div>
      <ScienceContext />
    </section>
    <section class="group">
      <h2>資料來源與限制</h2>
      <p class="hint">{{ s.source }}</p>
      <p class="hint">
        相機高度 1.7 m，假定姿態已校正。定位使用同一 DEM
        模擬，不代表真實相機或任務級導航精度。
      </p>
      <a :href="m.asset('docs/SOURCES.md')">完整資料紀錄 ↗</a><br />
      <a v-if="s.regional" :href="m.dem.value.source.url" target="_blank" rel="noopener noreferrer">NASA PDS MOLA ↗</a>
      <template v-else-if="s.siteId === 'gale'"><a :href="m.dem.value.source.url" target="_blank" rel="noopener noreferrer">USGS Gale DEM ↗</a><br /><a href="https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_orthophoto_mosaic_25cm" target="_blank" rel="noopener noreferrer">USGS Gale 正射影像來源 ↗</a></template>
      <template v-else-if="s.siteId === 'valles-ctx'"><a :href="m.dem.value.source.stac_item" target="_blank" rel="noopener noreferrer">USGS CTX DTM 來源 ↗</a><br /><a :href="m.asset('data/valles/optical-source.json')" target="_blank" rel="noopener noreferrer">正射影像處理紀錄 ↗</a></template>
      <template v-else><a
        href="https://astrogeology.usgs.gov/search/map/mars_2020_science_investigation_ctx_dem_mosaic"
        target="_blank"
        rel="noopener noreferrer"
        >USGS CTX DEM ↗</a
      ><br v-if="s.siteId === 'jezero'" /><a v-if="s.siteId === 'jezero'"
        href="https://www.usgs.gov/maps/geologic-map-jezero-crater-and-nili-planum-region-mars"
        target="_blank"
        rel="noopener noreferrer"
        >Sun & Stack 地質圖 ↗</a
      ></template>
    </section>
  </div>
</template>
