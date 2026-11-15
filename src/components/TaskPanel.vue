<script setup>
import NavigationRiskKey from "./NavigationRiskKey.vue";
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
defineEmits(['open-route-challenge']);
const toolsPanel = ref(null);
watch(() => s.station, station => {
  if (station && toolsPanel.value) toolsPanel.value.open = true;
});
</script>
<template>
  <WalkPanel v-if="s.walk" @open-route-challenge="$emit('open-route-challenge', $event)" />
  <div v-else>
    <section class="group">
      <h2>Plan an exploration route</h2>
      <label>Destination name<input id="target-name" v-model="s.targetName" maxlength="80" placeholder="Optional" /></label>
      <div class="button-row">
        <button id="add-target" :disabled="!s.ready" :aria-pressed="s.pickingTarget" @click="m.beginTarget">{{ s.pickingTarget ? "Cancel selection" : "Add destination on the map" }}</button>
        <button id="remove-target" :disabled="!s.destination" @click="m.removeTarget">Remove destination</button>
      </div>
      <label>Mission destination
        <select id="destination" v-model="s.destination">
          <option value="">{{ s.targets.length ? 'Select an endpoint or stop' : 'Add a destination on the map first' }}</option>
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
          Build and evaluate three routes</button
        ><button
          id="simulate"
          :disabled="!s.route?.reachable"
          @click="m.toggleMotion"
        >
          {{ s.running ? "Ⅱ Pause" : "▶ Start traverse" }}
        </button>
      </div>
      <p id="route-status" class="hint" role="status">{{ s.routeStatus }}</p>
      <button v-if="m.challengeRoute.value" id="free-route-challenge" class="route-challenge-entry" type="button" aria-haspopup="dialog" @click="$emit('open-route-challenge', $event)">
        Find my position with the Mountain Tracker <span aria-hidden="true">↗</span>
      </button>
      <p v-else-if="!s.route" class="hint">After building a route, open route localization from the map’s elevation profile.</p>
      <p v-show="s.navigationLoading || s.navigationError || s.navigation.thermalEnabled" id="navigation-data-status" class="hint" role="status">{{ s.navigationLoading ? 'Loading thermal inertia data for navigation…' : s.navigationError || s.navigationStatus }}</p>
      <button v-if="s.navigationError" :disabled="s.navigationLoading" @click="m.retryNavigation">Retry navigation data</button>
      <details id="mission-settings" class="task-disclosure">
        <summary>Advanced route settings</summary>
        <details id="settings-terrain" class="navigation-safety planning-assumptions">
          <summary>Slope and roughness limits</summary>
          <label>Demo slope limit (°)<input id="slope-limit" v-model="s.slope" type="number" min="1" max="45" /></label>
          <label class="checkbox"><input id="task-navigation-risk" v-model="s.showNavigationRisk" type="checkbox" />Show avoidance areas on the map</label>
          <div class="button-row">
            <button type="button" @click="s.layer = 'slope'" :disabled="s.globalView">Show slope</button>
            <button type="button" @click="s.layer = 'roughness'" :disabled="s.regional || s.globalView">Show roughness</button>
            <button type="button" @click="s.tab = 'layers'; s.panelOpen = true">Compare other layers ↗</button>
          </div>
          <div class="navigation-risk-key"><NavigationRiskKey /></div>
          <p class="hint">Terrain exceeds the limits above a slope of {{ s.slope }}° or roughness of {{ s.roughnessLimit }}. All three routes avoid these areas even when the markers are hidden.</p>
          <label>Roughness limit {{ s.roughnessLimit }}<input id="roughness-limit" v-model.number="s.roughnessLimit" type="range" min="0" max="1" step="0.05" /></label>
          <p class="hint">Lower limits exclude more segments. At 1, roughness alone excludes none.</p>
        </details>
        <NavigationMaterials />
        <PlannerControls />
      </details>
      <p v-if="s.directRoute" id="straight-status" class="hint" role="status">
        {{ s.straightStatus }}
        <template v-if="!s.directRoute.reachable">
          <template v-if="s.route?.reachable">Red segments failed the assessment. Follow the {{ s.route.molaDistance ? 'suggested route' : 'cyan route' }} to detour.</template>
          <template v-else>The direct route is blocked. Adjust the destination or stops.</template>
        </template>
      </p>
      <RouteAlternatives />
      <div v-if="s.directRoute && s.route && !s.routeOptions" class="route-comparison">
        <h3>Compare routes between the same endpoints</h3>
        <table>
          <caption>Assessment uses the current DEM and a {{ s.slope }}° slope limit</caption>
          <thead><tr><th scope="col">Metric</th><th scope="col">Direct line</th><th scope="col">Terrain detour</th></tr></thead>
          <tbody>
            <tr><th scope="row">Distance</th><td>{{ m.fmt(s.directRoute.length) }}</td><td>{{ m.fmt(s.route.length) }}</td></tr>
            <tr><th scope="row">Maximum slope</th><td>{{ s.directRoute.maxSlope.toFixed(1) }}°</td><td>{{ s.route.reachable ? s.route.maxSlope.toFixed(1) + '°' : '—' }}</td></tr>
            <tr><th scope="row">DEM assessment</th><td :class="s.directRoute.reachable ? 'mint' : 'red'">{{ s.directRoute.reachable ? 'Passed' : 'Failed' }}</td><td :class="s.route.reachable ? 'mint' : 'red'">{{ s.route.reachable ? 'Passed' : 'No reachable route' }}</td></tr>
          </tbody>
        </table>
        <p v-if="s.route.reachable && s.directRoute.length > 0" class="hint">Extra distance on the detour: {{ m.fmt(Math.max(0, s.route.length - s.directRoute.length)) }}. A pass applies to the current terrain model and limits.</p>
      </div>
      <div v-if="s.route" class="stats">
        <div>
          <small>Route length</small
          ><strong id="path-distance">{{
            m.fmt(s.route.length)
          }}</strong>
        </div>
        <div>
          <small>Simulation speed</small
          ><strong>{{ s.regional ? "10,000" : "220" }} m/s</strong>
        </div>
      </div>
      <details class="planning-assumptions">
        <summary>Planning assumptions and data limits</summary>
        <p class="hint">All three routes use A*. The shortest route minimizes distance, the lower-risk route accounts for slope, relief and surface material, and the lowest-energy route estimates power use along the way.</p>
        <p class="hint">{{ s.regional ? 'Global MOLA elevations support coarse, kilometer-scale simulations of long routes.' : 'Local DEM data take priority. Outside their coverage or where data are missing, the planner uses kilometer-scale MOLA elevations. MOLA segments support coarse planning and lack roughness estimates.' }} Routes avoid missing data and areas outside the grid. Wheel-scale obstacles fall below the grid resolution. Energy estimates cover driving only. Duration uses the simulated mission settings.</p>
        <p class="hint">Building a route returns the rover to the selected start. {{ s.regional ? 'Update candidate positions from the skyline while driving.' : 'Use the skyline to correct the position and replan the remaining route while driving.' }}</p>
        <a href="https://www.momar.si/planner/" target="_blank" rel="noopener noreferrer">Route planner interface reference: MOMAR ↗</a>
      </details>
    </section>
    <details ref="toolsPanel" id="mission-tools" class="task-disclosure mission-tools">
      <summary>More mission tools</summary>
      <RouteDrawing />
      <ExpeditionPanel />
      <section class="group">
        <h2>Repeatable scenarios</h2>
        <div class="button-row">
          <button
            id="scenario-good"
            :disabled="!s.ready || !s.hasStart"
            @click="m.reset('good')"
          >
            Full observation</button
          ><button
            id="scenario-poor"
            :disabled="!s.ready || !s.hasStart"
            @click="m.reset('poor')"
          >
            Obstructed observation
          </button>
        </div>
        <p class="hint">This scenario has a 60° field of view with 55% missing. The system should retain the original position estimate.</p>
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
