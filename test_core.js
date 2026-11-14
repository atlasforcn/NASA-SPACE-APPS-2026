'use strict';
const assert=require('node:assert/strict');
const c=require('./core.js');
function test(name,fn){try{fn();console.log('✓',name);}catch(err){console.error('✗',name);throw err;}}
test('Mars lat/lng local projection round trip',()=>{for(const p of [{x:0,y:0},{x:2500,y:-1200},{x:-4400,y:3100}]){const ll=c.localToLatLng(p.x,p.y),back=c.latLngToLocal(ll.lat,ll.lng);assert(c.distance(p,back)<1e-5);}});
test('All analytic DEM & risk outputs are finite',()=>{for(let x=-4500;x<=4500;x+=900)for(let y=-3300;y<=3300;y+=1100){assert(Number.isFinite(c.elevation(x,y)));const r=c.risk(x,y);assert(Number.isFinite(r.cost));assert(r.slope>=0);}});
test('A* returns connected, substantial route',()=>{const start={x:-1400,y:-820},goal={x:2200,y:780},p=c.planPath(start,goal);assert(p.reachable&&p.path.length>=2);assert(c.distance(p.path[0],start)<1);assert(c.distance(p.path.at(-1),goal)<1);assert(p.length>=c.distance(start,goal));});
test('All three demo destinations are reachable',()=>{for(const goal of [{x:2200,y:780},{x:-2250,y:1100},{x:1000,y:-2300}]){const p=c.planPath({x:-1400,y:-820},goal);assert(p.reachable);for(const n of p.path.slice(1,-1))assert(!c.risk(n.x,n.y).blocked);}});
test('A* reports blocked hazard as risk',()=>{assert(c.risk(-150,350).blocked);});
test('Feature apparent angular size decreases with distance',()=>{assert(c.apparentSizeDeg(130,500)>c.apparentSizeDeg(130,2500));});
test('Descriptor association discards distractors',()=>{const pairs=c.associate(c.captureObservations({x:-1400,y:-820},45));assert.equal(pairs.pairs.length,7);assert.equal(pairs.unmatched.length,1);});
test('Multi-peak nonlinear pose matching corrects GPS-less drift',()=>{for(const real of [{x:-1400,y:-820,heading:45},{x:1200,y:-250,heading:175},{x:-650,y:1100,heading:300}]){const m=c.associate(c.captureObservations(real,real.heading));const est=c.refinePose(m.pairs,{x:real.x+520,y:real.y-360,heading:real.heading+18});assert(est.ok,JSON.stringify(est));assert(c.distance(real,est)<35,'position error='+c.distance(real,est));assert(Math.abs(c.wrapRad((est.heading-real.heading)*c.DEG)/c.DEG)<1);}});
test('Underconstrained pose returns need_3',()=>{assert.equal(c.refinePose([], {x:0,y:0,heading:0}).ok,false);});
console.log('\nAll 9 core tests passed.');
