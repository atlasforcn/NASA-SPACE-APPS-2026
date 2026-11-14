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
      假想人員考察：使用你選定的任務起點 → Three Forks → 返回。亮黃色站點為 NASA
      歷史車體位置；路線為情境模擬。
    </p>
    <p v-if="s.regional || s.siteId !== 'jezero'" class="hint">此區未提供 Three Forks 歷史樣本資料；請使用自訂目的地規劃路線。</p>
    <div class="button-row">
      <button
        id="expedition-plan"
        class="primary"
        :disabled="!s.ready || !s.hasStart || s.regional || s.siteId !== 'jezero'"
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
