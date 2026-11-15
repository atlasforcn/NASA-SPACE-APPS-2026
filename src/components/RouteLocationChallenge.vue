<script setup>
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import Skyline from '../../skyline.mjs';
import { missionKey } from '../useMission';

const emit = defineEmits(['close']);
const mission = inject(missionKey);
const dialog = ref(null);
const resultPanel = ref(null);
const session = shallowRef(null);
const round = shallowRef(null);
const guess = shallowRef(null);
const preview = shallowRef(null);
const answer = shallowRef(null);
const system = shallowRef(null);
const searching = ref(false);
const error = ref('');
const previewError = ref('');
const direction = ref('all');
let searchController;

const views = {
  all: { label: '360° panorama', start: 0, end: 360, ticks: ['N', 'E', 'S', 'W', 'N'] },
  north: { label: 'Facing north', start: -60, end: 60, ticks: ['Northwest', 'N', 'Northeast'] },
  east: { label: 'Facing east', start: 30, end: 150, ticks: ['Northeast', 'E', 'Southeast'] },
  south: { label: 'Facing south', start: 120, end: 240, ticks: ['Southeast', 'S', 'Southwest'] },
  west: { label: 'Facing west', start: 210, end: 330, ticks: ['Southwest', 'W', 'Northwest'] },
};
const view = computed(() => views[direction.value]);
const statusLabels = {
  good: 'Candidate meets positioning thresholds',
  uncertain: 'Position uncertain',
  lost: 'No reliable fix',
  error: 'Search incomplete',
};
const graph = computed(() => {
  const observation = round.value.observation;
  const {start, end} = view.value;
  function visibleSamples(profile) {
    if (!profile) return [];
    return Skyline.viewport(profile, (start + end) / 2, end - start).map(sample =>
      sample.valid ? {x: (sample.angle - start) / (end - start) * 600, value: sample.elevation} : null);
  }
  const measured = visibleSamples(observation);
  const comparison = visibleSamples(preview.value);
  const values = [...measured, ...comparison].filter(Boolean).map(p => p.value);
  const low = Math.floor(Math.min(0, ...values));
  const high = Math.ceil(Math.max(low + 2, 0, ...values));
  const y = elevation => 172 - (elevation - low) / (high - low) * 146;
  function paths(samples) {
    const segments = [];
    let points = [];
    for (const sample of samples) {
      if (sample) points.push([sample.x, y(sample.value)]);
      else if (points.length) { segments.push(points); points = []; }
    }
    if (points.length) segments.push(points);
    return segments.map(segment => {
      const line = 'M' + segment.map(([x, row]) => x.toFixed(2) + ',' + row.toFixed(2)).join(' L');
      return { line, area: line + ' V190 H' + segment[0][0].toFixed(2) + ' Z' };
    });
  }
  return { measured: paths(measured), comparison: paths(comparison), low, high };
});
const bounds = computed(() => session.value.bounds);
const mapWidth = 480;
const mapHeight = 300;
function project(p) {
  const b = bounds.value;
  return { x: (p.x - b.minX) / (b.maxX - b.minX) * mapWidth,
    y: (b.maxY - p.y) / (b.maxY - b.minY) * mapHeight };
}
const routePoints = computed(() => session.value.path.map(project));
const routeLine = computed(() => routePoints.value.map(p => p.x.toFixed(2) + ',' + p.y.toFixed(2)).join(' '));
const start = computed(() => routePoints.value[0]);
const end = computed(() => routePoints.value[routePoints.value.length - 1]);
const loop = computed(() => {
  const path = session.value.path;
  return Math.hypot(path[0].x - path.at(-1).x, path[0].y - path.at(-1).y) < 1;
});
const endpointLabels = computed(() => {
  function marker(point, label, below = false) {
    const width = Math.max(20, Array.from(label).length * 13 + 8);
    const x = Math.max(width / 2 + 1, Math.min(mapWidth - width / 2 - 1, point.x));
    const y = Math.max(10, Math.min(mapHeight - 10, point.y + (below ? 16 : -16)));
    return { point, label, width, x, y };
  }
  if (loop.value) return [marker(start.value, 'Start/end')];
  return [marker(start.value, session.value.startLabel), marker(end.value, session.value.endLabel, true)];
});
const mapScale = computed(() => {
  const width = bounds.value.maxX - bounds.value.minX;
  const target = width / 4, magnitude = 10 ** Math.floor(Math.log10(target));
  const meters = [5, 2, 1].find(v => v * magnitude <= target) * magnitude;
  return { width: meters / width * 100 + '%', label: distance(meters) };
});
const distance = meters => meters >= 1000
  ? (meters / 1000).toLocaleString('en-US', {maximumFractionDigits: 2}) + ' km'
  : Math.round(meters).toLocaleString('en-US') + ' m';
const mapMarks = computed(() => [
  { id: 'guess', label: 'Your marker', point: guess.value },
  { id: 'truth', label: 'Simulated observation point', point: answer.value?.truth },
  { id: 'system', label: 'System candidate', point: system.value?.candidate },
].filter(mark => mark.point).map(mark => ({ ...mark, screen: project(mark.point) })));

function newRound() {
  searchController?.abort();
  round.value = null;
  guess.value = preview.value = answer.value = system.value = null;
  searching.value = false;
  error.value = previewError.value = '';
  direction.value = 'all';
  try {
    if (!session.value) session.value = mission.createRouteChallenge();
    round.value = session.value.newRound();
  } catch (e) {
    session.value = null;
    error.value = e.message || 'This route has no usable skyline observations.';
  }
}
function choose(x,y) {
  if (!round.value || answer.value) return;
  const b = bounds.value;
  const point = {x: Math.max(b.minX, Math.min(b.maxX, x)), y: Math.max(b.minY, Math.min(b.maxY, y))};
  guess.value = point;
  previewError.value = '';
  try {
    preview.value = round.value.preview(point);
    if (!preview.value?.valid.some(Boolean)) previewError.value = 'Terrain coverage is insufficient at this point. Choose another location.';
  } catch {
    preview.value = null;
    previewError.value = 'No skyline preview is available here. Choose another point.';
  }
}
function pick(event) {
  const box = event.currentTarget.getBoundingClientRect(), b = bounds.value;
  choose(b.minX + (event.clientX-box.left)/box.width*(b.maxX-b.minX),
    b.maxY - (event.clientY-box.top)/box.height*(b.maxY-b.minY));
}
function moveKey(event) {
  if (answer.value) return;
  const vectors = { ArrowUp:[0,1], ArrowDown:[0,-1], ArrowLeft:[-1,0], ArrowRight:[1,0] };
  if (event.key === 'Enter' && guess.value) { event.preventDefault(); submit(); return; }
  const vector = vectors[event.key];
  if (!vector) return;
  event.preventDefault();
  const b = bounds.value, p = guess.value || {x:(b.minX+b.maxX)/2,y:(b.minY+b.maxY)/2};
  const step = (b.maxX - b.minX) * (event.shiftKey ? .005 : .025);
  choose(p.x + vector[0]*step, p.y + vector[1]*step);
}
async function submit() {
  if (!round.value || !guess.value || answer.value) return;
  const current = round.value;
  try {
    const revealed = current.reveal(guess.value);
    if (!Number.isFinite(revealed?.guessErrorMeters) || !Number.isFinite(revealed.truth?.x) || !Number.isFinite(revealed.truth?.y))
      throw new Error('Coordinates are missing. Sample again.');
    answer.value = revealed;
  } catch (cause) {
    error.value = cause.message || 'Unable to check this position. Sample again.';
    session.value = null;
    return;
  }
  searching.value = true;
  const controller = new AbortController();
  searchController = controller;
  await nextTick();
  resultPanel.value?.focus({ preventScroll: true });
  if (window.matchMedia('(max-width: 720px)').matches) resultPanel.value?.scrollIntoView({block:'nearest'});
  if (controller.signal.aborted) return;
  try {
    const result = await current.locate(controller.signal);
    if (!controller.signal.aborted) system.value = result;
  } catch {
    if (!controller.signal.aborted) system.value = { status: 'error', reason: 'Terrain matching failed' };
  } finally {
    if (!controller.signal.aborted) searching.value = false;
  }
}
function again() {
  newRound();
  nextTick(() => dialog.value?.querySelector('h2')?.focus());
}
function closeBackdrop(event) {
  if (event.target !== dialog.value) return;
  const r = dialog.value.getBoundingClientRect();
  if (event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom) dialog.value.close();
}
onMounted(() => { dialog.value.showModal(); newRound(); });
onBeforeUnmount(() => searchController?.abort());
</script>

<template>
  <dialog id="route-location-challenge" ref="dialog" aria-labelledby="route-location-title" @close="emit('close')" @click="closeBackdrop">
    <header class="heading">
      <div><p class="overline">Mountain Tracker · Route positioning exercise</p><h2 id="route-location-title" tabindex="-1">Where am I on the route?</h2></div>
      <button id="route-location-close" type="button" aria-label="Close route positioning exercise" autofocus @click="dialog.close()">Close ×</button>
    </header>
    <div v-if="error" class="issue" role="alert"><p>{{ error }}</p><button type="button" @click="again">Sample again</button></div>
    <div v-else-if="round" class="body-grid">
      <section class="horizon-panel">
        <div class="section-head"><h3>Skyline at the observation point</h3><select v-model="direction" aria-label="Select viewing direction">
          <option v-for="(item,key) in views" :key="key" :value="key">{{ item.label }}</option>
        </select></div>
        <figure class="horizon-figure">
          <div class="chart-frame">
            <span class="axis top">{{ graph.high }}°</span><span class="axis bottom">{{ graph.low }}°</span>
            <svg viewBox="0 0 600 190" preserveAspectRatio="none" class="horizon" role="img" aria-label="Horizons at the hidden observation point and selected location, with vertically exaggerated elevation angles">
              <g class="grid" aria-hidden="true"><path d="M0 26H600 M0 99H600 M0 172H600 M150 0V190 M300 0V190 M450 0V190"/></g>
              <g id="route-location-observation"><g v-for="(s,i) in graph.measured" :key="i"><path class="ground" :d="s.area"/><path class="measured" :d="s.line"/></g></g>
              <g v-if="preview" id="route-location-preview"><path v-for="(s,i) in graph.comparison" :key="i" class="comparison" :d="s.line"/></g>
            </svg>
          </div>
          <div class="compass"><span v-for="(tick, i) in view.ticks" :key="i">{{ tick }}</span></div>
          <figcaption>Simulated terrain · Elevation angles vertically exaggerated</figcaption>
        </figure>
        <div class="curve-key"><span><i class="observed-line"></i>Observed skyline</span><span><i class="guess-line"></i>Skyline at your selected position</span></div>
        <p class="guide">The observation point is somewhere on this route. Click the map to compare the local skyline with the orange line. Try different points before submitting your guess.</p>
        <p v-if="session.regional" class="note">This region uses kilometer-scale MOLA terrain. Only broad skyline features can be compared.</p>
        <p v-if="session.partialCoverage" class="note">Part of the route lies outside this elevation map. The observation point is chosen from a segment with terrain coverage.</p>
        <p v-if="previewError" class="note" role="status">{{ previewError }}</p>
      </section>
      <section class="map-panel">
        <div class="section-head"><h3>{{ session.name }}</h3></div>
        <div id="route-location-map" tabindex="0" role="group" aria-label="Route terrain map. Click or use the arrow keys to move your marker. Press Enter to check."
          @click="pick" @keydown="moveKey" :class="{locked: !!answer}">
          <img :src="session.mapImage" alt="" draggable="false" width="480" height="300">
          <svg class="map-ink" viewBox="0 0 480 300" preserveAspectRatio="none" aria-hidden="true">
            <polyline class="under-route" :points="routeLine"/><polyline class="route" :points="routeLine"/>
            <g v-for="marker in endpointLabels" :key="marker.label">
              <circle class="endpoint" :cx="marker.point.x" :cy="marker.point.y" r="4"/>
              <rect class="endpoint-box" :x="marker.x-marker.width/2" :y="marker.y-9" :width="marker.width" height="18" rx="3"/>
              <text class="endpoint-text" :x="marker.x" :y="marker.y" text-anchor="middle" dominant-baseline="central">{{ marker.label }}</text>
            </g>
            <line v-if="answer" class="connector" :x1="project(guess).x" :y1="project(guess).y" :x2="project(answer.truth).x" :y2="project(answer.truth).y"/>
            <g v-for="mark in mapMarks" :key="mark.id" :id="'route-location-' + (mark.id === 'system' ? 'candidate' : mark.id)"
               :transform="'translate(' + mark.screen.x + ',' + mark.screen.y + ')'" :data-x="mark.point.x" :data-y="mark.point.y">
              <circle v-if="mark.id==='guess'" r="9" class="guess-pin"/><path v-else-if="mark.id==='truth'" d="M0 -7L7 0 0 7 -7 0Z" class="truth-pin"/>
              <path v-else d="M-4 -4L4 4M-4 4L4 -4" class="candidate-pin"/>
            </g>
          </svg>
          <span class="north">↑ N</span><span class="scale" :style="{width:mapScale.width}">{{ mapScale.label }}</span>
        </div>
        <div class="map-key"><span><i class="route-sample"></i>{{ session.startLabel }} → {{ session.endLabel }}</span><span v-for="mark in mapMarks" :key="mark.id"><b :class="mark.id">{{ {guess:'○',truth:'◆',system:'×'}[mark.id] }}</b>{{ mark.label }}</span></div>
        <button v-if="!answer" id="route-location-submit" type="button" class="primary" :disabled="!guess" @click="submit">{{ guess ? 'Check my position' : 'Select your position on the map' }}</button>
        <div v-else id="route-location-result" ref="resultPanel" tabindex="-1" aria-live="polite">
          <p>Your marker’s distance from the observation point</p><strong class="guess-distance" :data-meters="answer.guessErrorMeters">{{ distance(answer.guessErrorMeters) }}</strong>
          <div id="route-location-system" :aria-busy="searching">
            <span v-if="searching">Matching skylines within the map…</span>
            <template v-else-if="system">
              <strong class="status-label">{{ statusLabels[system.status] }}</strong>
              <span>{{ system.reason }}.</span>
              <span v-if="system.candidate && Number.isFinite(system.errorMeters)">Distance from top candidate to observation point: <b class="system-distance" :data-meters="system.errorMeters">{{ distance(system.errorMeters) }}</b>.</span>
            </template>
          </div>
          <button id="route-location-again" type="button" @click="again">Try another observation point →</button>
        </div>
      </section>
    </div>
  </dialog>
</template>

<style scoped>
#route-location-challenge {
  --hairline:#385052; --signal:#ffbd80; --ink:#eaf1ed; --aqua:#85e9d5;
  max-width:none; width:min(1000px,calc(100vw - 36px)); max-height:calc(100dvh - 36px); padding:0; margin:auto;
  background:#142528; color:var(--ink); border:1px solid #657d7c; border-top:3px solid var(--signal);
  border-radius:12px; box-shadow:0 24px 90px #030d10a8; overscroll-behavior:contain;
}
#route-location-challenge::backdrop {background:#071217cc;}
.heading {display:flex;align-items:center;justify-content:space-between;gap:14px;padding:19px 23px;background:#1b3034;border-bottom:1px solid var(--hairline);}
.heading h2 {color:var(--ink);font-size:clamp(1.25rem,2.5vw,1.85rem);line-height:1.35;}
.overline {font-weight:650;letter-spacing:.07em;color:var(--signal);font-size:.76rem;margin-bottom:4px;}
#route-location-close {flex:none;align-self:flex-start;}
.body-grid {display:grid;grid-template-columns:minmax(0,1.12fr) minmax(0,1fr);}
.body-grid section {min-width:0;padding:18px 22px;}
.map-panel {border-left:1px solid var(--hairline);}
.section-head {display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:32px;margin-bottom:10px;}
.section-head h3 {font-size:1.05rem;line-height:1.45;color:var(--ink);}
.section-head select {width:auto;margin:0;padding:4px 8px;font-size:.8rem;}
.horizon-figure {margin:0;}
.chart-frame {position:relative;display:flex;min-height:156px;background:linear-gradient(#1c373e,#30434a);border:1px solid #41575a;border-radius:6px 6px 0 0;overflow:hidden;}
.horizon {width:100%;height:clamp(155px,16vw,195px);}
.grid path,.horizon path:not(.ground),.map-ink polyline,.connector {fill:none;vector-effect:non-scaling-stroke;}
.grid path {stroke:#8ba5a14d;stroke-width:.8;stroke-dasharray:3 5;}
.ground {fill:#725649;fill-opacity:.78;}
.measured {stroke:var(--signal);stroke-width:2.1;stroke-linejoin:round;}
.comparison {stroke:var(--aqua);stroke-width:2;stroke-dasharray:6 3;stroke-linejoin:round;}
.axis {position:absolute;left:3px;font-size:.62rem;color:#dae4df;background:#152a2dad;padding:1px 3px;line-height:1.3;pointer-events:none;}
.axis.top {top:8%;}.axis.bottom {bottom:7%;}
.compass {display:flex;justify-content:space-between;padding:4px 6px;background:#203437;font-size:.68rem;color:#cfdbd7;border-radius:0 0 5px 5px;}
figcaption,.note {font-size:.75rem;line-height:1.55;color:#acbfba;margin-top:6px;}
.guide {font-size:.87rem;line-height:1.65;color:#d0dbd7;margin-top:14px;}
.curve-key,.map-key {display:flex;flex-wrap:wrap;align-items:center;gap:5px 14px;margin-top:9px;color:#dbe6e1;font-size:.77rem;}
.curve-key span,.map-key span {display:inline-flex;align-items:center;gap:6px;}
.curve-key i,.route-sample {display:inline-block;width:20px;height:0;}
.observed-line {border-top:2px solid var(--signal);}
.guess-line {border-top:2px dashed var(--aqua);}
#route-location-map {position:relative;width:100%;aspect-ratio:8/5;background:#1d2e32;cursor:crosshair;outline-offset:3px;touch-action:manipulation;}
#route-location-map.locked {cursor:default;}
#route-location-map:focus-visible {outline:2px solid var(--aqua);}
#route-location-map img,.map-ink {position:absolute;inset:0;display:block;width:100%;height:100%;pointer-events:none;}
.under-route {stroke:#192c32;stroke-width:5.4;stroke-linejoin:round;}
.route {stroke:#a2f2df;stroke-width:2.4;stroke-linejoin:round;stroke-linecap:round;}
.route-sample {border-top:2px solid #a2f2df;}
.endpoint {fill:#c8ffed;stroke:#1b3837;stroke-width:2;}
.endpoint-box {fill:#153136;fill-opacity:.94;stroke:#b7e5d2;stroke-width:.8;}
.endpoint-text {fill:#e6fff4;font-size:12px;font-weight:700;}
.north,.scale {position:absolute;pointer-events:none;color:white;font-size:.68rem;font-weight:700;text-shadow:0 1px 3px black,0 0 2px black;}
.north {right:7px;top:6px;}.scale {bottom:7px;left:9px;border-bottom:2px solid white;text-align:center;}
.map-ink g {filter:drop-shadow(0 1px 1px #071015);}
.connector {stroke:white;stroke-width:1.8;stroke-dasharray:3 3;}
.guess-pin {fill:#19292241;stroke:#ffbf75;stroke-width:3;}
.truth-pin {fill:#f3f8f1;stroke:#304644;stroke-width:1.6;}
.candidate-pin {stroke:#83e9ff;stroke-width:2.8;}
.map-key b {font-size:1.02rem;line-height:1;}
.map-key .guess {color:#ffbf75;}.map-key .truth {color:white;}.map-key .system {color:#83e9ff;}
#route-location-submit,#route-location-again {width:100%;margin-top:12px;}
#route-location-result {border-top:1px solid var(--hairline);margin-top:12px;padding-top:10px;}
#route-location-result > p,#route-location-system {font-size:.82rem;line-height:1.6;color:#c6d6d0;}
.guess-distance {display:block;font-size:clamp(1.55rem,3vw,2rem);line-height:1.35;color:var(--aqua);font-variant-numeric:tabular-nums;}
#route-location-system {margin-top:5px;}
.status-label {display:block;color:#edf3ed;}
.issue {display:grid;gap:10px;justify-items:start;padding:22px;}
@media (max-width:720px) {
  #route-location-challenge {width:calc(100% - 14px);max-height:calc(100dvh - 14px);border-radius:8px;}
  .heading {position:sticky;top:0;z-index:2;padding:10px 14px;}
  .body-grid {display:block;}.body-grid section {padding:12px 15px;}
  .map-panel {border-left:0;border-top:1px solid var(--hairline);}
  .horizon {height:126px;}.chart-frame {min-height:126px;}
  .section-head {min-height:26px;margin-bottom:6px;}
  .guide {margin-top:9px;}
  #route-location-result {scroll-margin:65px 0;}
}
</style>
