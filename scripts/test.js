'use strict';
const {execFileSync}=require('node:child_process');
for(const file of ['test_core.js','test_dem.js','tests/test_skyline.js','tests/test_planet.js','tests/test_photo_evaluation.mjs','tests/test_gale.mjs'])execFileSync(process.execPath,[file],{stdio:'inherit'});
