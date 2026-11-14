<script setup>
import { inject, ref, computed } from 'vue';
import { missionKey } from '../useMission';
const m = inject(missionKey), s = m.state;
const namedQuery = ref(''), namedChoice = ref('');
const namedMatches = computed(() => {
  const query = namedQuery.value.trim().toLowerCase();
  return s.entries.filter(p => query ? `${p.name} ${p.zh || ''}`.toLowerCase().includes(query) : p.featured).slice(0,100);
});
const chosenName = computed(() => s.entries.find(p => p.name === namedChoice.value));
</script>
<template>
  <div class="planner-controls">
    <h3>停靠順序</h3>
    <p class="hint">先選一個目的地，加入中途停靠；最後選擇終點。系統會逐段搜尋路徑。</p>
    <details class="planning-assumptions" open>
      <summary>加入火星已命名奇觀</summary>
      <label>搜尋地名與著陸點<input id="stop-named-search" v-model="namedQuery" type="search" placeholder="Olympus Mons、Jezero、Octavia E. Butler Landing…" @input="namedChoice = ''" /></label>
      <label>選擇奇觀<select id="stop-named-place" v-model="namedChoice" :disabled="s.regionLoading">
        <option value="">{{ namedMatches.length ? '請選擇奇觀' : '找不到地名，請調整搜尋文字' }}</option>
        <option v-for="p in namedMatches" :key="p.name" :value="p.name">{{ p.zh ? `${p.zh} · ${p.name}` : p.name }}</option>
      </select></label>
      <div class="button-row">
        <button id="stop-add-named" :disabled="!s.ready || s.regionLoading || !chosenName" @click="m.addNamedTarget(chosenName, 'stop')">加入停靠順序</button>
        <button id="stop-destination-named" :disabled="!s.ready || s.regionLoading || !chosenName" @click="m.addNamedTarget(chosenName, 'destination')">設為終點</button>
      </div>
      <p class="hint">未搜尋時顯示精選奇觀；搜尋結果最多 100 筆。加入位置採地名目錄中心或歷史著陸座標，跨區會自動擴大地形覆蓋並保留現有任務。</p>
    </details>
    <p class="hint" role="status">{{ s.namedTargetStatus }}</p>
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
      <summary>坡度耗電模型</summary>
      <div class="field-pair">
        <label>每 1% 上坡增耗（%）<input id="uphill-penalty" v-model.number="s.planner.uphillPenalty" type="number" min="0" max="100" /></label>
        <label>每 1% 下坡省電（%）<input id="downhill-saving" v-model.number="s.planner.downhillSaving" type="number" min="0" max="100" /></label>
      </div>
      <p class="hint">預設 10% 上坡每公尺耗電約為平地的 2 倍，10% 下坡約為 0.5 倍；最低保留 25% 行進耗電。逐段讀取 DEM，返程依反方向重算。係數為可調示範假設，尚未依車輛校準。</p>
    </details>
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
      <p class="hint">最短路線以三維距離為目標；較低風險路線額外考慮 DEM 坡度、粗糙度與已啟用材質成本。三者均避開超坡、超粗糙度與缺測區。最低耗電路線以坡度耗電模型搜尋。時間採地球步行坡度模型估算，與車輛加速模擬分開；不代表火星 EVA 工程能力。</p>
    </details>
  </div>
</template>
