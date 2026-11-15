<script setup>
import { inject } from "vue";
import { missionKey } from "../useMission";
const m = inject(missionKey),
  s = m.state;
</script>
<template>
  <section class="group">
    <h2>Draw an exploration route</h2>
    <p class="hint">
      Start at the estimated position. Click to add points or drag to draw. Local DEM coverage takes priority, with MOLA used for a coarse estimate beyond it. Red marks missing data or a slope above the limit.
    </p>
    <div class="button-row">
      <button
        id="draw-points"
        :disabled="!s.ready || !s.hasStart"
        :aria-pressed="s.drawMode === 'points'"
        @click="m.beginDrawing('points')"
      >
        Add points</button
      ><button
        id="draw-freehand"
        :disabled="!s.ready || !s.hasStart"
        :aria-pressed="s.drawMode === 'freehand'"
        @click="m.beginDrawing('freehand')"
      >
        Draw freehand
      </button>
    </div>
    <div class="button-row">
      <button
        id="route-finish"
        class="primary"
        :disabled="s.regionLoading || s.points.length < 2"
        @click="m.finishDrawing"
      >
        Finish and check</button
      ><button id="route-undo" :disabled="s.regionLoading || s.points.length < 2" @click="m.undo">
        Undo</button
      ><button id="route-clear" @click="m.clearDrawing">Clear</button>
    </div>
    <div class="button-row">
      <button id="draw-locate" :disabled="!s.hasStart" @click="m.locateDrawing()">Recenter on current position</button>
      <button id="draw-fit" :disabled="s.points.length < 2 && !s.route" @click="m.locateDrawing(true)">Show entire route</button>
    </div>
    <p id="draw-status" class="hint" role="status">{{ s.drawStatus }}</p>
  </section>
</template>
