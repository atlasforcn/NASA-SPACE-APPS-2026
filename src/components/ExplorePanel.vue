<script setup>
import { inject } from "vue";
import { missionKey } from "../useMission";
import regions from "../../regions.mjs";
const m = inject(missionKey),
  s = m.state;
function selectRegion(event) {
  const region = regions.find(r => r.id === event.target.value);
  if (region) { s.lat = region.lat; s.lng = region.lng; }
}
</script>
<template>
  <div>
    <section class="group">
      <button id="load-gale" class="primary wide" :disabled="!s.ready || s.regionLoading" @click="m.startGale">Gale 高解析 DEM＋正射影像 →</button>
      <label>DEM 區域快捷選擇<select id="dem-region-preset" :disabled="s.regionLoading" @change="selectRegion">
        <option value="">自行輸入座標</option>
        <option v-for="r in regions" :key="r.id" :value="r.id">{{ r.name }}</option>
      </select></label>
      <p class="hint">快捷區域使用同一份全球 MOLA，區域格距至少 4 km，並非新增高解析觀測。Jezero 精細 CTX 請使用「回到 Jezero」。</p>
      <p class="hint">輸入中心座標建立任務；起點、觀測點與繪製路線可跨區域，覆蓋範圍自動調整。</p>
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
        }}</button
      ><button
        id="restore-jezero"
        v-if="s.regional || s.siteId !== 'jezero' || s.regionLoading"
        class="wide"
        @click="m.restore"
      >
        回到 Jezero / 取消載入
      </button>
      <p id="region-status" class="hint" role="status">{{ s.regionStatus }}</p>
      <p class="hint">{{ s.elevation }}</p>
    </section>
    <section class="group">
      <p class="eyebrow">IAU / USGS GAZETTEER</p>
      <h2>火星已命名奇觀</h2>
      <label
        >搜尋正式地名<input
          id="named-search"
          v-model="s.query"
          type="search"
          placeholder="Olympus Mons、Jezero、水手號谷…" /></label
      ><label
        >地形類型<select id="named-type" v-model="s.type">
          <option value="">全部類型</option>
          <option v-for="(label, key) in m.typeLabels" :key="key" :value="key">
            {{ label }}
          </option>
        </select></label
      >
      <p id="named-count" class="hint">
        {{
          s.namesError ||
          `${s.entries.length} 個正式地名 · 符合 ${m.matches.value.length} 個 · 顯示 ${m.displayed.value.length} 個`
        }}
      </p>
      <div id="named-list" class="list">
        <button
          v-for="p in m.displayed.value"
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
        <p>IAU 正式地名 · 核准 {{ s.selected.approvedAt }}</p>
        <p>{{ s.selected.description }}</p>
        <p>{{ s.selected.origin }}</p>
        <p>
          目錄中心 {{ s.selected.lat.toFixed(4) }}°N /
          {{ s.selected.eastLongitude.toFixed(4) }}°E · 尺度
          {{ s.selected.diameterKm }} km
        </p>
        <p class="hint">目錄中心不是入口、峰頂或可抵達目標。</p>
        <a :href="s.selected.url" target="_blank" rel="noopener noreferrer"
          >USGS／IAU 資料 ↗</a
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
