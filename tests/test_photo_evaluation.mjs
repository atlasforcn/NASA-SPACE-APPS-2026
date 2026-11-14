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
