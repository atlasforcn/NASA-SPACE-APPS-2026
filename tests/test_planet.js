'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),C=require('../core.js'),P=require('../planet.js');
const b=fs.readFileSync('data/mola16.bin'),buffer=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),meta=require('../data/mola16.json'),planet=P.load(buffer,meta);
assert.equal(planet.sample(90-.5/16,.5/16),new DataView(buffer).getInt16(0,true));
assert.equal(planet.sample(0,0),planet.sample(0,360));assert.equal(planet.sample(0,180),planet.sample(0,-180));assert.equal(planet.sample(90,0),planet.sample(90,120));assert.equal(planet.sample(-90,-40),planet.sample(-90,90));assert(Number.isNaN(planet.sample(91,0)));
assert(planet.sample(18.6528,-133.8025)>10000);assert(planet.sample(-42.6,70.5)<-3000);
for(const origin of [[18.6528,-133.8025],[0,179.9],[0,-179.9],[90,0],[-90,170],[-42.6,70.5]]){const grid=planet.region(...origin);assert.equal(grid.heights.length,65*65);assert(grid.heights.every(Number.isFinite));C.setDEM(grid);assert(Math.abs(C.elevation(0,0)-planet.sample(...origin))<.02);for(const p of [{x:0,y:0},{x:12000,y:-16000},{x:-24000,y:32000}]){const ll=C.localToLatLng(p.x,p.y),back=C.latLngToLocal(ll.lat,ll.lng);assert(C.distance(p,back)<.001,JSON.stringify({origin,p,ll,back}));}const path=C.planPath({x:0,y:0},{x:8000,y:0});if(path.reachable)for(let i=1;i<path.path.length;i++)assert(C.segmentSafe(path.path[i-1],path.path[i]));}
const saved=C.LAT0;assert.throws(()=>C.setDEM({...planet.region(0,0),origin:{lat:91,lng:0}}));assert.equal(C.LAT0,saved);
C.setDEM(require('../data/jezero_dem.json'));assert.equal(C.LAT0,18.44);assert.equal(C.LIMIT.maxX,4850);assert(C.elevation(-1400,-820)<0);
console.log('Global numeric sampling, pixel centres, seam, poles, spherical frames, routes and Jezero restore passed');
