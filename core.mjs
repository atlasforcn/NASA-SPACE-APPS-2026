import { segmentEnergy, minimumEnergyRatio, validateEnergyOptions } from './energy-model.mjs';
/* 山頂相儀 — simulation math core. Units: metres in a local Mars tangent plane, radians for solvers. */
const api = (() => {
'use strict';
const R=3396190, DEG=Math.PI/180;
let LAT0=18.44,LON0=77.42,regionalProjection=false;
const FEATURES=[
 {id:'P1',name:'蒼穹稜線 α',x:-3090,y:2060,width:190,code:0.18,status:'高反差山脊，可辨識雙峰輪廓',kind:'峰頂'},
 {id:'P2',name:'峽口主峰 β',x:1770,y:2650,width:155,code:0.32,status:'模擬鬆散碎石區，接近時需避開',kind:'峰頂'},
 {id:'P3',name:'東側錐丘 γ',x:3790,y:830,width:220,code:0.46,status:'地標辨識度高，適合遠距方位量測',kind:'錐丘'},
 {id:'P4',name:'南境高台 δ',x:2720,y:-2280,width:175,code:0.59,status:'模擬高坡度風險，禁止直接穿越',kind:'高台'},
 {id:'P5',name:'沙海孤峰 ε',x:-840,y:-2770,width:130,code:0.71,status:'表面紋理受風沙影響，辨識信心較低',kind:'孤峰'},
 {id:'P6',name:'西翼岩柱 ζ',x:-3880,y:-1020,width:150,code:0.83,status:'模擬清楚的幾何邊緣可作特徵點',kind:'岩柱'},
 {id:'P7',name:'中央岩丘 η',x:420,y:1240,width:125,code:0.94,status:'近距離特徵，適合視差估計',kind:'岩丘'}
];
const SYNTHETIC_FEATURES=FEATURES.map(f=>({...f}));
let realDEM=null;
const PEAKS=[[-3090,2060,620,760], [1770,2650,560,800],[3790,830,560,780],[2720,-2280,540,730],[-840,-2770,420,690],[-3880,-1020,520,680],[420,1240,360,470]];
const LIMIT={minX:-4850,maxX:4850,minY:-3500,maxY:3500};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function localToLatLng(x,y){
 if(!regionalProjection)return {lat:LAT0+y/R/DEG,lng:LON0+x/(R*Math.cos(LAT0*DEG))/DEG};
 const d=Math.hypot(x,y);if(d===0)return {lat:LAT0,lng:LON0};const a=LAT0*DEG,b=LON0*DEG,t=d/R,c=Math.cos(t),k=Math.sin(t)/d;
 const v=[Math.cos(a)*Math.cos(b)*c+(-Math.sin(b)*x-Math.sin(a)*Math.cos(b)*y)*k,Math.cos(a)*Math.sin(b)*c+(Math.cos(b)*x-Math.sin(a)*Math.sin(b)*y)*k,Math.sin(a)*c+Math.cos(a)*y*k];return {lat:Math.asin(clamp(v[2],-1,1))/DEG,lng:Math.atan2(v[1],v[0])/DEG};
}
function latLngToLocal(lat,lng){
 if(!regionalProjection)return {x:(lng-LON0)*DEG*R*Math.cos(LAT0*DEG),y:(lat-LAT0)*DEG*R};
 const a=LAT0*DEG,b=LON0*DEG,p=lat*DEG,q=lng*DEG,v=[Math.cos(p)*Math.cos(q),Math.cos(p)*Math.sin(q),Math.sin(p)],east=-Math.sin(b)*v[0]+Math.cos(b)*v[1],north=-Math.sin(a)*Math.cos(b)*v[0]-Math.sin(a)*Math.sin(b)*v[1]+Math.cos(a)*v[2],up=Math.cos(a)*Math.cos(b)*v[0]+Math.cos(a)*Math.sin(b)*v[1]+Math.sin(a)*v[2],n=Math.hypot(east,north);if(n<1e-12)return up>0?{x:0,y:0}:{x:NaN,y:NaN};const f=R*Math.atan2(n,up)/n;return {x:east*f,y:north*f};
}
function wrapRad(t){return Math.atan2(Math.sin(t),Math.cos(t));}
function modDeg(a){return (a%360+360)%360;}
function bearingDeg(a,b){return modDeg(Math.atan2(b.x-a.x,b.y-a.y)/DEG);}
function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
/** Geo-referenced regular grid, coordinates use the local (x east, y north) convention. */
function demAt(x,y){
  if(!realDEM)return NaN;
  const d=realDEM, col=(x-d.xMin)/(d.xMax-d.xMin)*(d.width-1),row=(d.yMax-y)/(d.yMax-d.yMin)*(d.height-1);
  if(col<0||row<0||col>d.width-1||row>d.height-1)return NaN;
  const x0=Math.min(d.width-2,Math.floor(col)),y0=Math.min(d.height-2,Math.floor(row)),a=col-x0,b=row-y0;
  // A no-data corner is an unknown height; never interpolate across a hole.
  const h00=d.values[y0*d.width+x0],h10=d.values[y0*d.width+x0+1],h01=d.values[(y0+1)*d.width+x0],h11=d.values[(y0+1)*d.width+x0+1];
  if(![h00,h10,h01,h11].every(Number.isFinite))return NaN;
  return h00*(1-a)*(1-b)+h10*a*(1-b)+h01*(1-a)*b+h11*a*b;
}
function validDEMPoint(x,y){return Number.isFinite(elevation(x,y));}
function demInfo(){return realDEM?{...realDEM.metadata,width:realDEM.width,height:realDEM.height,cellMeters:realDEM.cellMeters,validCount:realDEM.validCount}:null;}
function estimateCandidateWidth(d,peak){
  // Approximate cross-section at half of local prominence using DEM sampling;
  // not a physically measured camera bounding box or calibrated feature width.
  const step=Math.max(20,d.cellMeters),h=peak.height,drop=Math.max(3,peak.score/2),radii=[];
  for(let j=0;j<8;j++){
    const a=j*Math.PI/4;let reach=step;
    for(let r=step;r<=Math.max(1000,d.cellMeters*8);r+=step){const z=demAt(peak.x+r*Math.cos(a),peak.y+r*Math.sin(a));
      if(!Number.isFinite(z)||z<h-drop)break;reach=r;
    }
    radii.push(reach);
  }
  return Math.round(clamp(2*radii.reduce((a,b)=>a+b,0)/radii.length,Math.max(50,d.cellMeters),Math.max(1500,d.cellMeters*16)));
}
function findDEMFeatures(d,maxCount=7){
  const regional=d.cellMeters>=1000;
  // This is a candidate detector on DEM local elevation, not verified named peaks.
  const stride=regional?1:Math.max(2,Math.round(140/d.cellMeters)),radius=regional?2:Math.max(3,Math.round(360/d.cellMeters));
  const candidates=[];
  function gridHeight(i,j){return d.values[j*d.width+i];}
  for(let j=radius;j<d.height-radius;j+=stride)for(let i=radius;i<d.width-radius;i+=stride){
    const h=gridHeight(i,j);if(!Number.isFinite(h))continue;
    let max=-Infinity,mean=0,n=0,lo=Infinity;
    for(let y=j-radius;y<=j+radius;y+=Math.max(1,Math.floor(radius/3)))for(let x=i-radius;x<=i+radius;x+=Math.max(1,Math.floor(radius/3))){
      const z=gridHeight(x,y);if(!Number.isFinite(z))continue;max=Math.max(max,z);lo=Math.min(lo,z);mean+=z;n++;
    }
    if(n<10||max>h+1.4)continue;
    const prominence=h-mean/n;if(prominence<0.8)continue;
    const px=d.xMin+i/(d.width-1)*(d.xMax-d.xMin),py=d.yMax-j/(d.height-1)*(d.yMax-d.yMin);
    if(px<LIMIT.minX+250||px>LIMIT.maxX-250||py<LIMIT.minY+250||py>LIMIT.maxY-250)continue;
    candidates.push({x:px,y:py,score:prominence,relief:h-lo,height:h});
  }
  candidates.sort((a,b)=>b.score-a.score);
  const chosen=[];
  for(const c of candidates){if(chosen.some(f=>distance(f,c)<(regional?d.cellMeters*3:750)))continue;
    chosen.push(c);if(chosen.length===maxCount)break;}
  return chosen.map((c,i)=>({id:'P'+(i+1),name:'DEM 候選峰 '+String(i+1).padStart(2,'0'),x:c.x,y:c.y,width:estimateCandidateWidth(d,c),code:0.12+i*.11,
    status:`高程格網自動抽出的候選局部峰，h=${Math.round(c.height)} m、相對高差指標 ${c.relief.toFixed(1)} m；尚未經影像人工驗證。${regional?"公里級 MOLA 地形候選，非精確峰頂。":""}`,kind:'DEM 峰候選'}));
}
function setDEM(input){
  if(!input||!['jezero-dem-grid-v1','mars-local-grid-v1','mars-region-grid-v1'].includes(input.schema)||input.crs!==(input.schema==='mars-region-grid-v1'?'MARS_AZIMUTHAL_EQUIDISTANT':'MARS_EQ_LOCAL_TANGENT')||!input.source||!input.source.url)throw Error('不支援的 DEM 格式或缺少來源 metadata');
  const localGrid=input.schema==='mars-local-grid-v1';
  if(localGrid&&(!input.origin||!Number.isFinite(input.origin.lat)||Math.abs(input.origin.lat)>=90||!Number.isFinite(input.origin.lng)||Math.abs(input.origin.lng)>180))throw Error('Invalid Mars local origin');
  const {width,height,xMin,xMax,yMin,yMax}=input;const regional=input.schema==='mars-region-grid-v1';if(regional&&(!input.origin||!Number.isFinite(input.origin.lat)||Math.abs(input.origin.lat)>90||!Number.isFinite(input.origin.lng)||Math.abs(input.origin.lng)>180))throw Error('Invalid Mars region origin');
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<3||height<3||width*height>3000000)throw Error('DEM 網格尺寸異常');
  if(![xMin,xMax,yMin,yMax].every(Number.isFinite)||xMax<=xMin||yMax<=yMin||(!regional&&!localGrid&&(xMin> -4850||xMax<4850||yMin> -3500||yMax<3500)))throw Error('DEM 未涵蓋示範全區');
  if(!Array.isArray(input.heights)||input.heights.length!==width*height)throw Error('DEM 格網長度不正確');
  const values=Float64Array.from(input.heights.map(v=>v===null?NaN:Number(v)));
  if(values.some(v=>Number.isFinite(v)&&Math.abs(v)>(regional?30000:12000)))throw Error('高程不合理，請檢查 Mars 垂直基準與單位');
  const validCount=values.reduce((n,v)=>n+(Number.isFinite(v)?1:0),0);
  if(validCount<width*height*.4)throw Error('DEM 有效區域不足 40%');
  const d={width,height,xMin,xMax,yMin,yMax,values,validCount,cellMeters:(xMax-xMin)/(width-1),metadata:{...input.source}};
  const prev=realDEM,frame={lat:LAT0,lng:LON0,regional:regionalProjection,bounds:{...LIMIT}};realDEM=d;LAT0=regional||localGrid?input.origin.lat:18.44;LON0=regional||localGrid?input.origin.lng:77.42;regionalProjection=regional;Object.assign(LIMIT,regional||localGrid?{minX:xMin,maxX:xMax,minY:yMin,maxY:yMax}:{minX:-4850,maxX:4850,minY:-3500,maxY:3500});
  if(!validDEMPoint(regional||localGrid?0:-1400,regional||localGrid?0:-820)){realDEM=prev;LAT0=frame.lat;LON0=frame.lng;regionalProjection=frame.regional;Object.assign(LIMIT,frame.bounds);throw Error('探測車起點沒有有效高程，無法使用該裁切範圍');}
  const peaks=findDEMFeatures(d);FEATURES.splice(0,FEATURES.length,...peaks);
  return {validCount,cells:values.length,featureCount:FEATURES.length,metadata:demInfo()};
}
function clearDEM(){realDEM=null;LAT0=18.44;LON0=77.42;regionalProjection=false;Object.assign(LIMIT,{minX:-4850,maxX:4850,minY:-3500,maxY:3500});FEATURES.splice(0,FEATURES.length,...SYNTHETIC_FEATURES.map(f=>({...f})));}
function elevation(x,y){
  if(realDEM)return demAt(x,y);
  let v=-2540+0.024*y-0.012*x;
  for(const [px,py,h,s] of PEAKS){const d2=(x-px)**2+(y-py)**2;v+=h*Math.exp(-d2/(2*s*s));}
  const vshape=80*Math.exp(-((x-350)**2/(2*480**2)+(y-250)**2/(2*1650**2)));
  v-=vshape;
  v+=24*Math.sin(x/690+Math.cos(y/960))*Math.cos(y/520);
  v+=14*Math.cos((x+y)/250)*Math.sin((x-y)/355);
  return v;
}
function roughness(x,y){if(realDEM){const z=elevation(x,y);if(!Number.isFinite(z))return NaN;const s=realDEM.cellMeters*2;const near=[elevation(x+s,y),elevation(x-s,y),elevation(x,y+s),elevation(x,y-s)];if(!near.every(Number.isFinite))return NaN;return clamp(Math.abs(z-near.reduce((a,b)=>a+b,0)/4)/8,0,1);}
return clamp(0.3+0.25*Math.sin(x/370)*Math.cos(y/420)+0.28*Math.exp(-((x-1050)**2+(y+170)**2)/740000),0,1);}
function slopeDeg(x,y){const s=realDEM?Math.max(20,realDEM.cellMeters):40;const gx=(elevation(x+s,y)-elevation(x-s,y))/(2*s),gy=(elevation(x,y+s)-elevation(x,y-s))/(2*s);return Math.atan(Math.hypot(gx,gy))/DEG;}
let slopeLimit=24,roughnessLimit=1;
function setRoughnessLimit(value){if(!Number.isFinite(value)||value<0||value>1)throw Error('粗糙度上限須介於 0–1');roughnessLimit=value;}
function setSlopeLimit(value){if(!Number.isFinite(value)||value<1||value>45)throw Error('坡度門檻須介於 1–45°');slopeLimit=value;}
function risk(x,y){const slope=slopeDeg(x,y),rough=roughness(x,y);const hazard=realDEM?false:((x+150)**2/680**2+(y-350)**2/370**2)<1;const unknown=!Number.isFinite(slope)||!Number.isFinite(rough);return {slope,rough,hazard,unknown,blocked:unknown||slope>slopeLimit||rough>roughnessLimit||hazard,cost:unknown?Infinity:1+2.1*rough+2*Math.pow(slope/slopeLimit,2)};}
function segmentSafe(a,b){const n=Math.max(1,Math.ceil(distance(a,b)/(realDEM?(realDEM.cellMeters>100?realDEM.cellMeters/3:Math.min(realDEM.cellMeters/3,15)):15)));for(let i=0;i<=n;i++){const t=i/n,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;if(x<LIMIT.minX||x>LIMIT.maxX||y<LIMIT.minY||y>LIMIT.maxY||risk(x,y).blocked)return false;}return true;}
function fieldValue(kind,x,y){const h=elevation(x,y);if(!Number.isFinite(h))return NaN;if(kind==='terrain')return realDEM?clamp((h+2600)/1300,0,1):clamp((h+2700)/850,0,1);if(kind==='geology')return (x+0.32*y>540)?0.82:(x-0.45*y< -650)?0.20:0.48;if(kind==='landform')return clamp((slopeDeg(x,y)+4*roughness(x,y))/27,0,1);if(kind==='temperature')return clamp(((-27+8*Math.sin(x/1250)*Math.cos(y/1100)-0.008*(h+2500))+43)/33,0,1);if(kind==='magnetic')return clamp((50+26*Math.sin(x/810+y/1360)+13*Math.cos(y/530))/100,0,1);return 0;}
function minHeap(){const a=[];return {push(v){a.push(v);let i=a.length-1;while(i){let p=(i-1)>>1;if(a[p].f<=v.f)break;a[i]=a[p];i=p;}a[i]=v;},pop(){if(!a.length)return null;const top=a[0],t=a.pop();if(a.length){let i=0;while(true){let c=i*2+1;if(c>=a.length)break;if(c+1<a.length&&a[c+1].f<a[c].f)c++;if(a[c].f>=t.f)break;a[i]=a[c];i=c;}a[i]=t;}return top;},get length(){return a.length;}};}
function planPath(start,goal,step=realDEM?Math.max(65,realDEM.cellMeters):105,options={}){
  if(!Number.isFinite(step)||step<=0)throw Error('Invalid route grid step');
  validateEnergyOptions(options);
  const energyMode=options.mode==='energy',heuristicScale=energyMode?minimumEnergyRatio:1;
  const energySampleStep=Math.max(10,(realDEM?.cellMeters||40)/3);
  const failure={path:[],length:0,expanded:0,reachable:false};
  if(![start.x,start.y,goal.x,goal.y].every(Number.isFinite)||!segmentSafe(start,start)||!segmentSafe(goal,goal))return failure;
  const NX=Math.floor((LIMIT.maxX-LIMIT.minX)/step)+1,NY=Math.floor((LIMIT.maxY-LIMIT.minY)/step)+1,N=NX*NY;
  const coords=(id)=>({x:LIMIT.minX+(id%NX)*step,y:LIMIT.minY+Math.floor(id/NX)*step});
  const toId=p=>clamp(Math.round((p.y-LIMIT.minY)/step),0,NY-1)*NX+clamp(Math.round((p.x-LIMIT.minX)/step),0,NX-1);
  const st=toId(start),en=toId(goal),prev=new Int32Array(N).fill(-1),gs=new Float64Array(N).fill(Infinity),closed=new Uint8Array(N),cache=new Map(),heap=minHeap();
  function riskFor(id){if(!cache.has(id)){const p=coords(id);cache.set(id,risk(p.x,p.y));}return cache.get(id);}
  if(!segmentSafe(start,coords(st))||!segmentSafe(coords(en),goal))return failure;
  if(st===en){return segmentSafe(start,goal)?{path:[{...start},{...goal}],length:distance(start,goal),maxSlope:Math.max(risk(start.x,start.y).slope,risk(goal.x,goal.y).slope),expanded:0,reachable:true}:failure;}
  gs[st]=0;heap.push({id:st,f:heuristicScale*distance(coords(st),coords(en))});let expanded=0;
  const moves=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
  while(heap.length&&expanded<25000){const cur=heap.pop();if(closed[cur.id])continue;closed[cur.id]=1;expanded++;if(cur.id===en)break;const cx=cur.id%NX,cy=Math.floor(cur.id/NX);
    for(const [dx,dy] of moves){const nx=cx+dx,ny=cy+dy;if(nx<0||ny<0||nx>=NX||ny>=NY)continue;const id=ny*NX+nx;if(closed[id]||((id!==en&&id!==st)&&riskFor(id).blocked))continue;
      if(dx&&dy){const r1=riskFor(cy*NX+nx),r2=riskFor(ny*NX+cx);if(r1.blocked||r2.blocked)continue;}
      const rr=riskFor(id);if(rr.blocked||!segmentSafe(coords(cur.id),coords(id)))continue;
      const a=coords(cur.id),b=coords(id),surface=Math.hypot(Math.hypot(dx,dy)*step,elevation(b.x,b.y)-elevation(a.x,a.y));
      const weight=options.mode==='shortest'?0:(options.riskWeight??1);
      const cost=energyMode?segmentEnergy(a,b,elevation,energySampleStep,options):surface*(1+weight*(rr.cost-1)), alt=gs[cur.id]+cost;
      if(alt<gs[id]){gs[id]=alt;prev[id]=cur.id;heap.push({id,f:alt+heuristicScale*distance(coords(id),coords(en))});}}
  }
  if(!closed[en]||!Number.isFinite(gs[en]))return {path:[],length:0,expanded,reachable:false};
  const rev=[];let k=en;while(k!==-1){rev.push(coords(k));if(k===st)break;k=prev[k];}rev.reverse();rev.unshift({...start});rev.push({...goal});
  // Keep every traversed grid cell: decimation could draw unsafe shortcuts across obstacles.
  const out=rev;
  let len=0,maxSlope=0;for(let i=1;i<out.length;i++){if(!segmentSafe(out[i-1],out[i]))return failure;const d=distance(out[i-1],out[i]);len+=d;const n=Math.max(1,Math.ceil(d/(realDEM&&realDEM.cellMeters>100?realDEM.cellMeters/3:15)));for(let k=0;k<=n;k++){const t=k/n;maxSlope=Math.max(maxSlope,slopeDeg(out[i-1].x+(out[i].x-out[i-1].x)*t,out[i-1].y+(out[i].y-out[i-1].y)*t));}}
  return {path:out,length:len,maxSlope,expanded,reachable:true};
}
function apparentSizeDeg(width,d){return 2*Math.atan2((width||0)/2,Math.max(1,d))/DEG;}
function featureGeometry(camera,peak,heading=0){const d=distance(camera,peak),az=bearingDeg(camera,peak);return {distance:d,azimuth:az,relative:modDeg(az-heading+180)-180,elevation:Math.atan2(elevation(peak.x,peak.y)-elevation(camera.x,camera.y)-1.7,d)/DEG,size:apparentSizeDeg(peak.width,d)};}
function captureObservations(camera,heading){const obs=[];for(let i=0;i<FEATURES.length;i++){const f=FEATURES[i],geom=featureGeometry(camera,f,heading),noise=(Math.sin((i+1)*9.87+camera.x*0.00015+camera.y*0.00023)*.31);obs.push({id:'OBS-'+(i+1),descriptor:f.code+0.004*Math.sin(i*8.3),bearing:wrapRad((geom.azimuth-heading+noise)*DEG),elevation:geom.elevation+0.08*Math.sin(i*2.1),size:geom.size});}obs.push({id:'NOISE',descriptor:0.605,bearing:0.95,elevation:4.2,size:0.8});return obs;}
function associate(observations,features=FEATURES){const used=new Set(),pairs=[],unmatched=[];for(const o of observations){let best=null,score=Infinity;for(const f of features){const d=Math.abs(o.descriptor-f.code);if(!used.has(f.id)&&d<score){best=f;score=d;}}if(best&&score<0.025){used.add(best.id);pairs.push({obs:o,feature:best,descriptorError:score});}else unmatched.push(o);}return {pairs,unmatched};}
function solveLinear3(A,b){let m=[...A.map((r,i)=>[...r,b[i]])];for(let i=0;i<3;i++){let k=i;for(let j=i+1;j<3;j++)if(Math.abs(m[j][i])>Math.abs(m[k][i]))k=j;if(Math.abs(m[k][i])<1e-12)return null;[m[k],m[i]]=[m[i],m[k]];let p=m[i][i];for(let c=i;c<4;c++)m[i][c]/=p;for(let j=0;j<3;j++)if(j!==i){const q=m[j][i];for(let c=i;c<4;c++)m[j][c]-=q*m[i][c];}}return m.map(row=>row[3]);}
function refinePose(pairs,init){if(pairs.length<3)return {ok:false,reason:'need_3'};
 let q=[init.x/1000,init.y/1000,init.heading*DEG],lambda=0.02;
 function residuals(v){return pairs.map(p=>{const pred=Math.atan2(p.feature.x-v[0]*1000,p.feature.y-v[1]*1000);return wrapRad(pred-v[2]-p.obs.bearing);});}
 function loss(v){return residuals(v).reduce((s,r)=>s+r*r,0);}
 let initialLoss=loss(q);
 for(let t=0;t<65;t++){
  const r=residuals(q),jac=[],eps=[0.00005,0.00005,0.00001];
  for(let j=0;j<3;j++){const qp=[...q];qp[j]+=eps[j];const rp=residuals(qp);jac[j]=r.map((v,i)=>wrapRad(rp[i]-v)/eps[j]);}
  const A=Array.from({length:3},()=>[0,0,0]),b=[0,0,0];
  for(let j=0;j<3;j++)for(let k=0;k<3;k++)A[j][k]=jac[j].reduce((s,v,i)=>s+v*jac[k][i],0)+(j===k?lambda:0);
  for(let j=0;j<3;j++)b[j]=-jac[j].reduce((s,v,i)=>s+v*r[i],0);
  const delta=solveLinear3(A,b);if(!delta)return {ok:false,reason:'singular'};
  const trial=q.map((v,i)=>v+delta[i]),before=loss(q),after=loss(trial);
  if(after<before){q=trial;lambda=Math.max(0.0000001,lambda*0.45);if(Math.hypot(...delta)<1e-8)break;}else lambda=Math.min(1e8,lambda*5);
 }
 const rms=Math.sqrt(loss(q)/pairs.length)/DEG;
 return {ok:rms<2.5,x:q[0]*1000,y:q[1]*1000,heading:modDeg(q[2]/DEG),rmsDeg:rms,count:pairs.length,initialRmsDeg:Math.sqrt(initialLoss/pairs.length)/DEG};
}
return {R,get LAT0(){return LAT0;},get LON0(){return LON0;},DEG,FEATURES,LIMIT,setDEM,clearDEM,demAt,demInfo,validDEMPoint,findDEMFeatures,clamp,localToLatLng,latLngToLocal,wrapRad,modDeg,bearingDeg,distance,elevation,slopeDeg,roughness,risk,setSlopeLimit,setRoughnessLimit,segmentSafe,fieldValue,planPath,apparentSizeDeg,featureGeometry,captureObservations,associate,refinePose};
})();
export default api;
