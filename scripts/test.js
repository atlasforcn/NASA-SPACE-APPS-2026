'use strict';
const {execFileSync}=require('node:child_process');
execFileSync(process.execPath,['tests/test_route_planner.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['tests/test_navigation_context.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['tests/test_science_layers.mjs'],{stdio:'inherit'});
for(const file of ['test_core.js','test_dem.js','tests/test_skyline.js','tests/test_planet.js','tests/test_horizon_input.mjs','tests/test_photo_evaluation.mjs','tests/test_gale.mjs','tests/test_science_context.mjs'])execFileSync(process.execPath,[file],{stdio:'inherit'});
