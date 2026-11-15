import {scienceCell} from './science-layers.mjs';

export const layerNames = { terrain:'高程', slope:'坡度', hillshade:'地形陰影', roughness:'粗糙度', geology:'地質單元', thermal:'TES 熱慣量', spectral:'TES 橄欖石豐度', geophysical:'GMM-3 重力異常', atmospheric:'MEDA 氣壓', radiation:'RAD 輻射', chemical:'GRS 鐵濃度' };
export const temperatureHistory = [
  {lat:18.4446,lng:77.4509, station:'Jezero · MEDA', period:'2021-02-19', reading:'開機 30 分鐘後的氣溫', value:-25.6,
    text:'Jezero 著陸點，2021-02-19。MEDA 首次記錄時略低於 −20 °C，30 分鐘後降至 −25.6 °C。',url:'https://www.jpl.nasa.gov/news/nasas-first-weather-report-from-jezero-crater-on-mars/'},
  {lat:-4.5895,lng:137.4417, station:'Gale · REMS', period:'2012 年 8 月著陸後首兩週', reading:'典型火星日氣溫範圍的上端（約值）', value:-2,
    text:'Gale 著陸區，2012 年 8 月著陸後首兩週。REMS 量得典型火星日氣溫約 −75 至 −2 °C。',url:'https://www.jpl.nasa.gov/news/nasas-curiosity-studies-mars-surroundings-nears-drive/'},
];
const advice = {
  thermal:'熱慣量描述地表升降溫的快慢。本站無即時氣溫或熱曝露預報。',
  spectral:'比較橄欖石豐度可協助選站。現地岩性仍需觀察或採樣確認。',
  geophysical:'重力異常可比較區域地下質量分布；無法辨識路面空洞或鬆動岩塊。',
  chemical:'GRS 提供區域總鐵含量。氧化態、鹽類、粉塵毒性及人員接觸安全均無法由此判定。',
};
const fmt = n => Number.isFinite(n) ? String(Number(n.toFixed(3))) : '缺值';
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
  if(record?.status?.includes('失敗')) return {text:'此層暫無可靠判讀。',warning:record.status};
  if(!record?.meta || record.loading) return {text:record?.status || '正在載入資料…'};
  const {meta,values}=record;
  if(meta.kind==='station') return {text:meta.name+' · '+meta.start.slice(0,10)+' 起，測站平均 '+fmt(meta.value)+' '+meta.unit+'。',advice:id==='radiation'?'歷史矽偵測器讀值；評估人員劑量需當次量測、停留時間及屏蔽條件。':'歷史單站氣壓；沿線氣壓與當下風況仍需量測。',url:meta.source.url};
  const sample=p=>scienceCell(meta,values,p.lat,p.lng);
  const cells=points.map(sample).filter(Boolean);
  if(!cells.length) return {warning:'取樣位置超出有效範圍。',advice:advice[id]};
  const seen=new Set(cells.map(key)), valid=cells.map(c=>c.value).filter(Number.isFinite);
  const low=valid.reduce((a,b)=>Math.min(a,b),Infinity),high=valid.reduce((a,b)=>Math.max(a,b),-Infinity);
  const first=cells[0], last=cells.at(-1);
  const result={url:meta.source.url,advice:advice[id],text:route
    ? '起點 '+fmt(first.value)+' → 終點 '+fmt(last.value)+' '+meta.unit+'。路線節點'+(seen.size===1?'全在同一格':('落在 '+seen.size+' 格'))+(valid.length?'，有效範圍 '+fmt(low)+'–'+fmt(high)+' '+meta.unit+'。':'，全部取樣節點缺值。')
    : '地圖中心 '+fmt(first.value)+' '+meta.unit+'。'};
  if(id==='chemical' && route && seen.size>1) {
    const transitions=cells.filter((c,i)=>!i || key(c)!==key(cells[i-1]));
    const preview=transitions.slice(0,6).map(c=>fmt(c.value)).join(' → ');
    result.text+=' 沿途鐵含量 '+preview+(transitions.length>6?' → …':'')+' wt % Fe。';
  }
  if(id==='chemical' && bounds) {
    const area=viewportIron(meta,values,bounds);
    result.text+=' 目前視窗鐵含量 '+(Number.isFinite(area.low) ? fmt(area.low)+'–'+fmt(area.high)+' wt % Fe':'無有效讀值')+'（每格 '+360/meta.width+'°）。';
    if(area.missing) result.warning='視窗內有 '+area.missing+' 個化學格缺測。';
  }
  if(valid.length<cells.length) result.warning='取樣位置含缺值，無法判讀完整範圍。';
  if(id==='thermal') {
    result.history=temperatureHistory.filter(h=>seen.has(key(sample(h))));
    if(!result.history.length) result.text+=' 本站尚無所取樣格內的歷史測溫紀錄。';
    if(nav.thermalEnabled && low<nav.thermalThreshold) result.warning='熱慣量低於任務設定的 '+nav.thermalThreshold+'，規劃器會套用材質成本假設。';
  }
  return result;
}
