<script setup>
import {computed,inject} from 'vue';
import C from '../../core.mjs';
import {missionKey} from '../useMission';
import {layerNames,scienceGuidance} from '../layer-guidance.mjs';
import {scienceLayerIds} from '../science-layers.mjs';
const m=inject(missionKey), s=m.state;
const walkOption=computed(()=>s.walk?.alternatives.find(option=>option.id===s.walk.selectedAlternative));
const route=computed(()=>walkOption.value?.result.samples ?? s.walk?.assessment?.samples ?? (s.route?.reachable ? s.route.path : null));
const points=computed(()=>route.value?.map(p=>C.localToLatLng(p.x,p.y)) || [s.guidanceView?.center ?? {lat:s.lat,lng:s.lng}]);
function terrain(id) {
  const local=route.value || points.value.map(p=>C.latLngToLocal(p.lat,p.lng));
  if(id==='hillshade') return {text:'陰影來自模擬光源，可用來辨認坡面方向。通行門檻請對照數值坡度。'};
  if(id==='geology') return {text:'起訖地質單元：'+m.geologyAt(local[0])+' → '+m.geologyAt(local.at(-1))+'。'};
  const [read,unit,limit]=id==='slope'?[C.slopeDeg,'°',s.slope]:id==='roughness'?[C.roughness,'',s.roughnessLimit]:[C.elevation,' m',null];
  let low=Infinity,high=-Infinity,missing=false;
  for(const p of local) {
    const n=read(p.x,p.y);
    if(!Number.isFinite(n)) missing=true;
    else {low=Math.min(low,n);high=Math.max(high,n);}
  }
  const exceeded=limit!==null && high>limit;
  return {text:Number.isFinite(low)?'取樣範圍 '+low.toFixed(2)+'–'+high.toFixed(2)+unit+'。':'目前沒有有效讀值。',
    warning:[exceeded?'超出任務設定上限 '+limit+unit+'，請調整路線。':'',missing?'部分位置缺少足夠地形資料。':''].filter(Boolean).join(' '),
    advice:limit===null?'比較沿線高差時，請一併檢查坡度及高程來源。':'目前任務上限 '+limit+unit+'。'};
}
const cards=computed(()=>s.layers.map(id=>({id,...(!s.ready || s.regionLoading ? {text:'正在載入任務區域…'} : scienceLayerIds.includes(id)
  ? scienceGuidance(id,s.scienceLayers[id],points.value,!!route.value,s.guidanceView,s.navigation) : terrain(id))})));
</script>
<template>
<section class="layer-guidance" aria-label="圖層判讀與警示">
  <h3>圖層判讀與警示 · {{ cards.length }}</h3>
  <p class="hint" v-if="walkOption">依所選「{{ walkOption.name }}」沿途取樣。</p>
  <p class="hint" v-else>{{ s.walk ? route ? '依基地到 A 直線沿途取樣。' : '目前依地圖中心判讀；檢查基地到 A 後可看沿途變化。' : route ? '依目前規劃路線的節點取樣，含往返或中途停靠的路段。' : '目前依地圖中心判讀；規劃後會比較沿途節點。' }}</p>
  <article v-for="c in cards" :key="c.id" :data-layer="c.id">
    <h4>{{ layerNames[c.id] }}</h4><p v-if="c.text">{{ c.text }}</p>
    <p v-if="c.warning" class="warning" role="status">警示 · {{ c.warning }}</p>
    <p v-if="c.advice">{{ c.advice }}</p>
    <p v-for="h in c.history" :key="h.url">同格歷史測站 · {{ h.text }} <a :href="h.url" target="_blank" rel="noopener noreferrer">測溫來源 ↗</a></p>
    <a v-if="c.url" :href="c.url" target="_blank" rel="noopener noreferrer">圖層來源 ↗</a>
  </article>
</section>
</template>
<style scoped>
.layer-guidance {margin-block:16px;}
article {border-inline-start:3px solid var(--mint);background:#102127;padding:10px 13px;margin-block:8px;font-size:13px;line-height:1.6;}
h4,p {margin:0 0 4px;}
.warning {color:#ffc595;font-weight:700;}
</style>
