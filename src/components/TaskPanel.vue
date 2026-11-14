<script setup>
import { inject } from "vue";
import { missionKey } from "../useMission";
import RouteProfile from "./RouteProfile.vue";
import RouteDrawing from "./RouteDrawing.vue";
import ExpeditionPanel from "./ExpeditionPanel.vue";
const m = inject(missionKey),
  s = m.state;
</script>
<template>
  <div>
    <section class="group">
      <p class="eyebrow">A* / TERRAIN COST</p>
      <h2>先選端點，再決定怎麼走</h2>
      <p class="hint">① 選起點與終點 → ② 評估直線與繞行路線 → ③ 用地平線找回位置並行進。兩條路線都從所選起點開始。</p>
      <button id="pick-start" :disabled="!s.ready" :aria-pressed="s.pickingStart" @click="m.beginStart">{{ s.pickingStart ? '取消選起點' : '在地圖選起點' }}</button>
        <label>觀測點名稱<input id="target-name" v-model="s.targetName" maxlength="80" placeholder="輸入自訂名稱（可留空）" /></label>
        <div class="button-row">
          <button id="add-target" :disabled="!s.ready" @click="m.beginTarget">{{ s.pickingTarget ? "取消選點" : "在地圖新增觀測點" }}</button>
          <button id="remove-target" :disabled="!s.destination" @click="m.removeTarget">刪除所選觀測點</button>
        </div>
        <p class="hint" role="status">{{ s.pickingTarget ? "點選地圖設定位置；遠處會自動擴大 MOLA 覆蓋範圍。" : "自行命名並點選地圖新增觀測點，再選擇目的地規劃路線。" }}</p>
      <label
        >自訂觀測點<select
          id="destination"
          v-model="s.destination"
        >
          <option v-if="!s.targets.length" value="">請先在地圖新增觀測點</option>
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
          建立並評估兩條路線</button
        ><button
          id="simulate"
          :disabled="!s.route?.reachable"
          @click="m.toggleMotion"
        >
          {{ s.running ? "Ⅱ 暫停" : "▶ 開始行進" }}
        </button>
      </div>
      <p class="hint">金色虛線：理想直線 · 紅色：不可通行段 · 青色：建議路線 · 橘色：定位行進軌跡</p>
      <p id="straight-status" class="hint" role="status">{{ s.straightStatus }}</p>
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
        建立路線將車放回所選起點；{{ s.regional ? "行進中更新地平線實驗候選，不套用位置校正。" : "行進中用地平線校正位置並重新規劃剩餘路線。" }}DEM 無法辨識小於格距的岩石與車輪風險。
      </p>
    </section>
    <RouteProfile /><RouteDrawing /><ExpeditionPanel />
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
    </section>
  </div>
</template>
