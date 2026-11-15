<script setup>
import { inject } from "vue";
import { missionKey } from "../useMission";
const m = inject(missionKey),
  s = m.state;
</script>
<template>
  <section class="group">
    <p class="eyebrow">Three Forks</p>
    <h2>Revisit the sample depot</h2>
    <p class="hint">
      Plan a simulated round trip from your starting point to Three Forks. Yellow markers show where Perseverance stood when it dropped each sample.
    </p>
    <p v-if="s.regional || s.siteId !== 'jezero'" class="hint">Three Forks sample records are available in Jezero. Choose a custom destination for this region.</p>
    <div class="button-row">
      <button
        id="expedition-plan"
        class="primary"
        :disabled="!s.ready || !s.hasStart || s.regional || s.siteId !== 'jezero'"
        @click="m.planExpedition"
      >
        Build round trip</button
      ><button
        id="malay-card"
        :disabled="!s.stations.length"
        @click="
          m.showStation(
            s.stations.find((f) => f.properties['Sample Name'] === 'Malay'),
          )
        "
      >
        NASA record for Malay
      </button>
    </div>
    <p id="expedition-status" class="hint" role="status">
      {{ s.expeditionStatus }}
    </p>
    <article v-if="s.station" class="detail-card">
      <h3>{{ s.station.properties.name }}</h3>
      <p>NASA PDS records the rover position at the time of each sample drop.</p>
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
      <p class="hint">Planetocentric latitude and east longitude. GeoJSON stores longitude first.</p>
      <a
        :href="s.station.properties.sources.locations"
        target="_blank"
        rel="noopener noreferrer"
        >NASA positions CSV (v{{ s.station.properties.versions.locations }})</a
      ><br /><a
        :href="s.station.properties.sources.events"
        target="_blank"
        rel="noopener noreferrer"
        >NASA drop events CSV (v{{ s.station.properties.versions.events }})</a
      ><br /><a :href="m.asset('data/pds/sample_tube_locations.csv')"
        >Offline position table</a
      >
      ·
      <a :href="m.asset('data/pds/sample_drop_timestamps.csv')">Offline event table</a
      ><br /><a :href="m.asset('data/pds/sample_tube_locations.xml')"
        >Position field definitions</a
      >
      ·
      <a :href="m.asset('data/pds/sample_drop_timestamps.xml')">Event field definitions</a
      ><br /><a
        href="https://pds-geosciences.wustl.edu/m2020/urn-nasa-pds-mars2020_sample_depot_three_forks/miscellaneous/depot/depot_mosaics.csv"
        target="_blank"
        rel="noopener noreferrer"
        >Historical image index ↗</a
      >
    </article>
    <p class="hint">The native CTX grid is 20 m and the demo samples it at about 40 m. Rocks underfoot are below that scale.</p>
  </section>
</template>
