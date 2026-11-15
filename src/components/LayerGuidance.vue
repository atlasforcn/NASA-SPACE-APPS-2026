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
  if(id==='hillshade') return {text:'Simulated lighting reveals slope direction. Use the slope layer to check the route limit.'};
  if(id==='geology') return {text:'Geological units, start → end: '+m.geologyAt(local[0])+' → '+m.geologyAt(local.at(-1))+'.'};
  const [read,unit,limit]=id==='slope'?[C.slopeDeg,'°',s.slope]:id==='roughness'?[C.roughness,'',s.roughnessLimit]:[C.elevation,' m',null];
  let low=Infinity,high=-Infinity,missing=false;
  for(const p of local) {
    const n=read(p.x,p.y);
    if(!Number.isFinite(n)) missing=true;
    else {low=Math.min(low,n);high=Math.max(high,n);}
  }
  const exceeded=limit!==null && high>limit;
  return {text:Number.isFinite(low)?'Sample range: '+low.toFixed(2)+'–'+high.toFixed(2)+unit+'.':'No valid readings.',
    warning:[exceeded?'Exceeds mission limit of '+limit+unit+'. Adjust the route.':'',missing?'Some locations lack terrain data.':''].filter(Boolean).join(' '),
    advice:limit===null?'Check the slope and elevation source when comparing elevation changes.':'Mission limit: '+limit+unit+'.'};
}
const cards=computed(()=>s.layers.map(id=>({id,...(!s.ready || s.regionLoading ? {text:'Loading mission region…'} : scienceLayerIds.includes(id)
  ? scienceGuidance(id,s.scienceLayers[id],points.value,!!route.value,s.guidanceView,s.navigation) : terrain(id))})));
</script>
<template>
<section class="layer-guidance" aria-label="Layer readings and warnings">
  <h3>Layer readings and warnings · {{ cards.length }}</h3>
  <p class="hint" v-if="walkOption">Samples along the selected route: {{ walkOption.name }}.</p>
  <p class="hint" v-else>{{ s.walk ? route ? 'Sampled along the straight line from the base to A.' : 'Readings are for the map center. Check the route from the base to A for measurements along it.' : route ? 'Sampled along the planned route, including intermediate stops and the return leg.' : 'Readings are for the map center. Plan a route to compare its waypoints.' }}</p>
  <article v-for="c in cards" :key="c.id" :data-layer="c.id">
    <h4>{{ layerNames[c.id] }}</h4><p v-if="c.text">{{ c.text }}</p>
    <p v-if="c.warning" class="warning" role="status">Warning · {{ c.warning }}</p>
    <p v-if="c.advice">{{ c.advice }}</p>
    <p v-for="h in c.history" :key="h.url">Historical station in this cell · {{ h.text }} <a :href="h.url" target="_blank" rel="noopener noreferrer">Temperature source ↗</a></p>
    <a v-if="c.url" :href="c.url" target="_blank" rel="noopener noreferrer">Layer source ↗</a>
  </article>
</section>
</template>
<style scoped>
.layer-guidance {margin-block:16px;}
article {border-inline-start:3px solid var(--mint);background:#102127;padding:10px 13px;margin-block:8px;font-size:13px;line-height:1.6;}
h4,p {margin:0 0 4px;}
.warning {color:#ffc595;font-weight:700;}
</style>
