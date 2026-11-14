'use strict';
const fs=require('node:fs'),C=require('../core.js'),S=require('../skyline.js');
C.setDEM(JSON.parse(fs.readFileSync('data/jezero_dem.json','utf8')));
// Fixed before the first evaluation run. Calibration and held-out positions disjoint.
const calibration=[[-1400,-820,45],[800,600,171],[-600,1500,302]];
const heldout=[[-1200,-600,12],[-800,-1000,67],[-400,200,123],[0,-500,178],[400,900,231],[1000,-700,287],[1500,400,342],[-1800,900,99],[600,-1400,204],[1800,-1200,33]];
const boundsFor=p=>({minX:p[0]-1000,maxX:p[0]+1400,minY:p[1]-1300,maxY:p[1]+1100});
async function trial(p,kind,index){const pose={x:p[0],y:p[1],heading:p[2]},options={seed:110+index,noise:.025};if(kind==='occluded'){options.fov=60;options.occlusion=.5;}if(kind==='noise')options.noise=1.5;
 const observation=S.simulate(pose,options);let bounds=boundsFor(p);if(kind==='outside')bounds={minX:p[0]+1600,maxX:p[0]+2600,minY:p[1]+1200,maxY:p[1]+2200};
 const start=performance.now(),result=await S.search(observation,bounds),c=result.candidates[0],errors=result.candidates.map(v=>({position:C.distance(v,pose),heading:Math.abs(C.wrapRad((v.heading-pose.heading)*C.DEG))/C.DEG}));
 const hit=errors.some(e=>e.position<=100&&e.heading<=5),top1=errors[0]||{position:null,heading:null};
 return {kind,index,pose,bounds,status:result.status,reason:result.reason,top1,hit,accepted:result.status==='good',falseAccept:result.status==='good'&&!(top1.position<=100&&top1.heading<=5),milliseconds:Math.round(performance.now()-start),candidates:result.candidates};
}
(async()=>{const rows=[];for(const [kind,points] of [['calibration',calibration],['heldout',heldout],['occluded',heldout.slice(0,3)],['noise',heldout.slice(3,6)],['outside',heldout.slice(0,3)]])for(let i=0;i<points.length;i++){const row=await trial(points[i],kind,i);rows.push(row);console.log(kind,i,row.status,row.top1,row.hit,row.milliseconds+'ms');}
 const held=rows.filter(r=>r.kind==='heldout'),summary={heldoutTop3HitRate:held.filter(r=>r.hit).length/held.length,heldoutRejectRate:held.filter(r=>!r.accepted).length/held.length,falseAcceptRate:rows.filter(r=>r.falseAccept).length/rows.length,meanMilliseconds:Math.round(rows.reduce((s,r)=>s+r.milliseconds,0)/rows.length),target:.9,passed:held.filter(r=>r.hit).length/held.length>=.9};
 const report={method:'Same DEM simulation and matching; not real camera accuracy. Fixed split, no held-out threshold tuning.',demSha256:C.demInfo().original_sha256,thresholds:S.frozenThresholds,calibrationPolicy:'v1 conservative thresholds frozen before first held-out run; calibration rows reported for audit, not fit to held-out data.',summary,rows};fs.writeFileSync('artifacts/evaluation.json',JSON.stringify(report,null,2));console.log(summary);
})().catch(e=>{console.error(e);process.exitCode=1;});
