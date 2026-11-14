<script setup>
import { inject } from 'vue';
import { missionKey } from '../useMission';
const m = inject(missionKey), s = m.state;
</script>
<template>
  <div class="planner-controls">
    <h3>停靠順序</h3>
    <p class="hint">先選一個目的地，加入中途停靠；最後選擇終點。系統會逐段搜尋路徑。</p>
    <button id="add-stop" :disabled="!s.destination || s.stopIds.includes(s.destination)" @click="m.addStop">將所選目的地加入中途停靠</button>
    <ol class="planner-stops">
      <li v-for="(id, i) in s.stopIds" :key="id">
        <span>{{ s.targets.find(t => t.id === id)?.name }}</span>
        <button :disabled="i === 0" :aria-label="`上移第 ${i+1} 站`" @click="m.moveStop(i,-1)">↑</button>
        <button :disabled="i === s.stopIds.length-1" :aria-label="`下移第 ${i+1} 站`" @click="m.moveStop(i,1)">↓</button>
        <button :aria-label="`移除第 ${i+1} 站`" @click="m.removeStop(i)">移除</button>
      </li>
    </ol>
    <p class="hint">終點：{{ s.targets.find(t => t.id === s.destination)?.name || '請選擇終點' }}</p>
    <details class="planning-assumptions" open>
      <summary>路線與任務假設</summary>
      <div class="field-pair">
        <label>平地步速（km/h）<input id="walk-speed" v-model.number="s.planner.speedKmh" type="number" min="0.1" max="10" step="0.1" /></label>
        <label>時間預算（小時）<input id="time-budget" v-model.number="s.planner.budgetHours" type="number" min="0.1" step="0.5" /></label>
      </div>
      <div class="field-pair">
        <label>每站停留（分鐘）<input id="stop-minutes" v-model.number="s.planner.stopMinutes" type="number" min="0" step="5" /></label>
        <label>高坡度門檻（°）<input id="high-slope" v-model.number="s.planner.highSlope" type="number" min="0" max="45" /></label>
      </div>
      <label>地形風險權重 {{ s.planner.riskWeight }}<input id="risk-weight" v-model.number="s.planner.riskWeight" type="range" min="0" max="5" step="0.25" /></label>
      <label><input id="round-trip" v-model="s.planner.roundTrip" type="checkbox" /> 終點後規劃返回起點</label>
      <p class="hint">最短路線以三維距離為目標；較低風險路線額外考慮 DEM 坡度與粗糙度。兩者均避開超坡與缺測區。時間採地球步行坡度模型估算，與車輛加速模擬分開；不代表火星 EVA 工程能力。</p>
    </details>
  </div>
</template>
