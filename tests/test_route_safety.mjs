import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import C from '../core.mjs';
import { assessRouteSafety } from '../src/route-safety.mjs';
import { createNavigationContext } from '../src/navigation-context.mjs';

const fixture = {
  schema: 'mars-local-grid-v1', crs: 'MARS_EQ_LOCAL_TANGENT', origin: { lat: 18.44, lng: 77.42 },
  width: 41, height: 41, xMin: -200, xMax: 200, yMin: -200, yMax: 200,
  source: { url: 'fixture', id: 'local' }, heights: Array(41 * 41).fill(0)
};
const at = (x, y = 0) => ({ x, y });
const direct = [at(-150), at(150)];
const within = (a, b) => assert(Math.abs(a - b) < 1e-6, `${a} differs from ${b}`);
C.setDEM(fixture);
assert.equal(assessRouteSafety([]).verdict, 'hold');
assert.equal(assessRouteSafety([at(0), at(0)]).verdict, 'hold');
assert.equal(assessRouteSafety(direct, { slopeLimit: NaN }).verdict, 'hold');
const flat = assessRouteSafety(direct);
assert.equal(flat.verdict, 'go');
assert.equal(flat.maxSlope, 0);
assert.equal(flat.maxRoughness, 0);
within(flat.localDistance, 300);
assert.deepEqual(flat.samples[0], direct[0]);
assert.deepEqual(flat.samples.at(-1), direct[1]);

// A narrow interior exclusion crosses the segment between terrain samples.
const center = at(31, 0);
const nav = createNavigationContext({
  options: { sandFactor: 1, rockFactor: 1, unknownFactor: 1, thermalFactor: 1, thermalThreshold: 200 },
  zones: [{ ...C.localToLatLng(center.x, center.y), radius: 0.4, name: '測試禁行區' }], toGeo: C.localToLatLng
});
C.setNavigationContext(nav);
const blocked = assessRouteSafety(direct);
assert.equal(blocked.noGoCrossed, true);
assert.equal(blocked.verdict, 'reroute');
assert(blocked.segment[0].x <= center.x && blocked.segment[1].x >= center.x);
assert(nav.sample(blocked.point.x, blocked.point.y).blocked);
const detour = assessRouteSafety([direct[0], at(31, 20), direct[1]]);
assert.equal(detour.verdict, 'go');
assert.equal(detour.noGoCrossed, false);
assert(detour.length > flat.length);
// The proposal crosses the circle earlier and ends inside it. Focus the fixed endpoint.
const excludedGoal = assessRouteSafety([direct[0], at(100), center]);
assert.equal(excludedGoal.verdict, 'hold');
assert.match(excludedGoal.reason, /A 站位於人工禁行區/);
assert.deepEqual(excludedGoal.point, center);
assert.deepEqual(excludedGoal.segment.at(-1), center);
const excludedBase = assessRouteSafety([center, direct[1]]);
assert.equal(excludedBase.verdict, 'hold');
assert.match(excludedBase.reason, /基地位於人工禁行區/);
assert.deepEqual(excludedBase.segment[0], center);
C.setNavigationContext(null);

// Both endpoints are flat; the peak slope must come from the sampled interior.
C.setDEM({ ...fixture, heights: fixture.heights.map((_, i) => {
  const x = (i % fixture.width) * 10 - 200;
  return 15 * Math.exp(-((x - 90) ** 2) / 400);
}) });
const steep = assessRouteSafety(direct, { slopeLimit: 3 });
assert.equal(steep.verdict, 'reroute');
assert.deepEqual(steep.point, steep.worstSlopePoint);
assert(steep.point.x > 0 && steep.point.x < 150);
within(steep.maxSlope, Math.max(...steep.samples.map(p => C.slopeDeg(p.x, p.y))));
within(steep.maxSlope, C.slopeDeg(steep.point.x, steep.point.y));
const rough = assessRouteSafety(direct, { slopeLimit: 45, roughnessLimit: 0.1 });
assert.equal(rough.verdict, 'reroute');
within(rough.maxRoughness, C.roughness(rough.point.x, rough.point.y));
assert.match(rough.reason, /粗糙度/);
// A is over the limit even though the highest slope/roughness and a narrow exclusion lie earlier.
C.setNavigationContext(nav);
const goal = at(120);
const steepGoal = assessRouteSafety([direct[0], goal], { slopeLimit: 3 });
assert.equal(steepGoal.verdict, 'hold');
assert(steepGoal.noGoCrossed && steepGoal.maxSlope > C.slopeDeg(goal.x, goal.y));
assert.deepEqual(steepGoal.point, goal);
assert.deepEqual(steepGoal.segment.at(-1), goal);
assert.match(steepGoal.reason, /坡度/);
const roughBase = assessRouteSafety([goal, direct[0]], { slopeLimit: 45, roughnessLimit: 0.02 });
assert.equal(roughBase.verdict, 'hold');
assert(roughBase.maxRoughness > C.roughness(goal.x, goal.y));
assert.deepEqual(roughBase.point, goal);
assert.deepEqual(roughBase.segment[0], goal);
assert.match(roughBase.reason, /基地.*粗糙度/);
C.setNavigationContext(null);

C.setDEM(fixture);
const beyondLocal = [at(0), at(300)];
const missing = assessRouteSafety(beyondLocal);
assert.equal(missing.verdict, 'hold');
assert(missing.missingDistance > 0 && missing.point.x > 200);
within(missing.missingDistance + missing.localDistance, missing.length);
C.setMolaFallback(() => 500, { minX: -5000, maxX: 5000, minY: -5000, maxY: 5000 });
const mixed = assessRouteSafety(beyondLocal);
assert.equal(mixed.verdict, 'hold');
assert(mixed.localDistance > 0 && mixed.molaDistance > 0 && mixed.missingDistance === 0);
assert.match(mixed.reason, /MOLA/);
assert.equal(mixed.maxSlope, 0);
const coarse = assessRouteSafety([at(300), at(400)]);
assert.equal(coarse.maxRoughness, null);
within(coarse.molaDistance, coarse.length);
C.clearDEM();
assert.equal(assessRouteSafety(direct).verdict, 'hold');
assert.equal(assessRouteSafety(direct).maxSlope, null);

const json = file => JSON.parse(readFileSync(file, 'utf8'));
const { guidedStart: start, targets: [a] } = json('data/mission.json');
C.setDEM(json('data/jezero-extended/dem.json'));
const demo = assessRouteSafety([start, a]);
assert.equal(demo.verdict, 'reroute');
assert(demo.length > 5000);
assert(demo.maxSlope > 15);
assert(demo.steepSections.length > 1);
assert(demo.steepDistance > 0 && demo.steepDistance < demo.length);
const highlightedLength = demo.steepSections.reduce((sum, points) =>
  sum + points.slice(1).reduce((length, point, i) => length + C.distance(points[i], point), 0), 0);
within(highlightedLength, demo.steepDistance);
assert.equal(demo.noGoCrossed, false);
assert.equal(demo.missingDistance + demo.molaDistance, 0);
assert.deepEqual(demo.point, demo.worstSlopePoint);
assert(C.slopeDeg(start.x, start.y) <= 15 && C.slopeDeg(a.x, a.y) <= 15);
assert(C.distance(start, demo.point) > 40 && C.distance(a, demo.point) > 40);
console.log('Predeparture assessments passed for local slopes, exclusions, polyline detours, coverage gaps and the Jezero demo.');
