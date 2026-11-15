import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {evaluate} from '../scripts/evaluate-photo-horizon.mjs';
import regions from '../regions.mjs';
import P from '../planet.mjs';
import C from '../core.mjs';

await assert.rejects(evaluate({schema:'mars-photo-horizon-evaluation-v1',
  observation:{kind:'simulated-dem-horizon'}}),/Missing measured/);
await assert.rejects(evaluate({schema:'other'}),/Unsupported/);
const bytes=await fs.readFile('data/mola16.bin');
const meta=JSON.parse(await fs.readFile('data/mola16.json','utf8'));
const planet=P.load(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),meta);
for(const r of regions) {
  const grid=planet.region(r.lat,r.lng);
  assert(grid.heights.every(Number.isFinite));
  C.setDEM(grid);
  assert(Math.abs(C.elevation(0,0)-planet.sample(r.lat,r.lng))<0.02);
  assert.equal(grid.source.original_sha256,meta.source_sha256);
}
console.log(`Photo evaluation rejects synthetic inputs; ${regions.length} regional MOLA samples retain source and centre heights.`);

// A known flat silhouette checks field-of-view bookkeeping independently of photo accuracy.
const {observationFromTrace} = await import('../src/horizon-input.mjs');
const {default:S} = await import('../skyline.mjs');
for (const [fov,bins] of [[60,19],[120,39],[150,50]]) {
  const obs = observationFromTrace(Array(720).fill(180),720,360,{fov});
  const model = {...obs,valid:obs.valid.map(()=>true),elevations:obs.valid.map(()=>0)};
  const candidate = S.score(model,obs,0);
  assert.equal(candidate.coverage,bins/120);
  assert.equal(candidate.overlap,1);
  assert.equal(S.classify([candidate],obs).status,'lost');
}
