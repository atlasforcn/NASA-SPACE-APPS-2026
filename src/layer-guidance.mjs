import {scienceCell} from './science-layers.mjs';

export const layerNames = { terrain:'Elevation', slope:'Slope', hillshade:'Hillshade', roughness:'Roughness', geology:'Geologic unit', thermal:'TES thermal inertia', spectral:'TES olivine abundance', geophysical:'GMM-3 gravity anomaly', atmospheric:'MEDA pressure', radiation:'RAD radiation', chemical:'GRS iron content' };
export const temperatureHistory = [
  {lat:18.4446,lng:77.4509, station:'Jezero · MEDA', period:'2021-02-19', reading:'Air temperature 30 minutes after startup', value:-25.6,
    text:'Jezero landing site, February 19, 2021. MEDA initially recorded just below −20 °C. After 30 minutes the temperature fell to −25.6 °C.',url:'https://www.jpl.nasa.gov/news/nasas-first-weather-report-from-jezero-crater-on-mars/'},
  {lat:-4.5895,lng:137.4417, station:'Gale · REMS', period:'First two weeks after landing in August 2012', reading:'Approximate upper end of the typical daily air temperature range', value:-2,
    text:'Gale landing region, first two weeks after landing in August 2012. REMS measured typical daily temperatures of about −75 to −2 °C.',url:'https://www.jpl.nasa.gov/news/nasas-curiosity-studies-mars-surroundings-nears-drive/'},
];
const advice = {
  thermal:'Thermal inertia describes how quickly a surface heats and cools. Live temperature and thermal exposure forecasts are unavailable.',
  spectral:'Olivine abundance helps compare candidate sites. Field observations or samples can confirm local rock types.',
  geophysical:'Gravity anomalies reveal regional variations in subsurface mass.',
  chemical:'Each 5° GRS cell shows regional total iron content.',
};
const fmt = n => Number.isFinite(n) ? String(Number(n.toFixed(3))) : 'Missing data';
const key = c => c.row+','+c.col;

// Intersect the visible viewport with the coarse GRS cells, including wrapped world copies.
function viewportIron(meta,values,b) {
  const dx=360/meta.width, dy=180/meta.height;
  let low=Infinity,high=-Infinity,missing=0;
  for(let row=0;row<meta.height;row++) {
    const north=90-row*dy;
    if(north<=b.south || north-dy>=b.north) continue;
    for(let col=0;col<meta.width;col++) {
      const west=-180+col*dx;
      const shift=Math.floor((b.west-west)/360);
      const edge=west+360*shift;
      if(edge+dx<=b.west && edge+360>=b.east) continue;
      const v=values[row*meta.width+col];
      if(Number.isFinite(v)){low=Math.min(low,v);high=Math.max(high,v);} else missing++;
    }
  }
  return {low,high,missing};
}
export function scienceGuidance(id,record,points,route,bounds,nav) {
  if(record?.status?.includes('failed')) return {warning:record.status};
  if(!record?.meta || record.loading) return {text:record?.status || 'Loading data…'};
  const {meta,values}=record;
  if(meta.kind==='station') return {text:meta.name+' · '+meta.start.slice(0,10)+' onward, station mean '+fmt(meta.value)+' '+meta.unit+'.',advice:id==='radiation'?'Historical silicon detector readings. A crew dose estimate requires measurements, exposure time and shielding for the visit.':'Historical pressure at one station. Pressure and current winds along the route require local measurements.',url:meta.source.url};
  const sample=p=>scienceCell(meta,values,p.lat,p.lng);
  const cells=points.map(sample).filter(Boolean);
  if(!cells.length) return {warning:'The sample lies outside the valid extent.',advice:advice[id]};
  const seen=new Set(cells.map(key)), valid=cells.map(c=>c.value).filter(Number.isFinite);
  const low=valid.reduce((a,b)=>Math.min(a,b),Infinity),high=valid.reduce((a,b)=>Math.max(a,b),-Infinity);
  const first=cells[0], last=cells.at(-1);
  const result={url:meta.source.url,advice:advice[id],text:route
    ? 'Start '+fmt(first.value)+' → end '+fmt(last.value)+' '+meta.unit+'. Route nodes '+(seen.size===1?'all fall in one cell':('span '+seen.size+' cells'))+(valid.length?', valid range '+fmt(low)+'–'+fmt(high)+' '+meta.unit+'.':'. All sampled nodes lack data.')
    : 'Map center '+fmt(first.value)+' '+meta.unit+'.'};
  if(id==='chemical' && route && seen.size>1) {
    const transitions=cells.filter((c,i)=>!i || key(c)!==key(cells[i-1]));
    const preview=transitions.slice(0,6).map(c=>fmt(c.value)).join(' → ');
    result.text+=' Iron content along the route '+preview+(transitions.length>6?' → …':'')+' wt % Fe.';
  }
  if(id==='chemical' && bounds) {
    const area=viewportIron(meta,values,bounds);
    result.text+=' Iron content in the current view '+(Number.isFinite(area.low) ? fmt(area.low)+'–'+fmt(area.high)+' wt % Fe':'No valid reading')+' (cell size '+360/meta.width+'°).';
    if(area.missing) result.warning='This view includes '+area.missing+' chemistry cells with missing data.';
  }
  if(valid.length<cells.length) result.warning='Some sample locations lack data, leaving the full range unknown.';
  if(id==='thermal') {
    result.history=temperatureHistory.filter(h=>seen.has(key(sample(h))));
    if(!result.history.length) result.text+=' No historical temperature records are available in the sampled cells.';
    if(nav.thermalEnabled && low<nav.thermalThreshold) result.warning='Thermal inertia is below the mission threshold of '+nav.thermalThreshold+'. The planner applies the surface material cost assumption.';
  }
  return result;
}
