'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),C=require('../core.mjs').default,S=require('../skyline.mjs').default;
(async()=>{
 C.setDEM(JSON.parse(fs.readFileSync('tests/synthetic_test_grid.json','utf8')));
 const pose={x:-1400,y:-820,heading:63},a=S.simulate(pose,{seed:9}),b=S.simulate(pose,{seed:9});assert.deepEqual(a,b);assert(!('x' in a)&&!('heading' in a));
 const r=await S.search(a,{minX:-1800,maxX:-1000,minY:-1200,maxY:-400},{coarseStep:200});assert(r.candidates.length>0);assert(r.candidates.some(p=>C.distance(p,pose)<100));
 const hidden=S.simulate(pose,{fov:30,occlusion:.7});assert.equal(S.classify([{score:0,coverage:.05,overlap:1}],hidden).status,'lost');
 // Missing observations cannot affect matching or authorize a correction.
 const poor=S.simulate(pose,{seed:42,fov:60,occlusion:.55});
 assert(poor.valid.every((valid,i)=>valid||poor.elevations[i]===null));
 const predicted=S.profile(pose),cleanScore=S.score(predicted,poor,pose.heading);
 const poisoned={...poor,elevations:poor.elevations.map((v,i)=>poor.valid[i]?v:999)};
 assert.deepEqual(S.score(predicted,poisoned,pose.heading),cleanScore);
 const poorResult=await S.search(poor,{minX:-1800,maxX:-1000,minY:-1200,maxY:-400},{coarseStep:200});
 assert.equal(poorResult.status,'lost');
 assert(poorResult.candidates.every(c=>c.coverage<S.frozenThresholds.minCoverage));
 // Both charts use the same camera window, including the 360° seam and missing rays.
 const front=S.viewport(a,0);
 assert.equal(front[0].index,100);
 assert.equal(front[20].index,0);
 assert.equal(front[40].index,20);
 const turned=S.viewport(a,30);
 assert.equal(turned[20].index,10);
 assert.deepEqual(S.viewport(a,390),turned.map(v=>({...v,angle:v.angle+360})));
 for(const ray of S.viewport(poor,0)) {
  assert.equal(ray.elevation,poor.elevations[ray.index]);
  assert.equal(ray.valid,poor.valid[ray.index]&&Number.isFinite(ray.elevation));
 }
 // The map highlight must identify the sample forming the skyline, including curvature.
 for(const curvature of [false,true]) {
  const options={curvature},point=S.horizonPoint(pose,pose.heading,options);
  assert(point);
  const obs=S.simulate(pose,{...options,noise:0});
  assert(Math.abs(point.angle-obs.elevations[0])<1e-10);
  assert(Math.abs(C.distance(pose,point)-point.distance)<1e-8);
  const eye=C.elevation(pose.x,pose.y)+S.defaults.cameraHeight,t=pose.heading*C.DEG;
  for(let d=S.defaults.rayStep;d<=S.defaults.maxRange;d+=S.defaults.rayStep) {
   const z=C.elevation(pose.x+d*Math.sin(t),pose.y+d*Math.cos(t));
   if(!Number.isFinite(z))break;
   const angle=Math.atan2(z-eye-(curvature?d*d/(2*C.R):0),d)/C.DEG;
   assert(angle<=point.angle+1e-10);
  }
 }
 const flat={...a,elevations:a.elevations.map(()=>0),valid:a.valid.map(()=>true)};assert.equal(S.classify([{score:0,coverage:1,overlap:1},{score:1,coverage:1,overlap:1}],flat).status,'uncertain');
 await assert.rejects(S.search(a,{minX:0,maxX:400,minY:0,maxY:400},{cancelled:()=>true}),/cancelled/);
 await assert.rejects(S.search({...a,angles:[1]},C.LIMIT),/Invalid horizon/);
 assert.equal(C.planPath({x:-99999,y:0},{x:0,y:0}).reachable,false);
 assert.equal(C.planPath({x:-1400,y:-820},{x:99999,y:0}).reachable,false);
 const path=C.planPath({x:-1400,y:-820},{x:-1200,y:-600});assert(path.reachable);for(let i=1;i<path.path.length;i++)assert(C.segmentSafe(path.path[i-1],path.path[i]));assert(Number.isFinite(path.maxSlope));
 const hole=JSON.parse(fs.readFileSync('tests/synthetic_test_grid.json','utf8'));let col=Math.round((-1400-hole.xMin)/(hole.xMax-hole.xMin)*(hole.width-1)),row=Math.round((hole.yMax+820)/(hole.yMax-hole.yMin)*(hole.height-1));
 // A missing patch away from required starting point cannot be crossed by an endpoint connector.
 for(let y=row-2;y<=row+2;y++)for(let x=col+5;x<=col+8;x++)hole.heights[y*hole.width+x]=null;C.setDEM(hole);const bad={x:hole.xMin+(col+6)*(hole.xMax-hole.xMin)/(hole.width-1),y:hole.yMax-row*(hole.yMax-hole.yMin)/(hole.height-1)};assert(!C.segmentSafe(bad,bad));assert(!C.planPath(pose,bad).reachable);
 console.log('Skyline simulation, search, refusal, cancellation and route segment tests passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
