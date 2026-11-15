<script setup>
import { computed, inject, nextTick, onBeforeUnmount, onMounted, provide, ref, watch, watchEffect } from 'vue';
import C from '../../core.mjs';
import regions from '../../regions.mjs';
import { missionKey } from '../useMission';
import { asset, json } from '../asset';
import HorizonInput from './HorizonInput.vue';

const emit = defineEmits(['close']);
const mission = inject(missionKey);
const m = mission.createPhotoMatcher(), s = m.state;
provide(missionKey, m);
const dialog = ref(null), results = ref(null), chart = ref(null), editor = ref(null);
const catalog = ref(null), catalogError = ref(false), activeSample = ref(null), reveal = ref(false);
const terrainError = ref(false);
const controller = new AbortController();
const submitted = ref(false), selected = ref(0);
const region = computed(() => regions.find(item => item.id === s.siteId)?.title || s.siteName);
const candidates = computed(() => submitted.value ? s.result?.candidates || [] : []);
const terrain = computed(() => candidates.value.length ? m.terrainImage('terrain') : null);
const bounds = computed(() => m.mapBounds());
const referencePoint = computed(() => {
  if (!reveal.value || !activeSample.value || !candidates.value.length) return null;
  const { lat, lng } = activeSample.value.reference;
  return m.toLocal(lat, lng);
});
const topError = computed(() => {
  if (!referencePoint.value) return null;
  const { x, y } = candidates.value[0];
  const estimate = m.toLatLng(x, y), actual = activeSample.value.reference;
  const halfLat = Math.sin((actual.lat - estimate.lat) * C.DEG / 2);
  const halfLng = Math.sin((actual.lng - estimate.lng) * C.DEG / 2);
  const haversine = halfLat ** 2 + Math.cos(estimate.lat * C.DEG) * Math.cos(actual.lat * C.DEG) * halfLng ** 2;
  return 2 * C.R * Math.asin(Math.sqrt(Math.min(1, haversine)));
});
async function loadCatalog() {
  catalogError.value = false;
  try { catalog.value = await json('data/gale/photo-samples.json', { signal: controller.signal }); }
  catch (error) { if (error.name !== 'AbortError') catalogError.value = true; }
}
async function setSource(sample) {
  activeSample.value = sample;
  terrainError.value = false;
  try { await m.setSampleTerrain(Boolean(sample)); }
  catch { if (sample === activeSample.value) terrainError.value = true; }
}
function sampleLabel(sample) {
  return '第 ' + sample.sols + ' 火星日';
}
function pinStyle(candidate) {
  const b = bounds.value;
  return {
    left: (candidate.x - b.minX) / (b.maxX - b.minX) * 100 + '%',
    top: (b.maxY - candidate.y) / (b.maxY - b.minY) * 100 + '%',
  };
}
function coordinates({ lat, lng }) {
  return Math.abs(lat).toFixed(4) + '°' + (lat < 0 ? 'S' : 'N') + ', '
    + Math.abs(lng).toFixed(4) + '°' + (lng < 0 ? 'W' : 'E');
}
function clearResults() {
  if (submitted.value && s.searching) m.cancel();
  submitted.value = false;
  reveal.value = false;
}
async function showResults() {
  selected.value = 0;
  reveal.value = false;
  submitted.value = true;
  await nextTick();
  results.value?.focus({ preventScroll: true });
  results.value?.scrollIntoView({ block: 'nearest' });
}
function closeBackdrop(event) {
  if (event.target !== dialog.value) return;
  const { top, bottom, left, right } = dialog.value.getBoundingClientRect();
  if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) dialog.value.close();
}
watch(candidates, async list => {
  if (!list.length) return;
  await nextTick();
  if (document.activeElement === results.value) results.value.scrollIntoView({ block: 'start' });
});
watchEffect(() => {
  const candidate = candidates.value[selected.value];
  if (chart.value && candidate) m.paintHorizonCurve(chart.value, candidate);
}, { flush: 'post' });
const previousTitle = document.title;
onMounted(() => {
  document.title = '火星照片定位 · Journey to the Mars';
  dialog.value.showModal();
  loadCatalog();
});
onBeforeUnmount(() => {
  controller.abort();
  document.title = previousTitle;
  clearResults();
});
</script>

<template>
  <dialog id="photo-match" ref="dialog" aria-labelledby="photo-title" @close="emit('close')" @click="closeBackdrop">
    <header class="photo-heading">
      <div>
        <p>山頂相儀</p>
        <h2 id="photo-title">這張火星照片是在哪裡拍的？</h2>
      </div>
      <button id="photo-close" type="button" autofocus aria-label="關閉照片定位頁" @click="dialog.close()">關閉 <span aria-hidden="true">×</span></button>
    </header>
    <section class="sample-gallery" aria-labelledby="sample-heading">
      <h3 id="sample-heading">試用 NASA 全景照片</h3>
      <p>選一張好奇號在蓋爾隕石坑拍攝的全景照。完成山稜比對後，可拿首選位置和 NASA 記錄的拍攝位置比較。</p>
      <div v-if="catalog" class="sample-grid">
        <button v-for="sample in catalog.samples" :key="sample.id" type="button" :data-photo-sample="sample.id"
          :aria-pressed="activeSample?.id === sample.id" @click="editor.loadSample(sample)">
          <span class="sample-thumb"><img :src="asset(sample.image)" alt=""></span>
          <span>{{ sampleLabel(sample) }} <small>{{ sample.id === 'sol-539' ? 'Dingo Gap' : '好奇號' }}</small></span>
        </button>
      </div>
      <p v-if="catalogError" role="alert">無法載入 NASA 照片。 <button type="button" @click="loadCatalog">重試</button></p>
      <p v-else-if="!catalog" role="status">正在載入照片…</p>
      <p v-if="catalog" class="sample-credit">{{ catalog.credit }} <a v-if="activeSample" id="photo-source-record" :href="activeSample.source" target="_blank" rel="noopener noreferrer">NASA 原始全景照片 ↗</a></p>
    </section>
    <p v-if="terrainError" class="load-error" role="alert">無法載入搜尋區域的地形。 <button type="button" @click="setSource(activeSample)">重新載入地形</button></p>
    <p v-else-if="s.error && !s.ready && !activeSample" class="load-error" role="alert">{{ s.error }} <button type="button" @click="m.boot">重新載入地形</button></p>
    <HorizonInput ref="editor" standalone @submitted="showResults" @edited="clearResults" @source="setSource">
      <template #terrain>
        <p class="search-region">搜尋區域 <strong>{{ region }}</strong></p>
        <details v-if="activeSample" class="calibration"><summary>全景照片的投影校準</summary>
          <p>{{ activeSample.geometryNote }} <a :href="activeSample.projectionSource" target="_blank" rel="noopener noreferrer">NASA 投影資料 ↗</a></p>
        </details>
      </template>
    </HorizonInput>

    <section v-if="submitted" ref="results" class="photo-results" tabindex="-1" aria-labelledby="photo-results-heading">
      <div class="results-heading">
        <h3 id="photo-results-heading">可能的拍攝位置</h3>
        <button v-if="s.searching" id="photo-cancel" type="button" @click="m.cancel">取消搜尋</button>
      </div>
      <p class="search-status" role="status">{{ s.status }}<template v-if="s.progress"> · {{ s.progress }}</template></p>
      <p v-if="s.result" class="result-reason">{{ s.result.reason }}</p>
      <p v-else-if="!s.searching && s.error" role="alert">{{ s.error }}</p>
      <p v-else-if="!s.searching && s.message" class="result-reason">{{ s.message }}</p>

      <div v-if="activeSample && candidates.length" class="accuracy-check">
        <button id="photo-reveal-reference" type="button" :aria-expanded="reveal" @click="reveal = !reveal">
          {{ reveal ? '收起 NASA 記錄的拍攝位置' : '與 NASA 的拍攝位置比較' }}
        </button>
        <div v-if="referencePoint" class="accuracy-result" role="status">
          <div><span>首選位置的定位誤差</span>
            <strong id="photo-position-error" :data-meters="topError">{{ Math.round(topError).toLocaleString() }} <small>m</small></strong>
          </div>
          <p>這是第 1 個候選位置到 NASA 記錄站位的距離。該站位位於 {{ coordinates(activeSample.reference) }}（Site {{ activeSample.reference.site }}、Drive {{ activeSample.reference.drive }}）。
            <a id="photo-reference-record" :href="catalog.referenceSource" target="_blank" rel="noopener noreferrer">NASA 站位紀錄 ↗</a></p>
        </div>
      </div>

      <div v-if="candidates.length" class="result-grid">
        <figure>
          <div class="terrain-map" :style="{ aspectRatio: (bounds.maxX - bounds.minX) / (bounds.maxY - bounds.minY) }">
            <img :src="terrain" alt="搜尋區域的地形高程圖">
            <span class="north" aria-hidden="true">↑ N</span>
            <span v-if="referencePoint" id="photo-reference-pin" :style="pinStyle(referencePoint)" aria-hidden="true"></span>
            <span v-for="(candidate, index) in candidates" :key="index" class="map-pin" :class="{ active: selected === index }"
              :style="pinStyle(candidate)" aria-hidden="true">{{ index + 1 }}</span>
          </div>
          <figcaption>{{ region }} · 數字標記代表候選位置。<span v-if="referencePoint" class="reference-key"><i aria-hidden="true"></i> NASA 記錄的拍攝位置</span></figcaption>
        </figure>
        <div>
          <ol id="photo-candidates" aria-label="依山稜吻合程度排序的候選位置">
            <li v-for="(candidate, index) in candidates" :key="index">
              <button type="button" :aria-pressed="selected === index" :data-lat="m.toLatLng(candidate.x, candidate.y).lat"
                :data-lng="m.toLatLng(candidate.x, candidate.y).lng" @click="selected = index">
                <span class="rank">{{ index + 1 }}</span>
                <span><strong>{{ coordinates(m.toLatLng(candidate.x, candidate.y)) }}</strong>
                  <small>山稜均方根誤差 {{ candidate.score.toFixed(3) }}° · 朝向 {{ candidate.heading.toFixed(1) }}° · 涵蓋率 {{ Math.round(candidate.coverage * 100) }}%</small></span>
              </button>
            </li>
          </ol>
          <figure class="profile"><canvas id="photo-curve" ref="chart" width="700" height="160" role="img" :aria-label="'橘線是輸入的山稜，青線是地形預測的輪廓。候選位置 ' + (selected + 1)"></canvas>
            <figcaption>橘線是照片中的山稜，青線是地形預測的輪廓。</figcaption>
          </figure>
        </div>
      </div>
    </section>
  </dialog>
</template>

<style scoped>
#photo-match {
  width: min(1100px, calc(100% - 40px)); max-width: none; max-height: calc(100dvh - 40px);
  margin: auto; padding: 0; overflow: auto; overscroll-behavior: contain;
  border: 1px solid #687e7d; border-radius: 12px; color: #e9f0eb; background: #15262a;
  box-shadow: 0 25px 90px #020b0f94;
}
#photo-match::backdrop { background: #091318dd; }
.photo-heading, .results-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.photo-heading { padding: 20px 24px; border-top: 3px solid var(--orange); border-bottom: 1px solid #395055; background: #1b3034; }
.photo-heading p { margin-bottom: 5px; color: #f5bc88; font-size: .78rem; font-weight: 650; }
.photo-heading h2 { font-size: clamp(1.35rem, 3vw, 2rem); line-height: 1.22; letter-spacing: 0; }
#photo-close { display: inline-flex; align-items: center; gap: 7px; flex-shrink: 0; min-height: 40px; }
#photo-close span { font-size: 1.15rem; line-height: 1; }
.search-region { display: flex; flex-wrap: wrap; gap: 5px 9px; margin: 12px 0; color: #bacbc9; font-size: .82rem; }
.search-region strong { color: var(--mint); }
.calibration { margin: 8px 0; color: #c4d3ce; font-size: .77rem; line-height: 1.5; }
.calibration summary { cursor: pointer; }
.sample-gallery { padding: 17px 24px 13px; border-bottom: 1px solid #395055; }
.sample-gallery > p { margin: 6px 0 10px; font-size: .84rem; line-height: 1.5; color: #cad7d3; }
.sample-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px; }
.sample-grid button { display: grid; gap: 0; padding: 0; overflow: hidden; text-align: start; border: 1px solid #4d6669; background: #1a3034; }
.sample-grid button[aria-pressed="true"] { border-color: var(--mint); box-shadow: inset 0 0 0 1px var(--mint); }
.sample-grid .sample-thumb { display: block; overflow: hidden; height: clamp(55px, 7vw, 75px); }
.sample-thumb img { display: block; width: 100%; height: 230%; object-fit: cover; object-position: 78% top; }
.sample-grid button > span:last-child { display: flex; justify-content: space-between; flex-wrap: wrap; column-gap: 7px; padding: 6px 8px; color: #e2ebe6; font-size: .88rem; font-weight: 650; }
.sample-grid small { align-self: center; color: #c0cfca; font-size: .73rem; font-weight: 400; }
.sample-gallery .sample-credit { display: flex; gap: 6px 14px; flex-wrap: wrap; color: #a8bbb6; font-size: .73rem; margin: 7px 0 0; }
.accuracy-check { margin-top: 12px; }
#photo-reveal-reference { min-height: 42px; }
.accuracy-result { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 22px; padding: 14px; margin-top: 9px; background: #1c3236; border-left: 3px solid #f1b477; }
.accuracy-result span { display: block; color: #e4e9e3; font-size: .8rem; }
.accuracy-result strong { color: #ffd1a4; font-size: 1.65rem; }
.accuracy-result strong small { font-size: .95rem; }
.accuracy-result p { flex: 1 1 210px; margin: 0; line-height: 1.55; font-size: .85rem; }
.accuracy-result a { white-space: nowrap; }
#photo-reference-pin, .reference-key i { background: #f6bb79; border: 1px solid #17282c; outline: 2px solid #f6bb79; }
#photo-reference-pin { position: absolute; z-index: 2; width: 9px; height: 9px; transform: translate(-50%, -50%) rotate(45deg); }
.reference-key { display: inline-flex; align-items: center; gap: 7px; margin-inline-start: 7px; }
.reference-key i { height: 6px; width: 6px; transform: rotate(45deg); }
.load-error, .photo-results { padding: 18px 24px 22px; }
.photo-results { border-top: 1px solid #395055; }
.search-status, .result-reason { color: #bfceca; font-size: .84rem; margin-top: 5px; }
.result-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.7fr); gap: 20px; margin-top: 14px; }
figure { margin: 0; }
.terrain-map { position: relative; margin-block: 9px; border: 1px solid #516762; border-radius: 6px; background: #142129; }
.terrain-map img { display: block; width: 100%; height: 100%; border-radius: 5px; }
.north, .map-pin { position: absolute; color: #fff; font-weight: 700; }
.north { right: 6px; top: 6px; padding: 2px 5px; background: #101b21cc; border-radius: 3px; font-size: .7rem; }
.map-pin { display: grid; place-items: center; transform: translate(-50%,-50%); width: 19px; height: 19px; font-size: .72rem; background: #13242b; border: 1px solid #d4e8e4; border-radius: 50%; }
.map-pin.active { z-index: 1; background: var(--mint); border-color: #142526; color: #142526; }
figcaption { margin-top: 5px; color: #bacbc9; font-size: .73rem; }
#photo-candidates { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
#photo-candidates button { width: 100%; display: flex; gap: 10px; align-items: center; text-align: start; }
.rank { color: var(--mint); font-weight: 700; }
#photo-candidates small { display: block; color: #c0cfcc; margin-top: 3px; }
.profile { margin-top: 12px; }
#photo-curve { border: 1px solid #395055; }
@media (max-width: 740px) {
  #photo-match { width: 100%; max-height: 100dvh; border-radius: 0; }
  .photo-heading, .load-error, .photo-results, .sample-gallery { padding: 16px; }
  .sample-grid { gap: 6px; }
  .sample-grid button > span:last-child { flex-direction: column; align-items: flex-start; gap: 3px; }
  .sample-grid small { align-self: flex-start; }
  .result-grid { grid-template-columns: 1fr; gap: 12px; }
}
</style>
