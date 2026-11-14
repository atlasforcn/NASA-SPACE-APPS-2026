'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),C=require('../core.mjs').default,P=require('../planet.mjs').default;
const b=fs.readFileSync('data/mola16.bin'),buffer=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),meta=require('../data/mola16.json'),planet=P.load(buffer,meta);
assert.equal(planet.sample(90-.5/16,.5/16),new DataView(buffer).getInt16(0,true));
assert.equal(planet.sample(0,0),planet.sample(0,360));assert.equal(planet.sample(0,180),planet.sample(0,-180));assert.equal(planet.sample(90,0),planet.sample(90,120));assert.equal(planet.sample(-90,-40),planet.sample(-90,90));assert(Number.isNaN(planet.sample(91,0)));
assert(planet.sample(18.6528,-133.8025)>10000);assert(planet.sample(-42.6,70.5)<-3000);
for(const origin of [[18.6528,-133.8025],[0,179.9],[0,-179.9],[90,0],[-90,170],[-42.6,70.5]]){const grid=planet.region(...origin);assert.equal(grid.heights.length,129*129);assert(grid.heights.every(Number.isFinite));assert.equal(grid.xMax-grid.xMin,512000);C.setDEM(grid);assert(Math.abs(C.elevation(0,0)-planet.sample(...origin))<.02);for(const p of [{x:0,y:0},{x:12000,y:-16000},{x:-24000,y:32000}]){const ll=C.localToLatLng(p.x,p.y),back=C.latLngToLocal(ll.lat,ll.lng);assert(C.distance(p,back)<.001,JSON.stringify({origin,p,ll,back}));}const path=C.planPath({x:0,y:0},{x:8000,y:0});if(path.reachable)for(let i=1;i<path.path.length;i++)assert(C.segmentSafe(path.path[i-1],path.path[i]));}
// Regional peak detection must identify separated DEM highs at kilometre scale.
C.setDEM(planet.region(18.44,77.42));
assert(C.FEATURES.length>0&&C.FEATURES.length<=7);
for(const [i,f] of C.FEATURES.entries()){
 assert(C.validDEMPoint(f.x,f.y));
 assert(f.status.includes('MOLA'));
 assert(f.width>=4000);
 for(const g of C.FEATURES.slice(0,i))assert(C.distance(f,g)>=12000);
}
// Far targets, poles and the date line remain selectable in adaptive grids.
for(const points of [
 [{lat:18.44,lng:77.42},{lat:18.65,lng:-133.8}],
 [{lat:0,lng:179.9},{lat:0,lng:-179.9}],
 [{lat:89,lng:10},{lat:-80,lng:160}],
]){
 const grid=planet.region(0,90,points);C.setDEM(grid);
 assert.equal(grid.heights.length,129*129);
 assert(grid.heights.every(Number.isFinite));
 for(const p of points){const q=C.latLngToLocal(p.lat,p.lng);assert(C.validDEMPoint(q.x,q.y));assert(!C.risk(q.x,q.y).unknown,'Expanded grids retain room for slope and roughness stencils');}
 assert(grid.source.sample_step_m>=4000);
}
const saved=C.LAT0;assert.throws(()=>C.setDEM({...planet.region(0,0),origin:{lat:91,lng:0}}));assert.equal(C.LAT0,saved);
// Opposite hemispheres and both poles must fit without projection singularities.
for(const points of [
 [{lat:0,lng:0},{lat:0,lng:180}],
 [{lat:90,lng:0},{lat:-90,lng:0}],
 [{lat:0,lng:0},{lat:0,lng:90},{lat:0,lng:180},{lat:0,lng:-90},{lat:90,lng:0},{lat:-90,lng:0}],
]){
 const origin=P.coverageOrigin(points),grid=planet.region(origin.lat,origin.lng,points);C.setDEM(grid);
 for(const p of points){const q=C.latLngToLocal(p.lat,p.lng);assert(Number.isFinite(q.x)&&Number.isFinite(q.y));assert(C.validDEMPoint(q.x,q.y));assert(!C.risk(q.x,q.y).unknown);}
}
C.setDEM(require('../data/jezero-extended/dem.json'));assert.equal(C.LAT0,18.44);assert.equal(C.LIMIT.maxX,15000);assert(C.elevation(-1400,-820)<0);
console.log('Global numeric sampling, pixel centres, seam, poles, spherical frames, routes and Jezero restore passed');
