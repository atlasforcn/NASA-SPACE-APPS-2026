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
      <h2>選擇探索區域</h2>
      <label>選擇地形區域<select id="dem-region-preset" v-model="selectedRegion" :disabled="!s.ready || s.regionLoading" @change="selectRegion">
        <option v-for="r in regions" :key="r.id" :value="r.id">{{ r.title }} · {{ r.name }} · {{ r.cellMeters }} m／格</option>
      </select></label>
      <button id="load-region" class="primary wide" :disabled="!s.ready || s.regionLoading" @click="loadPreset">{{ s.regionLoading ? '正在載入地形…' : '載入所選區域 →' }}</button>
      <h3 class="subheading">自訂座標 / 全球 MOLA</h3>
      <p class="hint">自訂區域每格至少 4 公里。</p>
      <p class="hint">輸入中心座標建立任務；起點、目的地與繪製路線可跨區域，覆蓋範圍自動調整。</p>
      <div class="field-pair">
        <label
          >緯度 °N<input
            id="region-lat"
            @focus="s.coordinateEditing = true"
            @blur="s.coordinateEditing = false"
            v-model="s.lat"
            type="number"
            min="-90"
            max="90"
            step="0.0001" /></label
        ><label
          >經度 °E<input
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
          s.regionLoading ? "正在載入 MOLA…" : "以此處建立區域任務 →"
        }}</button>
      <p id="region-status" class="hint" role="status">{{ s.regionStatus }}</p>
      <p class="hint">{{ s.elevation }}</p>
    </section>
    <section class="group">
      <p class="eyebrow">IAU / USGS GAZETTEER · NASA LANDING</p>
      <h2>火星地名與著陸點</h2>
      <label
        >搜尋地名與著陸點<input
          id="named-search"
          v-model="s.query"
          type="search"
          placeholder="Olympus Mons、Jezero、水手號谷…" /></label
      ><label
        >地形類型<select id="named-type" v-model="s.type">
          <option value="">全部類型</option>
          <option value="LANDING">歷史著陸點</option>
          <option v-for="(label, key) in m.typeLabels" :key="key" :value="key">
            {{ label }}
          </option>
        </select></label
      >
      <p id="named-count" class="hint">
        {{
          s.namesError ||
          (filteringNames ? `找到 ${listedNames.length} 個地點` : showAllNames ? `全部 ${listedNames.length} 個地點` : `精選 ${listedNames.length} 個地點`)
        }}
      </p>
      <button v-if="!filteringNames && s.entries.length" type="button" aria-controls="named-list" :aria-expanded="showAllNames" @click="showAllNames = !showAllNames">
        {{ showAllNames ? "只看精選地點" : `顯示全部 ${s.entries.length} 個地點` }}
      </button>
      <div id="named-list" class="list">
        <button
          v-for="p in listedNames"
          :key="p.name"
          @click="m.selectName(p)"
        >
          {{ p.zh || p.name
          }}<small
            >{{ p.zh ? p.name : m.typeLabels[p.code] || p.type }} ↗</small
          >
        </button>
      </div>
      <article v-if="s.selected" class="detail-card">
        <h3>{{ s.selected.zh || s.selected.name }}</h3>
        <p>
          {{ s.selected.name }} ·
          {{ m.typeLabels[s.selected.code] || s.selected.type }}
        </p>
        <p>{{ s.selected.kind || `IAU 正式地名 · 核准 ${s.selected.approvedAt}` }}</p>
        <p>{{ s.selected.description }}</p>
        <p>{{ s.selected.origin }}</p>
        <p>
          {{ s.selected.kind ? '歷史著陸座標' : '目錄中心' }} {{ s.selected.lat.toFixed(4) }}°N /
          {{ s.selected.eastLongitude.toFixed(4) }}°E<span v-if="!s.selected.kind"> · 尺度 {{ s.selected.diameterKm }} km</span>
        </p>
        <div class="button-row">
          <button id="named-add-stop" :disabled="!s.ready || s.regionLoading" @click="m.addNamedTarget(s.selected, 'stop')">加入停靠順序</button>
          <button id="named-set-destination" :disabled="!s.ready || s.regionLoading" @click="m.addNamedTarget(s.selected, 'destination')">設為終點</button>
        </div>
        <p class="hint" role="status">{{ s.namedTargetStatus }}</p>
        <a :href="s.selected.url" target="_blank" rel="noopener noreferrer"
          >{{ s.selected.kind ? 'NASA 命名資料 ↗' : 'USGS／IAU 資料 ↗' }}</a
        ><button
          class="primary wide"
          :disabled="s.regionLoading"
          @click="
            s.lat = s.selected.lat;
            s.lng = s.selected.lng;
            m.startRegion();
          "
        >
          在此建立區域任務
        </button>
      </article>
    </section>
    <section class="group">
      <h2>任務景點與候選峰</h2>
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
          >NASA 命名來源 ↗</a
        >
      </article>
    </section>
  </div>
</template>
