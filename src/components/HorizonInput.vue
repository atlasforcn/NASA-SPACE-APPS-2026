<script setup>
import { inject, ref, onMounted, onBeforeUnmount } from "vue";
import { missionKey } from "../useMission";
import { observationFromTrace, extractHorizon } from "../horizon-input.mjs";
const m = inject(missionKey), s = m.state;
const canvas = ref(null), fov = ref(60), pitch = ref(0), projection = ref("perspective"), message = ref("直接在畫布畫出天空與山體交界，或上傳照片。"), filename = ref("");
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
  previous = p; paint(); message.value = "橘線為輸入輪廓；可重新描畫局部修正，再開始比對。";
}
function start(event) {
  if (event.button !== 0) return;
  activePointer = event.pointerId; previous = null;
  canvas.value.setPointerCapture(event.pointerId); draw(event);
}
function end() { activePointer = null; previous = null; }
function clear() { trace.fill(null); paint(); message.value = "輪廓已清除，請重新描畫。"; }
function blank() {
  loadToken++; image?.close(); image = null; filename.value = "";
  canvas.value.height = 260; trace = Array(700).fill(null); paint();
  message.value = "手繪模式：虛線是畫面中心；依水平視角與俯仰角換算仰角。";
}
async function upload(event) {
  const file = event.target.files?.[0]; event.target.value = "";
  if (!file) return;
  const token = ++loadToken;
  try {
    if (!file.type.startsWith("image/") || file.size > 25 * 1024 * 1024) throw Error("請選擇 25 MB 以下的圖片。");
    const bitmap = await createImageBitmap(file);
    if (token !== loadToken) { bitmap.close(); return; }
    const ratio = bitmap.height / bitmap.width;

    image?.close(); image = bitmap; filename.value = file.name;
    canvas.value.height = Math.max(8, Math.min(1400, Math.round(700 * ratio))); trace = Array(700).fill(null); paint(); extract();
  } catch (error) { message.value = "圖片讀取失敗：" + error.message; }
}
function extract() {
  if (!image) return;
  const cv = document.createElement("canvas"); cv.width = 350; cv.height = Math.max(8, Math.min(700, Math.round(350 * image.height / image.width)));
  const ctx = cv.getContext("2d"); ctx.drawImage(image, 0, 0, cv.width, cv.height);
  const small = extractHorizon(ctx.getImageData(0, 0, cv.width, cv.height));
  trace = Array.from({ length: 700 }, (_, x) => Number.isFinite(small[Math.min(349, Math.floor(x / 2))]) ? small[Math.min(349, Math.floor(x / 2))] * canvas.value.height / cv.height : null);
  paint(); message.value = "已產生邊界提案。橘線追蹤天空／山體交界，無天空處保留缺口；雲或光照可能造成誤判，可直接描畫修正。";
}
function match() {
  try {
    const obs = observationFromTrace(trace, 700, canvas.value.height,
      { ...m.horizonOptions(), fov: Number(fov.value), pitch: Number(pitch.value), projection: projection.value });
    m.matchHorizon(obs); message.value = s.hasStart
      ? "正在比對目前估計位置附近的 DEM；候選與疊圖顯示於下方。"
      : "未設定起點：正在搜尋目前載入的 DEM 區域；候選與疊圖顯示於下方。";
  } catch (error) { message.value = error.message; }
}
onMounted(paint);
onBeforeUnmount(() => { loadToken++; image?.close(); });
</script>
<template>
  <details class="horizon-input group" aria-label="手繪或照片定位">
    <summary>手繪／照片山稜線比對</summary>
    <p class="hint">畫出山稜線，或上傳探測器照片轉成 2D 輪廓。照片只在本機處理。有起點時搜尋估計位置附近；沒有起點時搜尋目前載入的 DEM 區域。</p>
    <div class="button-row">
      <button id="horizon-blank" @click="blank">空白手繪</button>
      <label>上傳照片<input id="horizon-photo" type="file" accept="image/*" @change="upload" /></label>
      <button :disabled="!filename" @click="extract">重新擷取輪廓</button>
      <button id="horizon-clear" @click="clear">清除輪廓</button>
    </div>
    <p v-if="filename" class="hint">{{ filename }} · 請保持照片水平，依裁切後的畫面填寫水平視角。</p>
    <div class="button-row">
      <label>影像投影<select id="horizon-projection" v-model="projection"><option value="perspective">單張透視照片／手繪</option><option value="equirectangular">等距全景圖／手繪</option></select></label>
      <label>水平視角（°）<input id="horizon-fov" v-model.number="fov" type="number" min="10" :max="projection === 'perspective' ? 150 : 360" /></label>
      <label>相機俯仰角（°，向上為正）<input id="horizon-pitch" v-model.number="pitch" type="number" min="-60" max="60" step="0.1" /></label>
    </div>
    <canvas id="horizon-editor" ref="canvas" width="700" height="260" aria-label="可手繪及修正的山稜線畫布"
      @pointerdown="start" @pointermove="draw" @pointerup="end" @pointercancel="end" @lostpointercapture="end" />
    <p v-if="!filename" class="hint">手繪時，中央虛線對應上方設定的俯仰角。</p>
    <p id="horizon-input-status" class="hint" role="status">{{ message }}</p>
    <p id="horizon-search-scope" class="hint">{{ !s.ready ? "正在載入 DEM，完成後即可比對。" : s.regionLoading ? "正在切換地形區域，完成後即可比對。" : s.searching ? "正在比對；可使用「取消」停止搜尋。" : s.hasStart ? "搜尋範圍：目前估計位置附近。" : "未設定起點也可比對：將搜尋目前載入的 DEM 區域；設定大致起點可縮小範圍。" }}</p>
    <button id="horizon-match" class="primary" :disabled="!s.ready || s.searching || s.regionLoading" @click="match">比對 DEM 找回候選位置</button>
    <p class="hint">手繪與照片尚未校準定位可信度；結果只提供候選，不自動校正導航。視角狹窄、平坦山稜或相機角度有誤時，可能無法判定位置。</p>
  </details>
</template>
<style scoped>
.horizon-input { margin-bottom: 20px; }
summary { cursor: pointer; font-weight: 700; }
.horizon-input[open] > summary { margin-bottom: 16px; }
#horizon-editor { width: 100%; height: auto; max-height: none; display: block; touch-action: none; cursor: crosshair; border: 1px solid #597078; }
input[type="number"] { width: 110px; }
input[type="file"] { max-width: 230px; }
</style>
