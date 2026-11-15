<script setup>
import {computed, inject} from 'vue';
import {missionKey} from '../useMission';
import ScienceContext from './ScienceContext.vue';
const m = inject(missionKey), s = m.state;
const w = computed(() => s.walk);
const station = computed(() => w.value.station);
const here = computed(() => w.value.stations.find(t => t.id === w.value.at));
const minutes = h => Math.round(h*60);
function chooseB(include) {
  w.value.includeB = include;
  w.value.stations[1].outcome = include ? '待觀察' : '略過';
}
</script>
<template>
  <article class="walk-panel">
    <h2>Jezero 科學任務</h2>
    <p role="status">{{ w.at === 'home' ? '已返抵基地' : here ? '目前位於'+here.name : '目前位於任務基地' }}</p>
    <div class="button-row"><button v-for="t in w.stations" :key="t.id" :aria-pressed="station.id === t.id" @click="m.focusWalkStation(t)">{{ t.name }} · {{ t.symbol }}</button></div>
    <h3>{{ station.question }}</h3>
    <p>{{ station.observation }}</p>
    <p>選站依據：{{ station.unit }}（{{ station.symbol }}），USGS 多邊形 {{ station.sourceObjectId }}。<a v-if="station.source" :href="station.source" target="_blank" rel="noopener noreferrer">SIM 3464</a><span v-else>來源未查證</span></p>
    <label>預計工作分鐘（情境假設）<input v-model.number="station.stopMinutes" type="number" min="0" step="1"></label>
    <div class="button-row"><button @click="s.layer = 'thermal'">比較 TES 格網</button><button @click="s.layer = 'geology'">查看地質單元</button></div>
    <ScienceContext />
    <label>步行速度（km/h）<input v-model.number="s.planner.speedKmh" type="number" min="0.1" max="10" step="0.1"></label>
    <label>任務預算（小時）<input v-model.number="s.planner.budgetHours" type="number" min="0.01" step="0.1"></label>
    <template v-if="w.at === 'base' && w.comparison">
      <h3>步行與返程</h3>
      <p v-for="(routes,id) in w.comparison" :key="id">{{ id === 'a' ? '基地 → A → 基地' : '基地 → A → B → 基地' }} · {{ routes[s.selectedRoute].reachable ? m.fmt(routes[s.selectedRoute].length)+'／'+minutes(routes[s.selectedRoute].totalHours)+' 分鐘，'+(routes[s.selectedRoute].marginHours >= 0 ? '可完成，餘裕 ' : '超時 ')+minutes(Math.abs(routes[s.selectedRoute].marginHours))+' 分鐘' : '無可達路線' }}</p>
    </template>
    <div v-if="w.at === 'base' || w.at === 's1'" class="button-row"><button :aria-pressed="w.includeB" @click="chooseB(true)">加訪 B</button><button :aria-pressed="!w.includeB" @click="chooseB(false)">略過 B 返程</button></div>
    <template v-if="here">
      <label>{{ here.name }} 現場紀錄<select v-model="here.outcome"><option>待觀察</option><option>已觀察</option><option>略過</option></select></label>
      <label>觀察筆記<textarea v-model="here.note" /></label>
      <button :disabled="s.searching" @click="m.scan()">山頂相儀掃描／重掃</button>
      <p v-for="(scan,i) in here.scans" :key="i">{{ scan.source }}{{ scan.scenario === 'poor' ? '（60°、55% 遮擋）' : scan.scenario === 'good' ? '（360°）' : '' }} · 有效 {{ scan.coverageDegrees.toFixed(0) }}° · {{ scan.reason }} · {{ scan.updated ? '已更新位置' : '保留里程推估' }}</p>
      <button @click="m.planWalkFromStation">從當下估計重新規劃</button>
    </template>
    <p v-if="s.route?.reachable && here">本路線含返程 · {{ s.route.marginHours >= 0 ? '返程餘裕' : '超時' }} {{ minutes(Math.abs(s.route.marginHours)) }} 分鐘</p>
    <button v-if="w.at !== 'home'" class="primary" :disabled="!s.route?.reachable || s.searching" @click="m.advanceWalk">示範快轉到{{ s.route?.legs?.[0]?.name || '下一站' }}</button>
    <p v-else>總計 {{ minutes(w.elapsed) }} 分鐘 · {{ w.elapsed > s.planner.budgetHours ? '超時' : '時間內完成' }}</p>
    <button v-if="s.route?.reachable" @click="m.exportPlan">匯出行程與站點紀錄</button>
  </article>
</template>
<style scoped>
.walk-panel { border-inline-start: 3px solid #81d9cc; padding-inline-start: 1rem; margin-block-end: 2rem; }
.walk-panel h3 { margin-block: 1rem .4rem; }
.walk-panel p { overflow-wrap: anywhere; }
.walk-panel textarea { width: 100%; min-height: 4em; }
</style>
