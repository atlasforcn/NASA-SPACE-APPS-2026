<script setup>
import { inject } from "vue";
import HorizonInput from "./HorizonInput.vue";
import { missionKey } from "../useMission";
defineProps({ photoPageOpen: Boolean });
defineEmits(['open-page']);
const m = inject(missionKey),
  s = m.state;
</script>
<template>
  <section id="localization-tool" class="localization" aria-label="Skyline positioning" @keydown.esc="m.closeLocalization">
    <div class="localization-toolbar"><h2>Mountain Tracker · Find my position</h2><button id="close-localization" @click="m.closeLocalization">Close and return to planning</button></div>
    <div class="localization-controls">

      <div class="section-title">
        <h3>Scan and candidate positions</h3>
        <span id="localization-status" class="status-pill" role="status">{{
          s.status
        }}</span>
      </div>
      <p class="hint">Compare the skyline with a digital elevation model (DEM) to find candidate positions. If the skyline is indistinct, keep the original estimate and scan again.</p>
      <div class="skyline-links">
        <a id="open-curiosity-demo" class="demo-entry" href="#dingo-gap" aria-haspopup="dialog" @click="$emit('open-page', $event)">Try Curiosity’s Dingo Gap panorama <span aria-hidden="true">→</span></a>
        <a id="open-photo-matcher" class="demo-entry" href="#photo-matcher" aria-haspopup="dialog" @click="$emit('open-page', $event)">Open the photo matcher <span aria-hidden="true">→</span></a>
      </div>
      <label
        >Simulated observation quality<select id="observe-mode" v-model="s.scenario">
          <option value="good">Full 360° observation</option>
          <option value="poor">60° view with 55% obstruction</option>
        </select></label
      >
      <label class="checkbox">
        <input id="continuous-localization" v-model="s.continuousLocalization" type="checkbox" />
        {{ s.regional ? "Update skyline candidates while moving" : "Use the skyline to correct position while moving" }}
      </label>
      <p class="hint">
        After the drive starts, observations update every {{ s.regional ? "4 km" : "250 m" }}. {{ s.regional ? "The rover keeps moving during the search. MOLA candidates are displayed without applying a position correction." : `The rover keeps moving during the search. Reliable matches correct its position. Corrections applied: ${s.localizationCount}.` }}
      </p>
      <div class="button-row">
        <button
          id="scan"
          class="primary"
          :disabled="!s.ready || !s.hasStart || s.searching || s.regionLoading"
          @click="m.scan"
        >
          ◎ Scan and estimate position</button
        ><button id="cancel" :disabled="!s.searching" @click="m.cancel">
          Cancel
        </button>
      </div>
      <button id="drift" :disabled="!s.ready || !s.hasStart" @click="m.drift">
        Simulate drift (650 m east, 520 m south, heading +24°)
      </button>
      <p class="hint" id="search-progress" role="status">{{ s.progress }}</p>
      <p class="position" id="position">{{ m.position.value }}</p>
      <p v-if="s.hasStart" class="hint">
        E {{ s.estimate.x.toFixed(0) }} m · N {{ s.estimate.y.toFixed(0) }} m · Estimated heading {{ s.estimate.heading.toFixed(1) }}°
      </p>
      <label class="checkbox"
        ><input
          id="evaluation"
          :disabled="!s.hasStart"
          v-model="s.truthVisible"
          type="checkbox"
        />Show simulated true position</label
      >
      <div v-if="s.hasStart && s.truthVisible" id="truth-panel">
        <p class="hint">
          Position error {{ m.errorDistance.value }} · Distance traveled {{ m.fmt(s.travelled) }}
        </p>
        <p class="hint">{{ s.evaluation }}</p>
      </div>
    </div>
    <div class="horizon-charts">
      <KeepAlive><HorizonInput v-if="!photoPageOpen" /></KeepAlive>
      <div class="chart-head">
        <span>{{ s.externalHorizon ? "Input skyline and candidate horizon" : "Simulated DEM skyline" }}</span><span>Viewing window / 120°</span>
      </div>
      <div class="button-row">
        <button :disabled="!s.ready || (!s.hasStart && !s.externalHorizon)" @click="m.turnView(-30)">← Turn left 30°</button>
        <button :disabled="!s.ready || (!s.hasStart && !s.externalHorizon)" @click="m.turnView(30)">Turn right 30° →</button>
        <button :disabled="!s.ready || m.viewBearing.value === null || (!s.poi && !s.destination)" @click="m.focusView">Aim at selected marker</button>
      </div>
      <p v-if="!s.externalHorizon" class="hint">Select a map marker to face a known location. Dashed lines and hollow dots mark features that are hidden or outside the view.</p>
      <div class="chart-legend" aria-label="Skyline legend">
        <span><i class="legend-line orange"></i>Orange: {{ s.externalHorizon ? "Hand-drawn or photographed skyline" : "Simulated observation" }}</span>
        <span><i class="legend-line mint"></i>Cyan: candidate horizon</span>
        <span>Dark areas or gaps: no observation</span>
        <span v-if="!s.externalHorizon">The orange map arrow points toward the center of the view.</span>
      </div>
      <canvas
        id="panorama"
        @pointermove="m.hoverHorizon"
        @pointerleave="m.leaveHorizon"
        @pointercancel="m.leaveHorizon"
        :ref="(el) => (m.panorama.value = el)"
        width="700"
        height="260"
        role="img"
        aria-label="Simulated DEM skyline with feature names, distances and visibility"
      ></canvas
      ><canvas
        id="curve"
        :ref="(el) => (m.curve.value = el)"
        width="700"
        height="160"
        role="img"
        aria-label="Observed skyline and candidate horizon"
      ></canvas>
      <p class="hint" id="horizon-hover" role="status">{{ s.horizonHover || "After a scan, move the pointer across the snapshot to locate the corresponding terrain point on the map. It is the highest apparent point in that direction." }}</p>
    </div>
    <div class="localization-results">
      <p id="match-msg" class="hint" role="status">{{ s.message }}</p>
      <ol id="candidates" aria-label="Top three candidate positions">
        <li v-for="(v, i) in s.result?.candidates || []" :key="i">
          <button @click="m.drawCurve(v)">
            <strong>#{{ i + 1 }} · RMS {{ v.score.toFixed(3) }}°</strong
            ><small
              >E {{ v.x.toFixed(0) }} / N {{ v.y.toFixed(0) }} · Heading {{ v.heading.toFixed(1) }}° · Coverage {{ (v.coverage * 100).toFixed(0) }}%</small
            >
          </button>
        </li>
      </ol>
      <details>
        <summary>Positioning from known landmarks</summary>
        <p class="hint">
          Estimate a simulated position from bearings to known peaks.
        </p>
        <button id="bearing-demo" :disabled="!s.ready || !s.hasStart" @click="m.bearingDemo">
          Run landmark positioning demo
        </button>
        <p class="hint">{{ s.bearing }}</p>
      </details>
      <details>
        <summary>Reading the skyline and match results</summary>
        <p v-if="!s.externalHorizon" class="hint">The last scan stays visible while the rover moves. If less than half the skyline is visible, the rover keeps its estimated position until the next scan.</p>
        <p class="notice">
          This proof of concept uses measured terrain. You supply the drawings or photos. Other observations, rover movement and drift are simulated.
        </p>
      </details>
    </div>
  </section>
</template>
