import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createScienceLoader, decodeScienceGrid, sampleScienceGrid } from '../src/science-layers.mjs';

const manifest = JSON.parse(fs.readFileSync('data/science/manifest.json', 'utf8'));
const expected = { thermal: 276, spectral: 0, geophysical: -176.73216247558594, chemical: 16.25 };
for (const [key, target] of Object.entries(expected)) {
  const meta = manifest.datasets[key];
  const data = fs.readFileSync(`data/science/${key}.bin`);
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const values = decodeScienceGrid(buffer, meta);
  assert.equal(sampleScienceGrid(meta, values, 18.44, 77.42), target, `${key} at Jezero`);
  assert.equal(sampleScienceGrid(meta, values, 18.44, 437.42), target, `${key} wraps east longitude`);
  assert.equal(sampleScienceGrid(meta, values, 91, 0), null);
  assert.equal(sampleScienceGrid(meta, values, NaN, 0), null);
  assert.equal(sampleScienceGrid(meta, values, -90, -180), sampleScienceGrid(meta, values, -90, 180));
  if (['chemical', 'spectral'].includes(key)) assert.equal(sampleScienceGrid(meta, values, 80, 0), null);
  assert.throws(() => decodeScienceGrid(new ArrayBuffer(3), meta));
  assert(meta.source.sha256 && meta.pixel_registration && meta.unit);
}
assert.equal(manifest.datasets.atmospheric.count, 2330);
assert.equal(manifest.datasets.radiation.count, 14);
assert.equal(manifest.datasets.radiation.value, 8.925);
assert.equal(manifest.datasets.radiation.unit, 'µGy/h (Si)');
let failures = 1, requests = 0;
const loader = createScienceLoader(p => p, async path => {
  requests++;
  if (failures-- > 0) return { ok: false };
  if (path.endsWith('manifest.json')) return { ok: true, json: async () => manifest };
  const b = fs.readFileSync(path);
  return { ok: true, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset+b.byteLength) };
});
await assert.rejects(loader.load('chemical'));
const first = await loader.load('chemical');
const total = requests;
assert.equal(await loader.load('chemical'), first);
assert.equal(requests, total, 'cached data does not refetch');
await assert.rejects(loader.load('unknown'));
console.log('Downloaded science grids: geographic registration, missing data, dose units, loader retry and cache passed.');

const {scienceGuidance}=await import('../src/layer-guidance.mjs');
const record={meta:{kind:'raster',width:4,height:1,unit:'wt % Fe',source:{url:'fixture'}},values:[10,13,NaN,19]};
const wrapped={west:170,east:190,south:-5,north:5};
const tips=scienceGuidance('chemical',record,[{lat:0,lng:-175},{lat:0,lng:175}],true,wrapped,{});
assert(tips.text.includes('起點 10 → 終點 19'));
assert(tips.text.includes('目前視窗鐵含量 10–19'));
assert(!tips.warning);
const missing=scienceGuidance('chemical',record,[{lat:0,lng:10}],false,null,{});
assert(missing.warning.includes('缺值'));
const thermal=scienceGuidance('thermal',record,[{lat:0,lng:175}],false,null,{thermalEnabled:true,thermalThreshold:20});
assert(thermal.warning.includes('低於'));
assert(thermal.history.every(h=>h.lng>=90));
