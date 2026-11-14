<script setup>
import { inject } from "vue";
import { missionKey } from "../useMission";
const m = inject(missionKey),
  s = m.state;
</script>
<template>
  <section class="group">
    <p class="eyebrow">MARSOPS / THREE FORKS</p>
    <h2>重訪樣本存放區</h2>
    <p class="hint">
      假想人員考察：起點 → CP-01 → Three Forks → 返回。金色站點為 NASA
      歷史車體位置；路線與確認點為情境模擬。
    </p>
    <div class="button-row">
      <button
        id="expedition-plan"
        class="primary"
        :disabled="!s.ready"
        @click="m.planExpedition"
      >
        建立往返路線</button
      ><button
        id="malay-card"
        :disabled="!s.stations.length"
        @click="
          m.showStation(
            s.stations.find((f) => f.properties['Sample Name'] === 'Malay'),
          )
        "
      >
        Malay NASA 紀錄
      </button>
    </div>
    <p id="expedition-status" class="hint" role="status">
      {{ s.expeditionStatus }}
    </p>
    <label
      >路段剖面<select id="expedition-leg" v-model="s.profileIndex">
        <option v-for="(leg, i) in s.expedition" :key="i" :value="i">
          {{ leg.name }}{{ leg.reachable ? "" : "（不可達）" }}
        </option>
      </select></label
    ><canvas
      id="route-profile"
      :ref="(el) => (m.profileCanvas.value = el)"
      width="360"
      height="150"
      role="img"
      aria-label="數值 DEM 路線高程剖面"
    ></canvas>
    <p class="hint">{{ s.profileInfo }}</p>
    <div class="button-row">
      <button
        id="checkpoint-clear"
        :disabled="!s.ready"
        @click="m.enterCheckpoint('good')"
      >
        CP-01 完整觀測</button
      ><button
        id="checkpoint-poor"
        :disabled="!s.ready"
        @click="m.enterCheckpoint('poor')"
      >
        CP-01 遮擋觀測
      </button>
    </div>
    <p id="checkpoint-decision" class="hint" role="status">
      {{ s.checkpointMessage }}
    </p>
    <article v-if="s.station" class="detail-card">
      <h3>{{ s.station.properties.name }}</h3>
      <p>NASA PDS 歷史紀錄 · 非人員位置／非樣本管端點</p>
      <p>
        {{ s.station.properties["Sample Designation"] }} · Sol
        {{ s.station.properties["Dropoff Sol"] }}<br />Site
        {{ s.station.properties.Site }} / Drive {{ s.station.properties.Drive
        }}<br />LMST {{ s.station.properties.LMST }}
      </p>
      <p>
        {{ s.station.geometry.coordinates[1] }}°N /
        {{ s.station.geometry.coordinates[0] }}°E
      </p>
      <p class="hint">火星行星中心緯度／東經；GeoJSON 順序為 [經度, 緯度]。</p>
      <a
        :href="s.station.properties.sources.locations"
        target="_blank"
        rel="noopener noreferrer"
        >NASA 位置 CSV（v{{ s.station.properties.versions.locations }}）</a
      ><br /><a
        :href="s.station.properties.sources.events"
        target="_blank"
        rel="noopener noreferrer"
        >NASA 投放事件 CSV（v{{ s.station.properties.versions.events }}）</a
      ><br /><a :href="m.asset('data/pds/sample_tube_locations.csv')"
        >離線位置原表</a
      >
      ·
      <a :href="m.asset('data/pds/sample_drop_timestamps.csv')">離線事件原表</a
      ><br /><a :href="m.asset('data/pds/sample_tube_locations.xml')"
        >位置欄位定義</a
      >
      ·
      <a :href="m.asset('data/pds/sample_drop_timestamps.xml')">事件欄位定義</a
      ><br /><a
        href="https://pds-geosciences.wustl.edu/m2020/urn-nasa-pds-mars2020_sample_depot_three_forks/miscellaneous/depot/depot_mosaics.csv"
        target="_blank"
        rel="noopener noreferrer"
        >歷史影像索引 ↗</a
      >
    </article>
    <p class="hint">CTX 原生 20 m、衍生約 40 m DEM 無法判斷岩塊與腳下路況。</p>
  </section>
</template>
