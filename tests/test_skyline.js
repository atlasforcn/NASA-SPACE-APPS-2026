'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),C=require('../core.js'),S=require('../skyline.js');
(async()=>{
 C.setDEM(JSON.parse(fs.readFileSync('tests/synthetic_test_grid.json','utf8')));
 const pose={x:-1400,y:-820,heading:63},a=S.simulate(pose,{seed:9}),b=S.simulate(pose,{seed:9});assert.deepEqual(a,b);assert(!('x' in a)&&!('heading' in a));
 const r=await S.search(a,{minX:-1800,maxX:-1000,minY:-1200,maxY:-400},{coarseStep:200});assert(r.candidates.length>0);assert(r.candidates.some(p=>C.distance(p,pose)<100));
 const hidden=S.simulate(pose,{fov:30,occlusion:.7});assert.equal(S.classify([{score:0,coverage:.05,overlap:1}],hidden).status,'lost');
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
