'use strict';
const fs=require('fs');const assert=require('node:assert/strict');const c=require('./core.mjs').default;
const fixture=JSON.parse(fs.readFileSync('./tests/synthetic_test_grid.json','utf8'));
let n=0;const test=(s,f)=>{f();console.log('✓',s);n++};
test('Demo starts synthetic and can load real-format numerical grid',()=>{
 assert.equal(c.demInfo(),null);const result=c.setDEM(fixture);
 assert(result.validCount>10000);assert.equal(result.metadata.source_crs_wkt.includes('Mars'),false);assert.equal(c.demInfo().id,fixture.source.id);
});
test('Elevation uses numeric raster rather than analytic fallback',()=>{
 const h=c.elevation(-1400,-820),expected=-2500+.006*(-1400)+.007*(-820);
 assert(Math.abs(h-expected)<3, `${h} versus ${expected}`);
});
test('DEM samples invalid outside footprint and risk blocks missing height',()=>{
 assert(Number.isNaN(c.demAt(6000,0)));
 assert(c.risk(6000,0).blocked);
});
test('Slope and local roughness use sampled numerical elevations',()=>{
 const s=c.slopeDeg(-1400,-820);assert(s>.1 && s<5,s);
 assert(Number.isFinite(c.roughness(-1400,-820)));
});
test('Topography peaks become DEM-derived candidate features',()=>{
 assert(c.FEATURES.length>=3, c.FEATURES.length);
 assert(c.FEATURES.every(x=>x.name.includes('DEM 候選峰')));
});
test('DEM-aware line-of-sight geometry uses sampled heights',()=>{
 const g=c.featureGeometry({x:-1400,y:-820},c.FEATURES[0]);assert(Number.isFinite(g.elevation));
});
test('A* can still traverse DEM risks',()=>{
 const r=c.planPath({x:-1400,y:-820},{x:2200,y:780},90);
 assert(r.reachable,'No path generated through test raster');
});
test('Local DEM and MOLA fallback share a route without replacing the local grid',()=>{
 const local=c.demAt(0,0);
 c.setMolaFallback(()=>-2500,{minX:-10000,maxX:10000,minY:-8000,maxY:8000});
 assert.equal(c.heightSource(0,0),'DEM');
 assert.equal(c.elevation(0,0),local);
 assert.equal(c.heightSource(6000,0),'MOLA');
 assert.equal(c.elevation(6000,0),-2500);
 assert(c.planPath({x:2200,y:0},{x:6000,y:0}).reachable);
 assert(Number.isNaN(c.elevation(11000,0)));
 c.clearMolaFallback();
 assert(Number.isNaN(c.elevation(6000,0)));
});
test('Loader rejects impossible input and rolls back to current DEM',()=>{
 const bad={...fixture,heights:fixture.heights.slice(3)};
 assert.throws(()=>c.setDEM(bad));assert(c.demInfo());
});
test('Clear returns to synthetic fallback',()=>{c.clearDEM();assert.equal(c.demInfo(),null);assert.equal(c.FEATURES.length,7);});
console.log('All '+n+' DEM tests passed');
