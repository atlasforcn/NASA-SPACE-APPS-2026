<script setup>
import { inject } from "vue";
import { missionKey } from "../useMission";
const m = inject(missionKey), s = m.state;
</script>
<template>
  <section class="group">
    <h2>路線高程剖面</h2>
    <label
      >路段剖面<select id="expedition-leg" v-model="s.profileIndex">
        <option v-if="s.route" :value="-1">目前路線</option>
        <option v-if="!s.route && (s.regional || !s.expedition.length)" :value="s.profileIndex" disabled>尚未建立路線</option>
        <option v-for="(leg, i) in (s.regional ? [] : s.expedition)" :key="i" :value="i">
          {{ leg.name }}{{ leg.reachable ? "" : "（不可達）" }}
        </option>
      </select></label
    >
    <label><input type="checkbox" v-model="s.compareProfiles" /> 比較不同路線（相同距離與高程尺度）</label>
    <canvas
      id="route-profile"
      @pointermove="m.hoverProfile"
      @pointerleave="m.leaveProfile"
      :ref="(el) => (m.profileCanvas.value = el)"
      width="360"
      height="150"
      role="img"
      aria-label="數值 DEM 路線高程剖面"
    ></canvas>
    <p v-for="item in s.profileLegend" :key="item.name" class="hint" :style="{ color: item.color }">{{ item.name }} · {{ item.length }}</p>
    <p class="hint" role="status">{{ s.profileHover || "在剖面上移動滑鼠，查看距離、高程與地圖位置。" }}</p>
    <p class="hint">{{ s.profileInfo }}</p>
    <p class="hint">{{ s.regional ? "MOLA 公里級地形；格距隨覆蓋範圍調整。" : s.siteId === 'gale' ? "Gale 原生格距 1 m，本站 DEM 取樣 20 m；並非全域 1 m 精度。" : "CTX 原生約 20 m、本站取樣 40 m DEM。" }} 無法判斷岩塊與腳下路況。</p>
  </section>
</template>
