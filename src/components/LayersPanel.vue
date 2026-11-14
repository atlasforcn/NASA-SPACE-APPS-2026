<script setup>
import { inject } from "vue";
import { missionKey } from "../useMission";
const m = inject(missionKey),
  s = m.state;
</script>
<template>
  <div>
    <section class="group">
      <p class="eyebrow">LOCAL / OFFLINE</p>
      <h2>整合科學圖層</h2>
      <label class="checkbox"
        ><input
          id="optical"
          v-model="s.optical"
          type="checkbox"
          :disabled="s.regional"
        />{{ s.siteId === 'gale' ? 'HiRISE 彩色正射影像' : 'CTX 光學影像' }}</label
      ><label
        >疊加資料<select id="analysis-layer" v-model="s.layer">
          <option value="none">
            {{ s.regional ? "MOLA 全球地形陰影" : "光學影像" }}
          </option>
          <option value="terrain">真實 DEM 高程</option>
          <option value="slope">DEM 衍生坡度</option>
          <option value="hillshade" :disabled="s.regional">DEM 衍生地形陰影</option>
          <option value="roughness" :disabled="s.regional">DEM 衍生粗糙度</option>
          <option value="geology" :disabled="!s.geologyAvailable">USGS 地質單元{{ !s.geologyAvailable ? "（此區未接入）" : "" }}</option>
        </select></label
      >
      <div v-if="['terrain', 'slope', 'roughness', 'hillshade'].includes(s.layer)" class="scale-legend">
        <div class="color-scale" :class="{ grayscale: s.layer === 'hillshade', regional: s.regional }"></div>
        <div class="scale-labels"><span>{{ s.layer === 'hillshade' ? '暗：背光' : s.layer === 'slope' ? '低坡度（0°）' : s.layer === 'roughness' ? '低粗糙度（0）' : '低高程' }}</span><span>{{ s.layer === 'hillshade' ? '亮：迎光' : s.layer === 'slope' ? (s.regional ? '高坡度（≥24°）' : '高坡度（≥30°）') : s.layer === 'roughness' ? '高粗糙度（1）' : '高高程' }}</span></div>
        <p class="hint">{{ s.regional ? 'MOLA 高程色階：−8,200 至 21,800 m；圓點為區域取樣。' : '透明處為缺值。高程色階依各區資料範圍縮放，相同顏色不代表跨區相同高程。' }}</p>
      </div>
      <p id="layer-legend" class="hint">{{ s.legend }}</p>
      <div v-for="unit in s.units" :key="unit.label" class="unit-key">
        <i :style="{ background: unit.color }"></i>{{ unit.label }}
      </div>
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
      <template v-else><a
        href="https://astrogeology.usgs.gov/search/map/mars_2020_science_investigation_ctx_dem_mosaic"
        target="_blank"
        rel="noopener noreferrer"
        >USGS CTX DEM ↗</a
      ><br /><a
        href="https://www.usgs.gov/maps/geologic-map-jezero-crater-and-nili-planum-region-mars"
        target="_blank"
        rel="noopener noreferrer"
        >Sun & Stack 地質圖 ↗</a
      ></template>
    </section>
  </div>
</template>
