import fs from 'node:fs/promises';
import path from 'node:path';
import P from '../planet.mjs';
import regions from '../regions.mjs';

// Reproducible numeric grids; never infer elevation from rendered colour imagery.
const out = process.argv[2] || '.build/dem-regions';
const bytes = await fs.readFile('data/mola16.bin');
const meta = JSON.parse(await fs.readFile('data/mola16.json','utf8'));
const planet = P.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.byteLength),meta);
await fs.mkdir(out,{recursive:true});
const catalog=[];
for (const r of regions) {
  const grid=planet.region(r.lat,r.lng);
  const file=`${r.id}.json`;
  await fs.writeFile(path.join(out,file),JSON.stringify(grid)+'\n');
  catalog.push({...r,file,source:grid.source.url,sourceSha256:grid.source.original_sha256,
    sampleStepMeters:grid.source.sample_step_m,width:grid.width,height:grid.height,
    centreElevationMeters:planet.sample(r.lat,r.lng),
    realPhotoLocalizationValidated:false});
}
await fs.writeFile(path.join(out,'catalog.json'),JSON.stringify(catalog,null,2)+'\n');
console.log(`Exported ${catalog.length} MOLA regions to ${out}; not high-resolution or photo-validated.`);
