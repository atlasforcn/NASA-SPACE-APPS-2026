<script setup>
import { inject } from "vue";
import { missionKey } from "../useMission";
import RouteDrawing from "./RouteDrawing.vue";
import ExpeditionPanel from "./ExpeditionPanel.vue";
const m = inject(missionKey),
  s = m.state;
</script>
<template>
  <div>
    <section class="group">
      <p class="eyebrow">A* / TERRAIN COST</p>
      <h2>規劃科學路線</h2>
      <label
        >模擬觀測點（非正式地名）<select
          id="destination"
          v-model="s.destination"
        >
          <option v-for="t in s.targets" :key="t.id" :value="t.id">
            {{ t.name }} · {{ t.unit }}
          </option>
        </select></label
      ><label
        >示範坡度上限（非車輛工程規格）<input
          id="slope-limit"
          v-model="s.slope"
          type="number"
          min="1"
          max="45"
      /></label>
      <div class="button-row">
        <button
          id="plan"
          class="primary"
          :disabled="!s.ready || !s.targets.length"
          @click="m.plan"
        >
          規劃路線</button
        ><button
          id="simulate"
          :disabled="!s.route?.reachable"
          @click="m.toggleMotion"
        >
          {{ s.running ? "Ⅱ 暫停" : "▶ 開始行進" }}
        </button>
      </div>
      <div class="stats">
        <div>
          <small>路線長度</small
          ><strong id="path-distance">{{
            s.route ? m.fmt(s.route.length) : "—"
          }}</strong>
        </div>
        <div>
          <small>加速模擬</small
          ><strong>{{ s.regional ? "10,000" : "220" }} m/s</strong>
        </div>
      </div>
      <p id="route-status" class="hint" role="status">{{ s.routeStatus }}</p>
      <p class="hint">
        以導航估計位置規劃；DEM 無法辨識小於格距的岩石與車輪風險。
      </p>
    </section>
    <RouteDrawing /><ExpeditionPanel />
    <section class="group">
      <h2>可重現情境</h2>
      <div class="button-row">
        <button
          id="scenario-good"
          :disabled="!s.ready"
          @click="m.reset('good')"
        >
          完整觀測</button
        ><button
          id="scenario-poor"
          :disabled="!s.ready"
          @click="m.reset('poor')"
        >
          遮擋觀測
        </button>
      </div>
      <p class="hint">遮擋案例只有 60° 視角且缺失 55%，系統應保留原估計。</p>
      <a :href="m.asset('docs/DEMO.md')">三分鐘講稿</a>
    </section>
  </div>
</template>
