<script setup>
import { inject } from 'vue';
import { missionKey } from '../useMission';
const m = inject(missionKey), s = m.state;
const hours = value => `${value.toFixed(2)} h`;
const rows = [
  ['surface','三維路程',m.fmt],
  ['hours','步行時間',hours],
  ['gain','累積上升',m.fmt],
  ['loss','累積下降',m.fmt],
  ['maxSlope','最大坡度',v => `${v.toFixed(1)}°`],
  ['steep','高坡度路段',m.fmt],
  ['riskScore','平均地形風險',v => v.toFixed(2)],
  ['totalHours','含停留總時間',hours],
];
</script>
<template>
  <section v-if="s.routeOptions" class="route-comparison" aria-label="雙方案路線比較">
    <h3>比較並選擇行進方案</h3>
    <div class="button-row">
      <button v-for="(label,key) in {shortest:'最短路線',safer:'較低風險路線'}" :id="`choose-${key}`" :key="key" :aria-pressed="s.selectedRoute === key" :disabled="!s.routeOptions[key].reachable" @click="m.selectRoute(key)">{{ s.selectedRoute === key ? '● ' : '' }}{{ label }}</button>
    </div>
    <div class="comparison-scroll">
      <table>
        <caption>相同停靠順序及坡度限制；高坡度門檻 {{ s.planner.highSlope }}°</caption>
        <thead><tr><th scope="col">指標</th><th scope="col">最短路線</th><th scope="col">較低風險</th></tr></thead>
        <tbody>
          <tr v-for="[key,label,format] in rows" :key="key"><th scope="row">{{ label }}</th><td v-for="mode in ['shortest','safer']" :key="mode">{{ s.routeOptions[mode].reachable ? format(s.routeOptions[mode][key]) : '無可達路線' }}</td></tr>
          <tr><th scope="row">時間預算</th><td v-for="mode in ['shortest','safer']" :key="mode" :class="s.routeOptions[mode].marginHours >= 0 ? 'mint' : 'red'">{{ !s.routeOptions[mode].reachable ? '—' : s.routeOptions[mode].marginHours >= 0 ? '剩餘 '+hours(s.routeOptions[mode].marginHours) : '超出 '+hours(-s.routeOptions[mode].marginHours) }}</td></tr>
        </tbody>
      </table>
    </div>
    <p class="hint">風險為坡度與粗糙度的模型指標，並非事故機率。兩種目標可能得到相同路徑。</p>
    <template v-if="s.routeOptions[s.selectedRoute].reachable">
      <h3>所選方案行程</h3>
      <ol class="itinerary"><li v-for="(leg,i) in s.routeOptions[s.selectedRoute].legs" :key="i"><strong>{{ leg.name }}</strong><span>{{ m.fmt(leg.surface) }} · 步行 {{ hours(leg.hours) }} · 停留 {{ leg.stopMinutes }} min</span></li></ol>
      <div class="button-row"><button id="fit-plan" @click="m.fitRoute">顯示完整路線</button><button id="export-plan" @click="m.exportPlan">匯出任務 GeoJSON</button></div>
      <p class="hint">切換方案會回到規劃起點；高程剖面可勾選比較兩個方案。</p>
    </template>
  </section>
</template>
