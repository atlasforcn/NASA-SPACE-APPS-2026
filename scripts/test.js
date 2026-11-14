'use strict';
const {execFileSync}=require('node:child_process');
for(const file of ['test_core.js','test_dem.js','tests/test_skyline.js','tests/test_planet.js'])execFileSync(process.execPath,[file],{stdio:'inherit'});
