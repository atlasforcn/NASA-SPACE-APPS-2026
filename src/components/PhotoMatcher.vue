<script setup>
import { computed, inject, nextTick, onBeforeUnmount, onMounted, provide, ref, watch, watchEffect } from 'vue';
import C from '../../core.mjs';
import regions from '../../regions.mjs';
import { missionKey } from '../useMission';
import HorizonInput from './HorizonInput.vue';

const emit = defineEmits(['close']);
const mission = inject(missionKey);
const m = mission.createPhotoMatcher(), s = m.state;
provide(missionKey, m);
const dialog = ref(null), results = ref(null), chart = ref(null);
const submitted = ref(false), selected = ref(0);
const region = computed(() => regions.find(item => item.id === s.siteId)?.title || s.siteName);
const candidates = computed(() => submitted.value ? s.result?.candidates || [] : []);
const terrain = computed(() => candidates.value.length ? m.terrainImage('terrain') : null);
const bounds = C.LIMIT;
function pinStyle(candidate) {
  return {
    left: (candidate.x - bounds.minX) / (bounds.maxX - bounds.minX) * 100 + '%',
    top: (bounds.maxY - candidate.y) / (bounds.maxY - bounds.minY) * 100 + '%',
  };
}
function coordinates(candidate) {
  const { lat, lng } = C.localToLatLng(candidate.x, candidate.y);
  return Math.abs(lat).toFixed(4) + '°' + (lat < 0 ? 'S' : 'N') + ', '
    + Math.abs(lng).toFixed(4) + '°' + (lng < 0 ? 'W' : 'E');
}
function clearResults() {
  if (submitted.value && s.searching) m.cancel();
  submitted.value = false;
}
async function showResults() {
  selected.value = 0;
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
});
onBeforeUnmount(() => {
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
    <p v-if="s.error && !s.ready" class="load-error" role="alert">{{ s.error }} <button type="button" @click="m.boot">重新載入地形</button></p>
    <HorizonInput standalone @submitted="showResults" @edited="clearResults">
      <template #terrain><p class="search-region">搜尋區域 <strong>{{ region }}</strong></p></template>
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

      <div v-if="candidates.length" class="result-grid">
        <figure>
          <div class="terrain-map" :style="{ aspectRatio: (bounds.maxX - bounds.minX) / (bounds.maxY - bounds.minY) }">
            <img :src="terrain" alt="搜尋區域的地形高程圖">
            <span class="north" aria-hidden="true">↑ N</span>
            <span v-for="(candidate, index) in candidates" :key="index" class="map-pin" :class="{ active: selected === index }"
              :style="pinStyle(candidate)" aria-hidden="true">{{ index + 1 }}</span>
          </div>
          <figcaption>{{ region }} · 地形高程圖上的候選位置</figcaption>
        </figure>
        <div>
          <ol id="photo-candidates" aria-label="依山稜吻合程度排序的候選位置">
            <li v-for="(candidate, index) in candidates" :key="index">
              <button type="button" :aria-pressed="selected === index" @click="selected = index">
                <span class="rank">{{ index + 1 }}</span>
                <span><strong>{{ coordinates(candidate) }}</strong>
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
  .photo-heading, .load-error, .photo-results { padding: 16px; }
  .result-grid { grid-template-columns: 1fr; gap: 12px; }
}
</style>
