import assert from 'node:assert/strict';
import C from '../core.mjs';
import { energyStep, segmentEnergy } from '../energy-model.mjs';
import { buildItinerary, measureRoute } from '../src/routePlanner.mjs';
C.clearDEM(); C.setSlopeLimit(24);
const start = {x:-1400,y:-820}, stop = {x:-1000,y:-700,name:'採樣點'}, goal = {x:2200,y:780,name:'終點'};
const options = {speedKmh:3,riskWeight:2,highSlope:5,roundTrip:true,stopMinutes:20,budgetHours:8};
const plan = buildItinerary(start,[stop,goal],options);
for (const route of Object.values(plan)) {
  assert(route.reachable);
  assert.equal(route.legs.length,3);
  assert.deepEqual(route.path[0],start);
  assert(C.distance(route.path.at(-1),start)<1e-6);
  assert.deepEqual(route.stopIndices.slice(0,2).map(i => ({x:route.path[i].x,y:route.path[i].y})),[stop,goal].map(({x,y})=>({x,y})));
  assert(route.path.every((p,i,path)=>!i || C.segmentSafe(path[i-1],p)));
  assert(Math.abs(route.totalHours-route.hours-40/60)<1e-8);
  assert.equal(route.legs.at(-1).stopMinutes,0);
  assert(route.surface>=route.length && route.gain>0 && route.loss>0);
  const sampled = measureRoute(route.path, options);
  for (const key of ['energy', 'materialEnergy', 'unknownMaterialDistance', 'length', 'surface', 'gain', 'loss', 'maxSlope', 'steep', 'riskDistance', 'hours', 'riskScore'])
    assert(Math.abs(route[key] - sampled[key]) < 1e-6, `${key} must match full-path sampling`);
}
assert(plan.shortest.surface<=plan.safer.surface+1e-6);
assert(plan.safer.riskDistance<=plan.shortest.riskDistance+1e-6);
const fast=measureRoute(plan.shortest.path,{speedKmh:6});
assert(Math.abs(fast.hours*2-plan.shortest.hours)<1e-8);
const tiny=buildItinerary(start,[goal],{...options,budgetHours:0.01});
assert(tiny.shortest.marginHours<0);
const blocked=buildItinerary(start,[{x:50000,y:50000,name:'越界'}],options);
assert(!blocked.shortest.reachable && !blocked.safer.reachable);
assert.equal(blocked.shortest.failedStop,'越界');
assert.throws(()=>buildItinerary(start,[goal],{speedKmh:0}));
assert.throws(()=>buildItinerary(start,[goal],{budgetHours:NaN}));
console.log('Dual objective routes, safety, ordered stops, return leg, walking times, budgets and failure handling passed');

// A low, rough mound is passable by slope alone. The roughness hard limit
// must block it for both objectives, without permitting diagonal shortcuts.
const size = 81, heights = [];
for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
  const x = -4000 + i*100, y = 4000-j*100;
  heights.push(30*Math.exp(-x*x/40000-y*y/640000));
}
C.setDEM({schema:'mars-local-grid-v1',crs:'MARS_EQ_LOCAL_TANGENT',origin:{lat:18.44,lng:77.42},width:size,height:size,xMin:-4000,xMax:4000,yMin:-4000,yMax:4000,heights,source:{url:'https://example.invalid/test-dem',sample_step_m:100}});
C.setSlopeLimit(24); C.setRoughnessLimit(1);
const a = {x:-3000,y:0}, b = {x:3000,y:0,name:'粗糙地形後方'};
assert(C.segmentSafe(a,b));
const baseline = buildItinerary(a,[b],options).shortest;
C.setRoughnessLimit(0.2);
assert(C.risk(0,0).blocked);
assert(!C.segmentSafe(a,b));
const detours = buildItinerary(a,[b],options);
for (const route of Object.values(detours)) {
  assert(route.reachable);
  assert(route.path.every((p,i,path)=>!i || C.segmentSafe(path[i-1],p)));
  assert(route.path.every(p=>C.risk(p.x,p.y).rough<=0.2));
  assert(route.length>baseline.length);
}
const rejected = buildItinerary(a,[{x:0,y:0,name:'危險區內'}],options);
assert(!rejected.shortest.reachable && !rejected.safer.reachable);
assert.throws(()=>C.setRoughnessLimit(NaN));
assert.throws(()=>C.setRoughnessLimit(-0.1));
C.setRoughnessLimit(1);
assert(energyStep(100,10)>energyStep(100,0));
assert(energyStep(100,-10)<energyStep(100,0));
assert(energyStep(100,-100)>0);
assert.equal(energyStep(0,0),0);
const energyOptions={...options,roundTrip:false,uphillPenalty:100,downhillSaving:5};
const energyPlan=buildItinerary(a,[b],energyOptions);
assert(energyPlan.energy.reachable);
assert(energyPlan.energy.energy<energyPlan.shortest.energy);
assert(energyPlan.energy.surface>energyPlan.shortest.surface);
assert(energyPlan.energy.path.every((p,i,path)=>!i || C.segmentSafe(path[i-1],p)));
assert.equal(energyPlan.energy.energy,measureRoute(energyPlan.energy.path,energyOptions).energy);
const down=[{x:0,y:0},{x:300,y:0}];
assert(measureRoute(down).energy<measureRoute([...down].reverse()).energy);
const zeroCoefficients=buildItinerary(a,[b],{...options,uphillPenalty:0,downhillSaving:0});
assert(Math.abs(zeroCoefficients.energy.energy-zeroCoefficients.shortest.surface)<1e-6);
assert.throws(()=>buildItinerary(a,[b],{uphillPenalty:-1}));
assert.throws(()=>buildItinerary(a,[b],{downhillSaving:NaN}));
// Independent Dijkstra oracle on a small DEM verifies the energy A* heuristic,
// including cheaper downhill edges and the diagonal corner constraints.
const small=Array.from({length:81},(_,id)=>15*Math.exp(-((id%9-4)**2+(Math.floor(id/9)-4)**2)/2));
C.setDEM({schema:'mars-local-grid-v1',crs:'MARS_EQ_LOCAL_TANGENT',origin:{lat:18,lng:77},width:9,height:9,xMin:-400,xMax:400,yMin:-400,yMax:400,heights:small,source:{url:'https://example.invalid/energy-test'}});
const coordinate=id=>({x:-400+(id%9)*100,y:-400+Math.floor(id/9)*100});
const startId=38, goalId=42, distances=Array(81).fill(Infinity),visited=new Set();
distances[startId]=0;
while(visited.size<81){
  let id=-1;
  for(let i=0;i<81;i++)if(!visited.has(i)&&(id<0||distances[i]<distances[id]))id=i;
  if(id<0||!Number.isFinite(distances[id]))break;
  visited.add(id);
  for(const dx of [-1,0,1])for(const dy of [-1,0,1]){
    const x=id%9+dx,y=Math.floor(id/9)+dy,next=y*9+x;
    if((!dx&&!dy)||x<0||x>=9||y<0||y>=9||visited.has(next))continue;
    if(dx&&dy&&(C.risk(coordinate(Math.floor(id/9)*9+x).x,coordinate(Math.floor(id/9)*9+x).y).blocked||C.risk(coordinate(y*9+id%9).x,coordinate(y*9+id%9).y).blocked))continue;
    if(!C.segmentSafe(coordinate(id),coordinate(next)))continue;
    const cost=segmentEnergy(coordinate(id),coordinate(next),C.elevation,100/3,energyOptions);
    distances[next]=Math.min(distances[next],distances[id]+cost);
  }
}
const optimum=C.planPath(coordinate(startId),coordinate(goalId),100,{...energyOptions,mode:'energy'});
assert(optimum.reachable);
assert(Math.abs(measureRoute(optimum.path,energyOptions).energy-distances[goalId])<1e-6);
C.clearDEM();
console.log('Slope energy: directed costs, hill detours, model validation and independent optimality oracle passed');
console.log('Both route objectives avoid roughness exclusions and reject blocked endpoints');
