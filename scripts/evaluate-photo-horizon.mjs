import fs from 'node:fs/promises';
import C from '../core.mjs';
import S from '../skyline.mjs';

// Input: independently measured angular skyline; no image/DEM-derived synthetic observation.
// Reference position is read only AFTER search has returned.
export async function evaluate(input) {
  if(input.schema!=='mars-photo-horizon-evaluation-v1') throw Error('Unsupported evaluation schema');
  const {observation:obs,search,provenance}=input;
  if(obs?.kind!=='measured-photo-horizon' || !provenance?.imageUrl ||
    !provenance?.projectionSource || !provenance?.annotationMethod || !provenance?.referenceSource)
    throw Error('Missing measured observation or image, projection, annotation and reference provenance');
  if(!Array.isArray(obs.angles)||!Array.isArray(obs.valid)||!Array.isArray(obs.elevations)||
    obs.angles.length!==obs.valid.length||obs.angles.length!==obs.elevations.length||
    obs.angles.length<12||obs.angles.length>720||
    !Number.isFinite(obs.cameraHeight)||obs.cameraHeight<=0 ||
    !obs.valid?.every(v=>typeof v==='boolean') ||
    !obs.elevations?.every((v,i)=>!obs.valid[i]||(Number.isFinite(v)&&Math.abs(v)<=90)))
    throw Error('Invalid measured angles, mask or camera height');
  if(!Number.isFinite(search?.coarseStep)||search.coarseStep<=0) throw Error('Invalid coarse step');
  if(!Number.isFinite(obs.options?.rayStep)||obs.options.rayStep<=0||
    !Number.isFinite(obs.options?.maxRange)||obs.options.maxRange<1200||
    obs.options.maxRange/obs.options.rayStep>10000) throw Error('Invalid ray range or step');
  const bounds=search.bounds;
  if(!bounds||!['minX','maxX','minY','maxY'].every(k=>Number.isFinite(bounds[k]))||
    bounds.maxX<bounds.minX||bounds.maxY<bounds.minY) throw Error('Invalid bounds');
  const count=(Math.floor((bounds.maxX-bounds.minX)/search.coarseStep)+1)*
    (Math.floor((bounds.maxY-bounds.minY)/search.coarseStep)+1);
  if(count>100000) throw Error('Search exceeds 100000 coarse positions');
  const grid=JSON.parse(await fs.readFile(input.demPath,'utf8'));
  C.setDEM(grid);
  const result=await S.search(obs,search.bounds,{coarseStep:search.coarseStep});
  const {reference,prior}=input;
  for(const p of [reference,prior]) if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)) throw Error('Missing evaluation reference/prior in DEM local metres');
  const best=result.candidates[0];
  const before=C.distance(prior,reference), after=best?C.distance(best,reference):null;
  return {schema:'mars-photo-horizon-result-v1',provenance,demSource:grid.source,
    observationKind:obs.kind,priorErrorMeters:before,candidateErrorMeters:after,
    improvementMeters:after===null?null:before-after,
    candidateImproves:after!==null&&after<before,
    simulationThresholdStatus:result.status,
    realPhotoCorrectionAuthorized:false,
    conclusion:after!==null&&after<before?'此單筆候選較先驗位置接近參考位置；尚不足以證明普遍改善。':'此觀測未顯示候選位置改善。',
    limitations:['模擬分類門檻尚未以實景校準','參考位置誤差與 DEM 配準誤差須另行評估','單筆結果不足以驗證自動校正可靠度'],
    candidates:result.candidates};
}
if(process.argv[1]?.endsWith('evaluate-photo-horizon.mjs')) {
  if(!process.argv[2]) throw Error('Usage: node scripts/evaluate-photo-horizon.mjs input.json [result.json]');
  const result=await evaluate(JSON.parse(await fs.readFile(process.argv[2],'utf8')));
  const text=JSON.stringify(result,null,2)+'\n';
  if(process.argv[3]) await fs.writeFile(process.argv[3],text); else process.stdout.write(text);
}
