<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { asset, json } from '../asset';

const emit = defineEmits(['close']);
const dialog = ref(null);
const data = ref(null);
const failed = ref(false);
const revealed = ref(false);
const resultPanel = ref(null);
const observed = ref(true);
const predicted = ref(true);
const selectedView = ref('ridge');
const directory = 'data/gale/dingo-gap/';
const views = {
  ridge: { name: '右側山稜', start: 0.53, end: 0.92, bottom: 0.52 },
  left: { name: '左側山稜', start: 0.025, end: 0.29, bottom: 0.36 },
  full: { name: '360° 完整全景', start: 0, end: 1, bottom: 1 },
};
const view = computed(() => views[selectedView.value]);
const photoBox = computed(() => {
  const { width, height } = data.value.photo;
  const { start, end, bottom } = view.value;
  return { x: start * width, width: (end - start) * width, height: bottom * height };
});
const graphLimits = computed(() => {
  const photo = data.value.photo;
  const visible = photo.samples.filter(p => p.x >= view.value.start && p.x <= view.value.end);
  const elevations = visible.flatMap(p => [p.observedY, p.modelY])
    .filter(Number.isFinite).map(y => (photo.zeroElevationY - y) * photo.verticalSpanDeg);
  return { low: Math.floor(Math.min(...elevations)), high: Math.ceil(Math.max(...elevations)) };
});
const traces = computed(() => {
  const photo = data.value.photo;
  const { low, high } = graphLimits.value;
  return ['observedY', 'modelY'].map(field => {
    let fromGap = true, onPhoto = '', onGraph = '';
    for (const sample of photo.samples) {
      if (sample.x < view.value.start || sample.x > view.value.end || !Number.isFinite(sample[field])) {
        fromGap = true;
        continue;
      }
      const command = fromGap ? 'M' : 'L';
      onPhoto += `${command}${sample.x * photo.width},${sample[field] * photo.height} `;
      const x = (sample.x - view.value.start) / (view.value.end - view.value.start) * 100;
      const elevation = (photo.zeroElevationY - sample[field]) * photo.verticalSpanDeg;
      onGraph += `${command}${x},${(high - elevation) / (high - low || 1) * 100} `;
      fromGap = false;
    }
    return { onPhoto, onGraph, visible: field === 'observedY' ? observed.value : predicted.value, field };
  });
});
const imageUrl = asset(directory + 'panorama.webp');
const mapUrl = asset(directory + 'map.webp');
const scaleMeters = 500;
const coordinates = ({ lat, lng }) =>
  `${Math.abs(lat).toFixed(4)}°${lat < 0 ? 'S' : 'N'}, ${Math.abs(lng).toFixed(4)}°${lng < 0 ? 'W' : 'E'}`;
const pointStyle = p => ({ left: `${100 * p.x}%`, top: `${100 * p.y}%` });
let controller;
async function loadDemo() {
  failed.value = false;
  controller = new AbortController();
  try {
    data.value = await json(directory + 'demo.json', { signal: controller.signal });
  } catch (error) {
    if (error.name !== 'AbortError') failed.value = true;
  }
}
async function toggleResult() {
  revealed.value = !revealed.value;
  if (revealed.value && window.matchMedia('(max-width: 720px)').matches) {
    await nextTick();
    resultPanel.value?.scrollIntoView({ block: 'nearest' });
  }
}
function closeBackdrop(event) {
  if (event.target !== dialog.value) return;
  const box = dialog.value.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.value.close();
}
onMounted(() => { dialog.value.showModal(); loadDemo(); });
onBeforeUnmount(() => controller?.abort());
</script>

<template>
  <dialog id="curiosity-demo" ref="dialog" aria-labelledby="curiosity-demo-title" @close="emit('close')" @click="closeBackdrop">
    <article class="sample">
      <header class="sample-heading">
        <div>
          <p class="site-name"><span lang="en">Dingo Gap</span> · 好奇號第 538–539 個火星日</p>
          <h2 id="curiosity-demo-title">好奇號在哪裡拍攝？</h2>
        </div>
        <button id="curiosity-close" type="button" autofocus aria-label="關閉好奇號實拍示範" @click="dialog.close()">關閉 <span aria-hidden="true">×</span></button>
      </header>
      <p v-if="failed" role="alert" class="load-state">無法載入示範資料。 <button type="button" @click="loadDemo">重新載入</button></p>
      <p v-else-if="!data" role="status" class="load-state">正在載入實拍全景與站位圖…</p>
      <div v-else class="sample-content">
        <section class="observation">
          <div class="section-head">
            <h3>實拍山稜比對</h3>
            <select id="curiosity-view" v-model="selectedView" aria-label="選擇全景檢視範圍">
              <option v-for="(v, key) in views" :key="key" :value="key">{{ v.name }}</option>
            </select>
          </div>
          <figure id="curiosity-photo">
            <svg class="photo" role="img" :aria-label="'好奇號左導航相機全景，' + view.name"
              :viewBox="`${photoBox.x} 0 ${photoBox.width} ${photoBox.height}`" :style="{ aspectRatio: photoBox.width / photoBox.height }">
              <image :href="imageUrl" x="0" y="0" :width="data.photo.width" :height="data.photo.height" />
              <path v-for="trace in traces" v-show="trace.visible" :key="trace.field" :class="trace.field" :d="trace.onPhoto" />
            </svg>
            <figcaption>NASA/JPL-Caltech · 左導航相機</figcaption>
          </figure>
          <div class="plot">
            <div class="plot-heading"><strong>山稜仰角</strong><span>垂直放大</span></div>
            <div class="plot-area">
              <div class="ticks" aria-hidden="true"><span>{{ graphLimits.high }}°</span><span>{{ graphLimits.low }}°</span></div>
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="實拍山稜與候選位置的地形輪廓，缺測處留白">
                <path v-for="trace in traces" v-show="trace.visible" :key="trace.field" :class="trace.field" :d="trace.onGraph" />
              </svg>
            </div>
            <div class="traces" aria-label="選擇顯示的輪廓">
              <button id="curiosity-observed" type="button" :aria-pressed="observed" @click="observed = !observed"><i class="line-sample measured" aria-hidden="true"></i>實拍山稜</button>
              <button id="curiosity-predicted" type="button" :aria-pressed="predicted" @click="predicted = !predicted"><i class="line-sample modeled" aria-hidden="true"></i>候選地形</button>
            </div>
          </div>
          <p class="explanation">橘線描出實拍全景中可辨認的 {{ data.result.validDegrees }}° 山稜，遮擋處留白。</p>
          <p class="explanation">系統在長寬各 9.5 公里內搜尋位置與朝向。青色虛線是離線比對的首選位置望向 {{ data.result.searchRangeKm }} 公里內的山形。</p>
        </section>
        <section class="location">
          <div class="section-head"><h3>系統推估的拍攝位置</h3></div>
          <figure id="curiosity-map">
            <div class="map-frame-demo" :style="{ aspectRatio: data.map.width / data.map.height }" role="img"
              :aria-label="revealed ? '蓋爾隕石坑正射影像，標示候選與 NASA 紀錄的拍攝站位和兩點連線' : '蓋爾隕石坑正射影像，標示系統首選位置'">
              <img :src="mapUrl" alt="" :width="data.map.width" :height="data.map.height">
              <span class="north" aria-hidden="true">↑ N</span>
              <svg v-if="revealed" class="map-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <line :x1="data.candidate.x * 100" :y1="data.candidate.y * 100" :x2="data.reference.x * 100" :y2="data.reference.y * 100" />
              </svg>
              <i class="map-pin system-pin" :style="pointStyle(data.candidate)" aria-hidden="true"></i>
              <i v-if="revealed" id="curiosity-nasa-mark" class="map-pin official-pin" :style="pointStyle(data.reference)" aria-hidden="true"></i>
              <span class="scale" :style="{ width: scaleMeters / data.map.widthMeters * 100 + '%' }">{{ scaleMeters }} m</span>
            </div>
            <figcaption class="map-key"><span><i class="key-swatch system-pin"></i>系統首選</span><span v-if="revealed"><i class="key-swatch official-pin"></i>NASA 拍攝站位</span></figcaption>
          </figure>
          <button id="curiosity-reveal" type="button" :class="{primary: !revealed}" :aria-expanded="revealed" @click="toggleResult">{{ revealed ? '隱藏 NASA 拍攝站位' : '揭曉 NASA 拍攝站位' }} <span aria-hidden="true">{{ revealed ? '−' : '→' }}</span></button>
          <div aria-live="polite" aria-atomic="true">
            <div v-if="revealed" id="curiosity-result" ref="resultPanel" class="result">
              <span>首選位置與拍攝站位相距</span>
              <strong>{{ Math.round(data.result.distanceMeters).toLocaleString('zh-TW') }} <small>公尺</small></strong>
              <p>這次首選落在拍攝點約一公里內。兩條輪廓的差異仍超過自動校正門檻，系統保留候選位置。</p>
            </div>
          </div>
        </section>
      </div>
      <details v-if="data" class="source">
        <summary>查看方法與資料來源</summary>
        <p>全景的山稜由人工標註，再每 3° 取樣。站位與朝向先由數值地形模型（DEM）離線推估，之後用 NASA 任務紀錄核對。這裡重現這一張照片的結果。</p>
        <p v-if="revealed">系統首選 {{ coordinates(data.candidate) }}。NASA 拍攝站 {{ coordinates(data.reference) }}（Site {{ data.reference.site }}，Drive {{ data.reference.drive }}）。本次角度殘差 {{ data.result.rmsDeg.toFixed(2) }}°，自動校正門檻 {{ data.result.maxRmsDeg.toFixed(2) }}°。</p>
        <p v-if="revealed">採用本站一般 6 公里視距時，同一張照片的首選距拍攝站 {{ Math.round(data.result.websiteDistanceMeters).toLocaleString('zh-TW') }} 公尺。</p>
        <p>全景影像 {{ data.sources.photoCredit }}。站位圖 {{ data.sources.mapCredit }}。</p>
        <nav aria-label="實拍與地形資料來源">
          <a :href="data.sources.image" target="_blank" rel="noopener noreferrer">好奇號原始全景 ↗</a>
          <a :href="data.sources.position" target="_blank" rel="noopener noreferrer">NASA 站位紀錄 ↗</a>
          <a :href="data.sources.localTerrain" target="_blank" rel="noopener noreferrer">Gale 地形 ↗</a>
          <a :href="data.sources.distantTerrain" target="_blank" rel="noopener noreferrer">遠山地形 ↗</a>
        </nav>
      </details>
    </article>
  </dialog>
</template>

<style scoped>
#curiosity-demo {
  --demo-paper: #15262a;
  --demo-ink: #e9f0eb;
  --demo-hairline: #395055;
  --observed: #ffb165;
  --predicted: #81eddb;
  width: min(1010px, calc(100% - 40px));
  max-width: none;
  max-height: calc(100dvh - 40px);
  margin: auto;
  padding: 0;
  overflow: auto;
  overscroll-behavior: contain;
  color: var(--demo-ink);
  background: var(--demo-paper);
  border: 1px solid #687e7d;
  border-radius: 12px;
  box-shadow: 0 25px 90px #020b0f94;
}
#curiosity-demo::backdrop { background: #091318cc; }
.sample { min-width: 0; }
.sample-heading {
  display: flex; justify-content: space-between; align-items: flex-start; gap: 15px;
  padding: 20px 24px 18px; border-top: 3px solid var(--orange); border-bottom: 1px solid var(--demo-hairline);
  background: #1b3034;
}
.site-name { margin: 0 0 6px; color: #f5bc88; font-size: .78rem; font-weight: 650; }
.site-name span { letter-spacing: .08em; text-transform: uppercase; }
.sample-heading h2 { font-size: clamp(1.3rem, 2.4vw, 1.9rem); line-height: 1.23; letter-spacing: 0; }
#curiosity-close { display: inline-flex; align-items: center; gap: 7px; flex-shrink: 0; min-height: 38px; }
#curiosity-close span { font-size: 1.15rem; line-height: 1; }
.sample-content { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(250px, 1fr); }
.sample-content > section { min-width: 0; padding: 18px 24px 22px; }
.location { border-left: 1px solid var(--demo-hairline); background: #122226; }
.section-head { min-height: 35px; display: flex; align-items: center; justify-content: space-between; gap: 9px; margin-bottom: 10px; }
.section-head h3 { font-size: 1.06rem; }
.section-head select { width: auto; margin: 0; padding: 4px 9px; font-size: .8rem; min-height: 31px; }
.sample figure { margin: 0; }
.sample figcaption { margin: 6px 0 0; font-size: .7rem; color: #b6c5c3; }
.photo { display: block; width: 100%; height: auto; background: #090e10; border-radius: 5px; }
.photo path, .plot-area svg path { fill: none; stroke-linejoin: round; stroke-linecap: round; vector-effect: non-scaling-stroke; }
.observedY { stroke: var(--observed); stroke-width: 2; }
.modelY { stroke: var(--predicted); stroke-width: 1.8; stroke-dasharray: 4 3; }
.photo path { filter: drop-shadow(0 1px 1px #061014); }
.plot { margin-top: 12px; }
.plot-heading { display: flex; align-items: baseline; gap: 8px; }
.plot-heading strong { font-size: .83rem; }
.plot-heading span, .ticks { color: #aebfbc; font-size: .69rem; }
.plot-area { display: flex; gap: 5px; height: 68px; margin: 6px 0 7px; }
.plot-area svg {
  flex: 1; min-width: 0; height: 100%; overflow: visible;
  border-block: 1px solid #3b5050;
  background: repeating-linear-gradient(90deg, #334748 0 1px, transparent 1px 25%);
}
.ticks { display: flex; flex-direction: column; justify-content: space-between; font-variant-numeric: tabular-nums; line-height: 1; }
.traces { display: flex; flex-wrap: wrap; gap: 6px; }
.traces button {
  display: flex; align-items: center; gap: 7px; padding: 4px 8px; min-height: 30px;
  font-size: .75rem; border-radius: 4px; background: transparent;
}
.traces button[aria-pressed=true] { background: #21383b; color: var(--demo-ink); border-color: #526c6c; }
.traces button[aria-pressed=false] { color: #a6b4b2; }
.traces button[aria-pressed=false] .line-sample { opacity: .35; }
.line-sample { display: block; width: 20px; }
.measured { border-top: 2px solid var(--observed); }
.modeled { border-top: 2px dashed var(--predicted); }
.explanation, .source p, .result p { color: #bfceca; font-size: .84rem; line-height: 1.65; }
.explanation { margin-top: 10px; }
.map-frame-demo { position: relative; width: 100%; overflow: hidden; border: 1px solid var(--demo-hairline); border-radius: 5px; background: #0d171b; }
.map-frame-demo img, .map-line { position: absolute; inset: 0; width: 100%; height: 100%; }
.map-line line { stroke: white; stroke-width: 2.5; stroke-dasharray: 4 3; vector-effect: non-scaling-stroke; filter: drop-shadow(0 1px 1px black); }
.north, .scale { position: absolute; color: white; font-size: .7rem; font-weight: 650; text-shadow: 0 1px 3px #000, 0 0 3px #000; }
.north { top: 5px; right: 7px; }
.scale { left: 10px; bottom: 8px; text-align: center; border-bottom: 2px solid #fff; box-shadow: 0 1px #162627; line-height: 1.4; }
.map-pin { width: 14px; height: 14px; position: absolute; border: 2px solid #fff; box-shadow: 0 0 0 2px #183131, 0 2px 7px #112222cc; }
.system-pin { border-radius: 100%; background: #238777; }
.map-pin.system-pin { transform: translate(-50%, -50%); }
.official-pin { background: #be456d; }
.map-pin.official-pin { transform: translate(-50%, -50%) rotate(45deg); }
.map-key, .map-key span { display: flex; gap: 6px; align-items: center; }
.map-key { flex-wrap: wrap; min-height: 20px; column-gap: 15px; }
.key-swatch { width: 9px; height: 9px; border: 1px solid #e7f5ef; display: inline-block; }
.key-swatch.official-pin { transform: rotate(45deg) scale(.82); }
#curiosity-reveal { display: flex; align-items: center; justify-content: space-between; width: 100%; margin: 15px 0 0; }
.result { padding-top: 12px; }
.result > span { color: #c8d6d3; font-size: .76rem; }
.result > strong { display: block; margin: 2px 0 5px; color: #b6f3d9; font-size: 2.5rem; font-weight: 680; line-height: 1.1; font-variant-numeric: tabular-nums; }
.result small { font-size: .9rem; }
.source { border-top: 1px solid var(--demo-hairline); padding: 0 24px; }
.source summary { padding: 12px 0; width: fit-content; color: #bacdc8; font-size: .82rem; cursor: pointer; }
.source p { margin-bottom: .55rem; }
.source nav { display: flex; flex-wrap: wrap; gap: 7px 18px; padding-bottom: 18px; }
.load-state { padding: 25px; }
@media (max-width: 720px) {
  #curiosity-demo { width: calc(100% - 16px); max-height: calc(100dvh - 16px); border-radius: 8px; }
  .sample-heading { position: sticky; top: 0; z-index: 1; padding: 11px 15px; }
  .sample-heading h2 { font-size: 1.23rem; }
  .site-name { margin: 0 0 3px; font-size: .7rem; }
  .sample-content { display: block; }
  .sample-content > section { padding: 13px 15px 15px; }
  .location { border: 0; border-top: 1px solid var(--demo-hairline); }
  .source { padding: 0 15px; }
  .section-head { margin-bottom: 7px; }
  .explanation { margin-top: 7px; }
  #curiosity-reveal { margin-top: 9px; }
}
</style>
