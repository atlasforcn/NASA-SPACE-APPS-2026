/* Numeric skyline localisation. No simulator truth enters search(). */
import C from './core.mjs';
const api = (() => {
'use strict';
const defaults={angleStep:3,rayStep:80,maxRange:6000,cameraHeight:1.7};
function profile(position,options={}){
 const o={...defaults,...options},angles=[],elevations=[],valid=[];
 const base=C.elevation(position.x,position.y)+o.cameraHeight;
 for(let a=0;a<360;a+=o.angleStep){let top=-90,samples=0,reached=0;const t=a*C.DEG;
  for(let r=o.rayStep;r<=o.maxRange;r+=o.rayStep){const z=C.elevation(position.x+r*Math.sin(t),position.y+r*Math.cos(t));if(!Number.isFinite(z))break;top=Math.max(top,Math.atan2(z-base-(o.curvature?r*r/(2*C.R):0),r)/C.DEG);samples++;reached=r;}
  angles.push(a);elevations.push(samples&&Number.isFinite(base)?top:null);valid.push(Number.isFinite(base)&&reached>=Math.min(1200,o.maxRange));
 }
 return {angles,elevations,valid,cameraHeight:o.cameraHeight,options:o};
}
function rng(seed){let s=seed>>>0;return ()=>{s=(1664525*s+1013904223)>>>0;return s/4294967296;};}
function simulate(pose,options={}){
 const {seed=42,noise=.025,fov=360,occlusion=0,...o}=options,p=profile(pose,o),random=rng(seed),n=p.angles.length;
 // Generate at actual yaw, not a rounded cyclic index: search cannot read yaw.
 const base=C.elevation(pose.x,pose.y)+p.cameraHeight;
 for(let i=0;i<n;i++){const a=(p.angles[i]+pose.heading)*C.DEG;let top=-90,reached=0;
  for(let r=p.options.rayStep;r<=p.options.maxRange;r+=p.options.rayStep){const z=C.elevation(pose.x+r*Math.sin(a),pose.y+r*Math.cos(a));if(!Number.isFinite(z))break;top=Math.max(top,Math.atan2(z-base-(p.options.curvature?r*r/(2*C.R):0),r)/C.DEG);reached=r;}
  p.valid[i]=Number.isFinite(base)&&reached>=1200&&Math.min(p.angles[i],360-p.angles[i])<=fov/2&&random()>=occlusion;
  p.elevations[i]=p.valid[i]?top+(random()-.5)*2*noise:null;
 }
 return {...p,kind:'simulated-dem-horizon',seed};
}
function score(p,obs,yaw){const n=p.angles.length,shift=yaw/(360/n);let sum=0,count=0,obsCount=0;
 for(let i=0;i<n;i++){if(!obs.valid[i]||!Number.isFinite(obs.elevations[i]))continue;obsCount++;const q=(i+shift+n*2)%n,j=Math.floor(q),k=(j+1)%n,f=q-j;if(!p.valid[j]||!p.valid[k])continue;const predicted=p.elevations[j]*(1-f)+p.elevations[k]*f,d=predicted-obs.elevations[i];sum+=Math.min(d*d,25);count++;}
 return {score:count?Math.sqrt(sum/count):Infinity,coverage:count/n,overlap:obsCount?count/obsCount:0};
}
function distinct(sorted,limit=3,separation=180){const out=[];for(const c of sorted){if(out.some(v=>C.distance(v,c)<separation&&Math.abs(C.wrapRad((v.heading-c.heading)*C.DEG))/C.DEG<12))continue;out.push(c);if(out.length===limit)break;}return out;}
function validate(obs,bounds){if(!obs||!Array.isArray(obs.angles)||obs.angles.length<12||obs.angles.length!==obs.elevations.length||obs.angles.length!==obs.valid.length)throw Error('Invalid horizon observation');const step=360/obs.angles.length;if(obs.angles.some((v,i)=>Math.abs(v-i*step)>1e-6))throw Error('Expected uniform full-circle angle grid');if(!bounds||!['minX','maxX','minY','maxY'].every(k=>Number.isFinite(bounds[k]))||bounds.maxX<bounds.minX||bounds.maxY<bounds.minY)throw Error('Invalid search bounds');}
const frozenThresholds={version:'v1',maxRms:.20,minCoverage:.50,minOverlap:.95,minGap:.04,minRelief:.20};
function classify(candidates,obs,thresholds=frozenThresholds){const c=candidates[0];if(!c||!Number.isFinite(c.score))return {status:'lost',reason:'沒有有效候選'};const vals=obs.elevations.filter((v,i)=>obs.valid[i]&&Number.isFinite(v)),relief=vals.length?Math.max(...vals)-Math.min(...vals):0,gap=candidates.length>1?candidates[1].score-c.score:0;
 if(c.coverage<thresholds.minCoverage||c.overlap<thresholds.minOverlap)return {status:'lost',reason:'有效觀測視角或共同覆蓋不足'};
 if(c.score>thresholds.maxRms)return {status:'lost',reason:'觀測與候選地形不相符'};
 if(relief<thresholds.minRelief||gap<thresholds.minGap)return {status:'uncertain',reason:'地形特徵不足或存在相似候選'};
 return {status:'good',reason:'殘差、覆蓋與候選差距通過門檻'};
}
async function search(obs,bounds,options={}){
 validate(obs,bounds);const {coarseStep=200,onProgress=()=>{},cancelled=()=>false,cache=new Map(),candidateSeparation=180,thresholds=frozenThresholds}=options;
 const all=[],step=360/obs.angles.length,settings={...obs.options,angleStep:step,cameraHeight:obs.cameraHeight};
 function get(x,y){const key=JSON.stringify([x,y,settings]);if(!cache.has(key))cache.set(key,profile({x,y},settings));return cache.get(key);}
 let done=0;const total=(Math.floor((bounds.maxX-bounds.minX)/coarseStep)+1)*(Math.floor((bounds.maxY-bounds.minY)/coarseStep)+1);
 for(let y=bounds.minY;y<=bounds.maxY;y+=coarseStep)for(let x=bounds.minX;x<=bounds.maxX;x+=coarseStep){if(cancelled())throw Error('cancelled');const p=get(x,y);let best={score:Infinity};for(let h=0;h<360;h+=step){const s=score(p,obs,h);if(s.overlap>=.90&&s.score<best.score)best={x,y,heading:h,...s};}if(Number.isFinite(best.score))all.push(best);done++;if(done%20===0){onProgress(done/total*.75);await new Promise(r=>setTimeout(r,0));}}
 let seeds=distinct(all.sort((a,b)=>a.score-b.score),8,candidateSeparation),refined=[];
 for(const seed of seeds){let best=seed;
  for(const delta of [coarseStep/4,coarseStep/16,coarseStep/64]){const centre=best;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const x=centre.x+dx*delta,y=centre.y+dy*delta;if(x<bounds.minX||x>bounds.maxX||y<bounds.minY||y>bounds.maxY)continue;const p=get(x,y);for(let dh=-2;dh<=2;dh++){const heading=C.modDeg(centre.heading+dh*step*(delta/(coarseStep/4))),s=score(p,obs,heading);if(s.overlap>=.90&&s.score<best.score)best={x,y,heading,...s};}}if(cancelled())throw Error('cancelled');await new Promise(r=>setTimeout(r,0));}
  refined.push(best);
 }
 const candidates=distinct([...refined,...all].sort((a,b)=>a.score-b.score),3,candidateSeparation);onProgress(1);return {candidates,...classify(candidates,obs,thresholds),thresholds};
}
return {profile,simulate,score,search,classify,defaults,frozenThresholds};
})();
export default api;
