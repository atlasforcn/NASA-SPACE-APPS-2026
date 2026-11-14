import fs from 'node:fs';
import assert from 'node:assert/strict';
import C from '../core.mjs';
const grid=JSON.parse(fs.readFileSync('data/gale/dem.json','utf8'));
assert.equal(grid.schema,'mars-local-grid-v1');
assert.equal(grid.source.sample_step_m,20);
assert.equal(grid.heights.length,501*501);
C.setDEM(grid);
assert.equal(C.LAT0,-4.59);
assert.equal(C.LON0,137.44);
assert(C.elevation(0,0)<-4000&&C.elevation(0,0)>-5000);
for(const p of [{x:0,y:0},{x:2100,y:-3500},{x:-4500,y:3000}]) {
  const ll=C.localToLatLng(p.x,p.y), back=C.latLngToLocal(ll.lat,ll.lng);
  assert(C.distance(p,back)<1e-6);
  assert(Number.isFinite(C.elevation(p.x,p.y)));
}
assert(Number.isNaN(C.elevation(5001,0)));
const saved=C.demInfo();
assert.throws(()=>C.setDEM({...grid,origin:{lat:90,lng:0}}));
assert.equal(C.demInfo().title,saved.title);
assert.equal(C.LAT0,-4.59);
C.setDEM(JSON.parse(fs.readFileSync('data/jezero-extended/dem.json','utf8')));
assert.equal(C.LAT0,18.44);
assert.equal(C.LIMIT.maxX,15000);
console.log('Gale numeric DEM, local Mars frame, invalid origin rollback and Jezero restore passed.');
