import P from '../planet.mjs';
import { sampleScienceGrid } from './science-layers.mjs';

const R = 3396190, D = Math.PI/180;
export function geoDistance(a,b) {
  const h = Math.sin((b.lat-a.lat)*D/2)**2 + Math.cos(a.lat*D)*Math.cos(b.lat*D)*Math.sin((b.lng-a.lng)*D/2)**2;
  return 2*R*Math.asin(Math.sqrt(Math.min(1,h)));
}
// Index polygon edges by northing so exact point-in-polygon queries do not
// repeatedly traverse the entire source geometry during A* and replanning.
export function createGeologyIndex(geology) {
  return (geology?.features || []).map(feature => {
    const points=feature.rings.flat(), edgeRows=new Map();
    for(const ring of feature.rings) for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
      const a=ring[i],b=ring[j];
      if(a[1]===b[1])continue;
      for(let row=Math.floor(Math.min(a[1],b[1])/250);row<=Math.floor(Math.max(a[1],b[1])/250);row++) {
        if(!edgeRows.has(row))edgeRows.set(row,[]);
        edgeRows.get(row).push([a,b]);
      }
    }
    return {feature,edgeRows,minX:Math.min(...points.map(p=>p[0])),maxX:Math.max(...points.map(p=>p[0])),minY:Math.min(...points.map(p=>p[1])),maxY:Math.max(...points.map(p=>p[1]))};
  });
}
function contains(p, polygon) {
  let inside=false;
  for(const [a,b] of polygon.edgeRows.get(Math.floor(p.y/250))||[]) {
    if((a[1]>p.y)!==(b[1]>p.y) && p.x<(b[0]-a[0])*(p.y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
export function validateNavigationOptions(o) {
  for (const key of ['sandFactor','rockFactor','unknownFactor','thermalFactor'])
    if (!Number.isFinite(o[key]) || o[key]<1 || o[key]>5) throw Error('材質耗電倍率須介於 1–5');
  if (!Number.isFinite(o.thermalThreshold)||o.thermalThreshold<0||o.thermalThreshold>1000) throw Error('熱慣量門檻須介於 0–1000');
}
export function createNavigationContext({options, zones=[], geologyIndex=[], thermal=null, toGeo}) {
  validateNavigationOptions(options);
  const o={...options}, exclusions=zones.map(z=>({...z}));
  function sample(x,y) {
    const geo=toGeo(x,y), reasons=[];
    const zone=exclusions.find(z=>geoDistance(z,geo)<=z.radius);
    if(zone) return {blocked:true,factor:1,reasons:[`人工禁行區：${zone.name}`],unknown:false};
    let factor=1, evidence=false;
    if(o.geologyEnabled) {
      // Published geology coordinates always use the original Jezero frame.
      const p={x:(geo.lng-77.42)*D*R*Math.cos(18.44*D),y:(geo.lat-18.44)*D*R};
      const unit=geologyIndex.find(b=>p.x>=b.minX&&p.x<=b.maxX&&p.y>=b.minY&&p.y<=b.maxY&&contains(p,b))?.feature.properties;
      if(unit) {
        evidence=true;
        const material=String(unit.unit)==='7'?'sand':['9','10','11','12','13'].includes(String(unit.unit))?'rock':'neutral';
        const f=material==='sand'?o.sandFactor:material==='rock'?o.rockFactor:1;
        factor=Math.max(factor,f);
        if(f>1) reasons.push(`地質示範：${unit.name} ×${f}`);
      }
    }
    if(o.thermalEnabled) {
      const value=thermal && sampleScienceGrid(thermal.meta,thermal.values,geo.lat,geo.lng);
      if(value!==null && value!==false && Number.isFinite(value)) {
        evidence=true;
        if(value<o.thermalThreshold) {
          factor=Math.max(factor,o.thermalFactor);
          reasons.push(`低熱慣量材質假設 ×${o.thermalFactor}`);
        }
      }
    }
    const unknown=(o.geologyEnabled||o.thermalEnabled)&&!evidence;
    if(unknown) { factor=Math.max(factor,o.unknownFactor); reasons.push(`材質資料不足 ×${o.unknownFactor}`); }
    return {blocked:false,factor,reasons,unknown};
  }
  function segmentBlocked(a,b) {
    const midpoint=(p,q)=>({x:(p.x+q.x)/2,y:(p.y+q.y)/2});
    for(const zone of exclusions) {
      const project=p=>P.geoToLocal(zone,toGeo(p.x,p.y));
      const distanceToChord=(p,q)=>{
        const dx=q.x-p.x,dy=q.y-p.y,den=dx*dx+dy*dy;
        const t=den?Math.max(0,Math.min(1,-(p.x*dx+p.y*dy)/den)):0;
        return Math.hypot(p.x+t*dx,p.y+t*dy);
      };
      function intersects(p,q,u,v,depth=0) {
        const m=midpoint(p,q),w=project(m),error=Math.hypot(w.x-(u.x+v.x)/2,w.y-(u.y+v.y)/2);
        if(error<0.1 || depth>=12) return distanceToChord(u,v)<=zone.radius+Math.max(0.1,error*2);
        return intersects(p,m,u,w,depth+1)||intersects(m,q,w,v,depth+1);
      }
      if(intersects(a,b,project(a),project(b)))return true;
    }
    return false;
  }
  const cache=new Map(); let count=0;
  function cachedSample(x,y) {
    if(!Number.isFinite(x+y))return sample(x,y);
    const row=cache.get(x);
    if(row?.has(y))return row.get(y);
    const result=sample(x,y);
    if(count>=100000){cache.clear();count=0;}
    if(!cache.has(x))cache.set(x,new Map());
    cache.get(x).set(y,result);count++;
    return result;
  }
  return {sample:cachedSample,segmentBlocked};
}
