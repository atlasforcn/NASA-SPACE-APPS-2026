import assert from "node:assert/strict";
import { observationFromTrace, extractHorizon } from "../src/horizon-input.mjs";
const trace = Array(700).fill(130);
const obs = observationFromTrace(trace, 700, 260, { fov: 60, pitch: 0 });
assert.equal(obs.kind, "user-horizon");
assert.equal(obs.elevations[0], 0);
assert(obs.valid.filter(Boolean).length >= 19);
assert.equal(obs.valid[60], false);
const tilted = observationFromTrace(trace, 700, 260, { fov: 60, pitch: 10 });
assert(Math.abs(tilted.elevations[0] - 10) < 1e-6);
const gaps = [...trace]; gaps.fill(null, 300, 401);
assert.equal(observationFromTrace(gaps, 700, 260).valid[0], false);
assert.throws(() => observationFromTrace(Array(700).fill(null), 700, 260), /輪廓太短/);
assert.throws(() => observationFromTrace(trace, 700, 260, { fov: 180 }), /水平視角/);
const width = 100, height = 70, data = new Uint8ClampedArray(width * height * 4);
for (let x = 0; x < width; x++) for (let y = 0; y < height; y++) {
  const ridge = 25 + Math.round(Math.sin(x / 15) * 6), offset = (y * width + x) * 4;
  data.set(y < ridge ? [220, 180, 150, 255] : [60, 40, 30, 255], offset);
}
const result = extractHorizon({ data, width, height });
assert(result.every((y, x) => Math.abs(y - (25 + Math.round(Math.sin(x / 15) * 6))) <= 3));
console.log("Hand-drawn horizon projection, pitch, missing samples and photo edge extraction passed.");

const wide = observationFromTrace(Array(700).fill(30), 700, 92, { fov: 180, projection: "equirectangular" });
assert(wide.valid.filter(Boolean).length >= 59);
assert(Math.abs(wide.elevations[0] - 16 * 180 / 700) < 1e-6);
const wrap = observationFromTrace(Array(700).fill(46), 700, 92, { fov: 360, projection: "equirectangular" });
assert(wrap.valid.filter(Boolean).length >= 119);

// Stronger foreground edges must not replace the sky/terrain boundary.
for (let x = 0; x < width; x++) for (let y = 50; y < height; y++) data.set([0, 0, 0, 255], (y * width + x) * 4);
assert(extractHorizon({ data, width, height }).every((y, x) => Math.abs(y - (25 + Math.round(Math.sin(x / 15) * 6))) <= 3));
for (let y = 0; y < height; y++) data.set([60, 40, 30, 255], (y * width + 50) * 4);
assert.equal(extractHorizon({ data, width, height })[50], null);
