<script setup>
import { inject } from 'vue';
import { missionKey } from '../useMission';

const { limits, checks, loading, area } = inject(missionKey).environment;
</script>

<template>
  <details class="environment" id="environment-readings">
    <summary>歷史測站讀值與上限</summary>
    <p class="hint">用自訂上限比較{{ area }}內的歷史讀值。</p>
    <div class="readings">
      <section v-for="check in checks" :key="check.id" :aria-label="check.label">
        <label :for="'limit-' + check.id">{{ check.label }}上限（{{ check.unit }}）
          <input :id="'limit-' + check.id" v-model.number="limits[check.id]" type="number"
            step="any" :min="check.min" required :aria-invalid="!check.valid" />
        </label>
        <p v-if="!check.valid" class="exceeded">請輸入大於或等於 {{ check.min }} 的數值。</p>
        <p v-if="!loading && !check.stations.length" class="hint">{{ area }}缺少{{ check.label }}測站讀值。</p>
        <p v-for="station in check.stations" :key="station.station">
          <a :href="station.url" target="_blank" rel="noopener noreferrer">{{ station.station }}</a> · {{ station.period }}<br />
          {{ station.reading }} <strong :class="{ exceeded: check.overLimit.includes(station) }">{{ station.value }} {{ check.unit }}</strong>
          <span v-if="check.overLimit.includes(station)" class="exceeded"> · 超過上限 {{ check.limit }} {{ check.unit }}</span>。
        </p>
      </section>
    </div>
  </details>
</template>

<style scoped>
.environment { margin-block: .8rem; }
.readings section { padding-block: .5rem; border-top: 1px solid var(--border); }
.readings label { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; margin: 0; }
.readings input { width: 6rem; margin: 0; }
.readings p { font-size: .8rem; line-height: 1.55; margin-block: .35rem; }
.exceeded { color: #ff9d9d; font-weight: 700; }
</style>
