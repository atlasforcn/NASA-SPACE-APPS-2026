import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import C from '../core.mjs';
import {scienceCell,decodeScienceGrid} from '../src/science-layers.mjs';
import {buildItinerary,measureRoute} from '../src/routePlanner.mjs';

const json = file => JSON.parse(readFileSync(file,'utf8'));
const mission = json('data/mission.json');
const local = json('data/jezero-extended/dem.json');
const features = json('data/geology.json').features;
C.setDEM(local);
const [a,b] = mission.targets;
assert.equal(C.distance(a,b),1600);
const coords = mission.targets.map(s=>C.localToLatLng(s.x,s.y));
for (const station of mission.targets) {
  assert(Number.isFinite(C.demAt(station.x,station.y)));
  const feature = features.find(f=>f.properties.OBJECTID===station.sourceObjectId);
  assert.equal(feature.properties.symbol,station.symbol);
  let inside = false;
  for (const ring of feature.rings) for (let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const [x,y]=ring[i],[xx,yy]=ring[j];
    if ((y>station.y)!==(yy>station.y) && station.x<(xx-x)*(station.y-y)/(yy-y)+x) inside=!inside;
  }
  assert(inside);
}
assert.equal(a.observation,b.observation);
for (const [id,meta] of Object.entries(json('data/science/manifest.json').datasets)) {
  if (meta.kind!=='raster') continue;
  const bytes = readFileSync('data/science/'+id+'.bin');
  const values = decodeScienceGrid(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),meta);
  const cells = coords.map(p=>scienceCell(meta,values,p.lat,p.lng));
  assert.deepEqual(cells[0],cells[1]);
  assert(Number.isFinite(cells[0].value));
}
const meta={kind:'raster',width:4,height:2}, data=new Float32Array([1,1,1,1,NaN,1,1,1]);
assert.notEqual(scienceCell(meta,data,30,-91).col,scienceCell(meta,data,30,-89).col);
assert.deepEqual(scienceCell(meta,data,-30,-180),scienceCell(meta,data,-30,180));
assert.equal(scienceCell(meta,data,-30,-180).value,null);
const route = buildItinerary(mission.start,[{...a,stopMinutes:7},b],{roundTrip:true,budgetHours:0.1}).shortest;
assert(route.reachable && route.marginHours<0);
assert.deepEqual(route.legs.map(l=>l.stopMinutes),[7,15,0]);
assert.equal(route.molaDistance,0);
assert(route.legs.every(l=>l.terrainSegments.every(t=>t.cellMeters===40)));
const grid={...local, width:11,height:11,xMin:-200,xMax:200,yMin:-200,yMax:200,heights:Array(121).fill(1200)};
C.setDEM(grid);
const path=[{x:0,y:0},{x:400,y:0}];
assert.equal(measureRoute(path),null);
C.setMolaFallback(()=>-2600,{minX:-8000,maxX:8000,minY:-8000,maxY:8000},4000);
const mixed=measureRoute(path);
assert(mixed.molaDistance>0 && mixed.seamDistance>0);
assert.equal(mixed.gain+mixed.loss,0);
assert.equal(mixed.energy,mixed.length);
assert(Number.isNaN(C.roughness(400,0)));
C.clearMolaFallback();
C.setDEM({...grid,schema:'mars-region-grid-v1',crs:'MARS_AZIMUTHAL_EQUIDISTANT',source:{url:'fixture',id:'MOLA_MEGDR_16PPD'},xMin:-20000,xMax:20000,yMin:-20000,yMax:20000});
const coarse=measureRoute(path);
assert.equal(coarse.molaDistance,coarse.length);
assert(coarse.terrainSegments.every(s=>!s.roughnessAvailable && s.cellMeters===4000));
console.log('Jezero station evidence, cell identity, dwell times and terrain coverage passed.');
