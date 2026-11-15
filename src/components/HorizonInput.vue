<script setup>
import { inject, ref, onMounted, onBeforeUnmount } from "vue";
import { missionKey } from "../useMission";
import { asset } from "../asset";
import { observationFromTrace, extractHorizon } from "../horizon-input.mjs";
defineProps({ standalone: Boolean });
const emit = defineEmits(['edited', 'submitted', 'source']);
const m = inject(missionKey), s = m.state;
const canvas = ref(null), fov = ref(60), pitch = ref(0), projection = ref("perspective"), message = ref(""), filename = ref("");
const loadingImage = ref(false);
const sampleSource = ref(null);
let recordedElevations = null, controller = null;
let trace = Array(700).fill(null), image = null, previous = null, activePointer = null, loadToken = 0;
function paint() {
  const cv = canvas.value;
  if (!cv) return;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#15232a"; ctx.fillRect(0, 0, cv.width, cv.height);
  if (image) ctx.drawImage(image, 0, 0, cv.width, cv.height);
  ctx.strokeStyle = "#ffffff66"; ctx.setLineDash([5, 5]);
  ctx.beginPath(); ctx.moveTo(0, cv.height / 2); ctx.lineTo(cv.width, cv.height / 2); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = "#ffb477"; ctx.lineWidth = 3; ctx.beginPath();
  let open = false;
  trace.forEach((y, x) => { if (!Number.isFinite(y)) { open = false; return; }
    if (open) ctx.lineTo(x, y); else ctx.moveTo(x, y); open = true; });
  ctx.stroke();
}
function point(event) {
  const r = canvas.value.getBoundingClientRect();
  return { x: Math.max(0, Math.min(699, Math.round((event.clientX - r.left) * 700 / r.width))),
    y: Math.max(0, Math.min(canvas.value.height - 1, (event.clientY - r.top) * canvas.value.height / r.height)) };
}
function draw(event) {
  if (activePointer !== event.pointerId) return;
  const p = point(event), a = previous || p;
  const count = Math.abs(p.x - a.x);
  if (!count) trace[p.x] = p.y;
  for (let k = 0; k <= count; k++) {
    const t = count ? k / count : 0;
    trace[Math.round(a.x + (p.x - a.x) * t)] = a.y + (p.y - a.y) * t;
  }
  previous = p; paint(); message.value = "The orange line is your input. Redraw any section before matching.";
}
function invalidateTrace() {
  recordedElevations = null;
  emit('edited');
}
function start(event) {
  if (event.button !== 0 || loadingImage.value) return;
  invalidateTrace();
  activePointer = event.pointerId; previous = null;
  canvas.value.setPointerCapture(event.pointerId); draw(event);
}
function end() { activePointer = null; previous = null; }
function clear() { invalidateTrace(); trace.fill(null); paint(); message.value = "Trace cleared. Draw a new skyline."; }
function beginSource(sample) {
  controller?.abort();
  controller = null;
  ++loadToken;
  end();
  invalidateTrace();
  if (sample || sampleSource.value) {
    projection.value = sample?.projection || 'perspective';
    fov.value = sample?.fov ?? 60;
    pitch.value = sample?.pitch ?? 0;
  }
  sampleSource.value = sample;
  emit('source', sample);
  image?.close(); image = null; filename.value = '';
  canvas.value.height = 260;
  trace.fill(null); paint();
  loadingImage.value = false;
  return loadToken;
}
function blank() {
  beginSource(null);
  message.value = "Drawing mode: the dashed line marks the center. Field of view and camera pitch determine elevation angle.";
}
function useBitmap(bitmap) {
  image = bitmap;
  canvas.value.height = Math.max(8, Math.min(1400, Math.round(700 * bitmap.height / bitmap.width)));
}
async function upload(event) {
  const file = event.target.files?.[0]; event.target.value = "";
  if (!file) return;
  const token = beginSource(null);
  loadingImage.value = true;
  try {
    if (!file.type.startsWith("image/") || file.size > 25 * 1024 * 1024) throw Error("Choose an image no larger than 25 MB.");
    const bitmap = await createImageBitmap(file);
    if (token !== loadToken) { bitmap.close(); return; }
    useBitmap(bitmap);
    filename.value = file.name;
    extract();
  } catch (error) {
    if (token === loadToken) message.value = "Image failed to load: " + error.message;
  } finally {
    if (token === loadToken) loadingImage.value = false;
  }
}
function loadRecordedTrace(points) {
  let i = 0;
  return Array.from({ length: 700 }, (_, x) => {
    const u = x / 700;
    while (i + 1 < points.length && points[i + 1].x <= u) i++;
    const a = points[i], b = points[i + 1];
    if (!a || a.x > u || !Number.isFinite(a.y)) return null;
    if (a.x === u) return a.y * canvas.value.height;
    if (!b || !Number.isFinite(b.y)) return null;
    return (a.y + (b.y - a.y) * (u - a.x) / (b.x - a.x)) * canvas.value.height;
  });
}
async function loadSample(sample) {
  const token = beginSource(sample);
  controller = new AbortController();
  loadingImage.value = true;
  message.value = 'Loading the NASA panorama…';
  try {
    const response = await fetch(asset(sample.image), { signal: controller.signal });
    if (!response.ok) throw Error(String(response.status));
    const bitmap = await createImageBitmap(await response.blob());
    if (token !== loadToken) { bitmap.close(); return; }
    useBitmap(bitmap);
    filename.value = 'Curiosity · ' + (sample.sols.includes('–') ? 'Sols ' : 'Sol ') + sample.sols;
    trace = loadRecordedTrace(sample.trace);
    recordedElevations = sample.elevations;
    paint();
    message.value = 'The orange line is the hand-traced skyline. You can redraw it before matching.';
  } catch (error) {
    if (token === loadToken) message.value = 'The NASA panorama could not be loaded. Select the photo to try again.';
  } finally {
    if (token === loadToken) loadingImage.value = false;
  }
}
defineExpose({ loadSample });
function extract() {
  if (!image) return;
  invalidateTrace();
  const cv = document.createElement("canvas"); cv.width = 350; cv.height = Math.max(8, Math.min(700, Math.round(350 * image.height / image.width)));
  const ctx = cv.getContext("2d"); ctx.drawImage(image, 0, 0, cv.width, cv.height);
  const small = extractHorizon(ctx.getImageData(0, 0, cv.width, cv.height));
  trace = Array.from({ length: 700 }, (_, x) => Number.isFinite(small[Math.min(349, Math.floor(x / 2))]) ? small[Math.min(349, Math.floor(x / 2))] * canvas.value.height / cv.height : null);
  paint(); message.value = "The orange line traces the skyline. Redraw any section that misses the sky–terrain boundary. Leave gaps where the sky is hidden.";
}
function match() {
  try {
    const options = m.horizonOptions();
    const obs = recordedElevations ? {
      angles: recordedElevations.map((_, i) => i * 3),
      elevations: recordedElevations.slice(), valid: recordedElevations.map(Number.isFinite),
      cameraHeight: 1.7, kind: "user-horizon", options: { ...options, angleStep: 3 },
    } : observationFromTrace(trace, 700, canvas.value.height,
      { ...options, fov: Number(fov.value), pitch: Number(pitch.value), projection: projection.value });
    m.matchHorizon(obs);
    emit('submitted');
    message.value = "Trace submitted. See the match results below.";
  } catch (error) { message.value = error.message; }
}
onMounted(paint);
onBeforeUnmount(() => { loadToken++; controller?.abort(); image?.close(); });
</script>
<template>
  <component :is="standalone ? 'section' : 'details'" class="horizon-input" :class="standalone ? 'photo-workspace' : 'group'" aria-label="Positioning from a drawing or photograph">
    <summary v-if="!standalone">Match a hand-drawn or photographed skyline</summary>
    <div class="photo-observation">
      <label class="photo-upload">Upload photograph<input id="horizon-photo" type="file" accept="image/*" @change="upload" /></label>
      <p class="hint">Draw the skyline or upload a photograph to extract it. Photos are processed on your device.</p>
      <p v-if="filename && !sampleSource" class="hint">{{ filename }} · Keep the image level and enter the horizontal field of view of the cropped image.</p>
      <canvas id="horizon-editor" ref="canvas" width="700" height="260" aria-label="Canvas for drawing and correcting a skyline"
        @pointerdown="start" @pointermove="draw" @pointerup="end" @pointercancel="end" @lostpointercapture="end" />
      <div class="button-row edit-actions">
        <button id="horizon-blank" @click="blank">Start a blank drawing</button>
        <button :disabled="!filename" @click="extract">Extract skyline again</button>
        <button id="horizon-clear" :disabled="loadingImage" @click="clear">Clear skyline</button>
      </div>
      <p v-if="!filename" class="hint">The dashed line marks the image center at the entered camera pitch.</p>
      <p v-show="message" id="horizon-input-status" class="hint" role="status">{{ message }}</p>
    </div>
    <div class="camera-settings">
      <h3 v-if="standalone">Camera and terrain</h3>
      <slot name="terrain" />
      <div class="button-row camera-fields" @input="invalidateTrace">
        <label>Image projection<select id="horizon-projection" :disabled="loadingImage" v-model="projection"><option value="perspective">Perspective photograph or drawing</option><option value="equirectangular">Equirectangular panorama or drawing</option></select></label>
        <label>Horizontal field of view (°)<input id="horizon-fov" :disabled="loadingImage" v-model.number="fov" type="number" min="10" :max="projection === 'perspective' ? 150 : 360" /></label>
        <label>Camera pitch (°, positive upward)<input id="horizon-pitch" :disabled="loadingImage" v-model.number="pitch" type="number" min="-60" max="60" step="0.1" /></label>
      </div>
      <p id="horizon-search-scope" class="hint">{{ !s.ready ? "Loading DEM. Matching will be available shortly." : s.regionLoading ? "Switching terrain regions. Matching will resume when loading finishes." : s.searching ? "Matching. Select Cancel to stop the search." : s.hasStart ? "Search near the estimated position." : "No starting point set. Search the loaded terrain region." }}</p>
      <button id="horizon-match" class="primary" :disabled="!s.ready || s.searching || s.regionLoading || loadingImage || (sampleSource && !filename)" @click="match">Find candidate positions in the DEM</button>
      <p class="hint">Photos and drawings return candidate positions for inspection. A narrow view, a flat skyline or an incorrect camera angle can prevent a reliable match.</p>
    </div>
  </component>
</template>
<style scoped>
.horizon-input { margin-bottom: 20px; }
summary { cursor: pointer; font-weight: 700; }
.horizon-input[open] > summary { margin-bottom: 16px; }
#horizon-editor { width: 100%; height: auto; max-height: none; display: block; touch-action: none; cursor: crosshair; border: 1px solid #597078; }
input[type="number"] { width: 110px; }
input[type="file"] { max-width: 230px; }
.photo-observation .hint + canvas { margin-top: 12px; }
.photo-workspace { display: grid; grid-template-columns: minmax(0, 1.8fr) minmax(245px, 1fr); margin: 0; }
.photo-workspace > div { min-width: 0; padding: 22px 24px; }
.photo-workspace .camera-settings { background: #122226; border-left: 1px solid #395055; }
.photo-workspace .photo-upload { margin: 0; color: #e9f0eb; font-size: 1rem; font-weight: 650; }
.photo-workspace input[type="file"] { max-width: none; padding: 9px; font-weight: normal; }
.photo-workspace input[type="file"]::file-selector-button {
  margin-inline-end: 10px; padding: 6px 12px; border: 0; border-radius: 4px;
  color: #152b29; background: var(--mint); font: inherit; font-weight: 650; cursor: pointer;
}
.photo-workspace .edit-actions { gap: 6px; margin-bottom: 0; }
.photo-workspace .edit-actions button { flex: 0 1 auto; min-height: 36px; padding: 6px 9px; }
.photo-workspace .camera-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: end; gap: 14px; margin: 16px 0; }
.photo-workspace .camera-fields label { margin: 0; }
.photo-workspace .camera-fields label:first-child { grid-column: 1/-1; }
.photo-workspace input[type="number"] { width: 100%; }
.photo-workspace #horizon-match { width: 100%; min-height: 44px; margin-top: 14px; }
@media (max-width: 740px) {
  .photo-workspace { grid-template-columns: 1fr; }
  .photo-workspace > div { padding: 16px; }
  .photo-workspace .camera-settings { border-left: 0; border-top: 1px solid #395055; }
}
</style>
