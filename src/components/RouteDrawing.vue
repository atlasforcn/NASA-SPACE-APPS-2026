<script setup>
import { inject } from "vue";
import { missionKey } from "../useMission";
const m = inject(missionKey),
  s = m.state;
</script>
<template>
  <section class="group">
    <p class="eyebrow">CUSTOM ROUTE</p>
    <h2>繪製自己的探索路線</h2>
    <p class="hint">
      從導航估計位置開始，逐點設定或拖曳手繪。局部 DEM 有效處優先，越界或缺測處使用 MOLA；MOLA 區段僅供粗略規劃。紅色為缺測或超坡。
    </p>
    <div class="button-row">
      <button
        id="draw-points"
        :disabled="!s.ready || !s.hasStart"
        :aria-pressed="s.drawMode === 'points'"
        @click="m.beginDrawing('points')"
      >
        逐點繪製</button
      ><button
        id="draw-freehand"
        :disabled="!s.ready || !s.hasStart"
        :aria-pressed="s.drawMode === 'freehand'"
        @click="m.beginDrawing('freehand')"
      >
        手繪路線
      </button>
    </div>
    <div class="button-row">
      <button
        id="route-finish"
        class="primary"
        :disabled="s.regionLoading || s.points.length < 2"
        @click="m.finishDrawing"
      >
        完成並檢查</button
      ><button id="route-undo" :disabled="s.regionLoading || s.points.length < 2" @click="m.undo">
        撤銷</button
      ><button id="route-clear" @click="m.clearDrawing">清除</button>
    </div>
    <div class="button-row">
      <button id="draw-locate" :disabled="!s.hasStart" @click="m.locateDrawing()">找回目前位置</button>
      <button id="draw-fit" :disabled="s.points.length < 2 && !s.route" @click="m.locateDrawing(true)">顯示完整路線</button>
    </div>
    <p id="draw-status" class="hint" role="status">{{ s.drawStatus }}</p>
  </section>
</template>
