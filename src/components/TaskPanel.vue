<script setup>
import { inject, ref, watch } from "vue";
import { missionKey } from "../useMission";
import WalkPanel from "./WalkPanel.vue";
import RouteDrawing from "./RouteDrawing.vue";
import ExpeditionPanel from "./ExpeditionPanel.vue";
import NavigationMaterials from './NavigationMaterials.vue';
import PlannerControls from './PlannerControls.vue';
import RouteAlternatives from './RouteAlternatives.vue';
const m = inject(missionKey),
  s = m.state;
const toolsPanel = ref(null);
watch(() => s.station, station => {
  if (station && toolsPanel.value) toolsPanel.value.open = true;
});
</script>
<template>
  <WalkPanel v-if="s.walk" />
  <div v-else>
    <section class="group">
      <h2>規劃探索路線</h2>
      <label>目的地名稱<input id="target-name" v-model="s.targetName" maxlength="80" placeholder="選填" /></label>
      <div class="button-row">
        <button id="add-target" :disabled="!s.ready" :aria-pressed="s.pickingTarget" @click="m.beginTarget">{{ s.pickingTarget ? "取消選點" : "在地圖新增目的地" }}</button>
        <button id="remove-target" :disabled="!s.destination" @click="m.removeTarget">刪除目的地</button>
      </div>
      <label>任務目的地
        <select id="destination" v-model="s.destination">
          <option value="">{{ s.targets.length ? '請選擇終點或中途停靠點' : '請先在地圖新增目的地' }}</option>
          <option v-for="t in s.targets" :key="t.id" :value="t.id">
            {{ t.name }} · {{ t.unit }}
          </option>
        </select>
      </label>
      <div class="button-row">
        <button
          id="plan"
          class="primary"
          :disabled="!s.ready || !s.hasStart || !s.destination || s.regionLoading || s.navigationLoading || !!s.navigationError"
          @click="m.plan"
        >
          建立並評估三條路線</button
        ><button
          id="simulate"
          :disabled="!s.route?.reachable"
          @click="m.toggleMotion"
        >
          {{ s.running ? "Ⅱ 暫停" : "▶ 開始行進" }}
        </button>
      </div>
      <p id="route-status" class="hint" role="status">{{ s.routeStatus }}</p>
      <p v-show="s.navigationLoading || s.navigationError || s.navigation.thermalEnabled" id="navigation-data-status" class="hint" role="status">{{ s.navigationLoading ? '正在載入導航用熱慣量資料…' : s.navigationError || s.navigationStatus }}</p>
      <button v-if="s.navigationError" :disabled="s.navigationLoading" @click="m.retryNavigation">重試導航資料</button>
      <details id="mission-settings" class="task-disclosure">
        <summary>進階路線設定</summary>
        <details id="settings-terrain" class="navigation-safety planning-assumptions">
          <summary>坡度與粗糙度門檻</summary>
          <label>示範坡度上限（°）<input id="slope-limit" v-model="s.slope" type="number" min="1" max="45" /></label>
          <label class="checkbox"><input id="task-navigation-risk" v-model="s.showNavigationRisk" type="checkbox" />在地圖標示避開區域</label>
          <div class="button-row">
            <button type="button" @click="s.layer = 'slope'" :disabled="s.globalView">查看坡度</button>
            <button type="button" @click="s.layer = 'roughness'" :disabled="s.regional || s.globalView">查看粗糙度</button>
            <button type="button" @click="s.tab = 'layers'; s.panelOpen = true">對照其他圖層 ↗</button>
          </div>
          <p class="hint">紅色：坡度超過 {{ s.slope }}°，或粗糙度超過 {{ s.roughnessLimit }}，也包含人工禁行區。黃色：地形資料不足，無法判定能否通行。三種路線都會避開這些位置。取消勾選只隱藏標記，規劃仍會避開。</p>
          <label>粗糙度上限 {{ s.roughnessLimit }}<input id="roughness-limit" v-model.number="s.roughnessLimit" type="range" min="0" max="1" step="0.05" /></label>
          <p class="hint">上限採用示範設定。調低粗糙度上限可排除較粗糙地形；1 表示不額外排除粗糙度。人工禁行區也會阻擋通行；地質與選配熱慣量用於材質成本。遮罩為顯示取樣，路線會沿途細分檢查。</p>
        </details>
        <NavigationMaterials />
        <PlannerControls />
      </details>
      <p v-if="s.directRoute" id="straight-status" class="hint" role="status">{{ s.straightStatus }}</p>
      <RouteAlternatives />
      <div v-if="s.directRoute && s.route && !s.routeOptions" class="route-comparison">
        <h3>同端點路線比較</h3>
        <table>
          <caption>依目前 DEM 與 {{ s.slope }}° 坡度門檻評估</caption>
          <thead><tr><th scope="col">指標</th><th scope="col">理想直線</th><th scope="col">地形繞行</th></tr></thead>
          <tbody>
            <tr><th scope="row">距離</th><td>{{ m.fmt(s.directRoute.length) }}</td><td>{{ m.fmt(s.route.length) }}</td></tr>
            <tr><th scope="row">最大坡度</th><td>{{ s.directRoute.maxSlope.toFixed(1) }}°</td><td>{{ s.route.reachable ? s.route.maxSlope.toFixed(1) + '°' : '—' }}</td></tr>
            <tr><th scope="row">DEM 檢查</th><td :class="s.directRoute.reachable ? 'mint' : 'red'">{{ s.directRoute.reachable ? '通過' : '未通過' }}</td><td :class="s.route.reachable ? 'mint' : 'red'">{{ s.route.reachable ? '通過' : '無可達路線' }}</td></tr>
          </tbody>
        </table>
        <p v-if="s.route.reachable && s.directRoute.length > 0" class="hint">繞行比直線增加 {{ m.fmt(Math.max(0, s.route.length - s.directRoute.length)) }}；通過檢查僅代表符合目前地形模型與門檻。</p>
      </div>
      <div v-if="s.route" class="stats">
        <div>
          <small>路線長度</small
          ><strong id="path-distance">{{
            m.fmt(s.route.length)
          }}</strong>
        </div>
        <div>
          <small>加速模擬</small
          ><strong>{{ s.regional ? "10,000" : "220" }} m/s</strong>
        </div>
      </div>
      <details class="planning-assumptions">
        <summary>規劃假設與資料限制</summary>
        <p class="hint">黃色直線提供起終點的距離與沿線高程對照。三種方案都使用 A* 搜尋。最短方案最小化格網三維距離，較低風險方案加入坡度與粗糙度成本；最低耗電方案逐段考慮上坡增耗與下坡省電。結果受搜尋格網限制，不保證連續地形上的全域最優。</p>
        <p class="hint">{{ s.regional ? '全球 MOLA 為公里尺度高程，遠距結果僅供粗略模擬。' : '區域 DEM 有效處優先；越界或缺測時使用公里尺度 MOLA。MOLA 路段的粗糙度無法估計，只能作粗略規劃。' }}缺測與越界區段不視為可通行；未納入車輪尺度障礙、能源及真實任務時程。</p>
        <p class="hint">建立路線會將車放回所選起點。{{ s.regional ? '行進中更新地平線實驗候選。' : '行進中用地平線校正位置並重新規劃剩餘路線。' }}</p>
        <a href="https://www.momar.si/planner/" target="_blank" rel="noopener noreferrer">路線規劃介面參考：MOMAR ↗</a>
      </details>
    </section>
    <details ref="toolsPanel" id="mission-tools" class="task-disclosure mission-tools">
      <summary>其他任務工具</summary>
      <RouteDrawing />
      <ExpeditionPanel />
      <section class="group">
        <h2>可重現情境</h2>
        <div class="button-row">
          <button
            id="scenario-good"
            :disabled="!s.ready || !s.hasStart"
            @click="m.reset('good')"
          >
            完整觀測</button
          ><button
            id="scenario-poor"
            :disabled="!s.ready || !s.hasStart"
            @click="m.reset('poor')"
          >
            遮擋觀測
          </button>
        </div>
        <p class="hint">遮擋案例只有 60° 視角且缺失 55%，系統應保留原估計。</p>
      </section>
    </details>
  </div>
</template>

<style scoped>
.task-disclosure {
  margin-block: 1rem;
  border-block: 1px solid var(--border);
}
.task-disclosure > summary {
  padding-block: .8rem;
  color: var(--mint);
  font-size: .88rem;
  font-weight: 650;
  cursor: pointer;
}
.task-disclosure :deep(.planning-assumptions) { margin-block: .4rem; }
.mission-tools { margin: 0 22px; border-top: none; }
.mission-tools :deep(.group) { padding-inline: 0; }
</style>
