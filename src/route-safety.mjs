import C from '../core.mjs';

const interpolate = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);

function productAt(x, y) {
  if (x < C.LIMIT.minX || x > C.LIMIT.maxX || y < C.LIMIT.minY || y > C.LIMIT.maxY) return null;
  return C.terrainProduct(x, y);
}

// A narrow exclusion can sit entirely between two DEM samples. Locate the crossing for the map marker.
function locateCrossing(start, end) {
  let a = start, b = end;
  while (C.distance(a, b) > 0.25) {
    const middle = interpolate(a, b, 0.5);
    if (C.navigationAt(middle.x, middle.y).blocked) return middle;
    if (C.navigationSegmentBlocked(a, middle)) b = middle;
    else a = middle;
  }
  return interpolate(a, b, 0.5);
}

// Assess a proposed polyline using the active terrain and exclusions, without changing planner settings.
export function assessRouteSafety(path, { slopeLimit = 15, roughnessLimit = 1 } = {}) {
  const result = {
    verdict: 'hold', reason: '', point: null, segment: null, samples: [], length: 0,
    maxSlope: null, worstSlopePoint: null, maxRoughness: null,
    localDistance: 0, molaDistance: 0, missingDistance: 0, noGoCrossed: null,
    steepSections: [], steepDistance: 0
  };
  if (!Array.isArray(path) || path.length < 2 || !path.every(finitePoint)) {
    result.reason = 'Select the base and Site A to define the segment to assess.';
    return result;
  }
  if (!Number.isFinite(slopeLimit) || slopeLimit < 1 || slopeLimit > 45 ||
      !Number.isFinite(roughnessLimit) || roughnessLimit < 0 || roughnessLimit > 1) {
    result.reason = 'Set a slope limit of 1–45° and a roughness limit of 0–1, then check the route.';
    return result;
  }
  const focus = {};
  function checkSample(point, segment, midpoint = false) {
    const { x, y } = point;
    const last = result.samples.at(-1);
    if (!last || x !== last.x || y !== last.y) result.samples.push(point);
    const product = productAt(x, y);
    if (!product) {
      focus.missing ??= { point, segment };
      return 'missingDistance';
    }
    const { slope, rough } = C.risk(x, y);
    if (midpoint && slope > slopeLimit) {
      const [from, to] = segment;
      const section = result.steepSections.at(-1);
      if (section?.at(-1) === from) section.push(to);
      else result.steepSections.push([from, to]);
      result.steepDistance += C.distance(from, to);
    }
    if (Number.isFinite(slope) && (result.maxSlope === null || slope > result.maxSlope)) {
      result.maxSlope = slope;
      result.worstSlopePoint = point;
      focus.slope = { point, segment };
    }
    if (Number.isFinite(rough) && (result.maxRoughness === null || rough > result.maxRoughness)) {
      result.maxRoughness = rough;
      focus.roughness = { point, segment };
    }
    if (!Number.isFinite(slope) || (!product.coarse && !Number.isFinite(rough))) focus.derivative ??= { point, segment };
    if (product.coarse) focus.coarse ??= { point, segment };
    return product.coarse ? 'molaDistance' : 'localDistance';
  }

  const spacing = C.routeSampleSpacing();
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const length = C.distance(a, b);
    if (!length) continue;
    result.length += length;
    const count = Math.ceil(length / spacing);
    let previous = { x: a.x, y: a.y };
    for (let j = 1; j <= count; j++) {
      const next = j === count ? { x: b.x, y: b.y } : interpolate(a, b, j / count);
      const middle = interpolate(previous, next, 0.5);
      const segment = [previous, next];
      if (j === 1) checkSample(previous, segment);
      // The midpoint assigns this small interval to one product. Coverage lengths are estimates.
      const distanceField = checkSample(middle, segment, true);
      result[distanceField] += length / count;
      checkSample(next, segment);
      if (!focus.zone && C.navigationSegmentBlocked(previous, next)) {
        focus.zone = { point: locateCrossing(previous, next), segment };
      }
      previous = next;
    }
  }
  if (!result.length) {
    result.reason = 'The base and Site A coincide. Select different locations and check again.';
    return result;
  }
  result.noGoCrossed = Boolean(focus.zone);
  function conclude(verdict, reason, location) {
    return Object.assign(result, { verdict, reason }, location);
  }
  // A new line between the same fixed endpoints cannot resolve a hazard at either end.
  const endpoints = [
    { name: 'Base', point: result.samples[0], segment: result.samples.slice(0, 2), advice: 'Choose a different starting point.' },
    { name: 'Site A', point: result.samples.at(-1), segment: result.samples.slice(-2), advice: 'Choose a different observation site.' }
  ];
  for (const { name, point, segment, advice } of endpoints) {
    const { x, y } = point;
    if (C.navigationAt(x, y).blocked) {
      result.noGoCrossed = true;
      return conclude('hold', `${name} is inside a marked exclusion zone. ${advice}`, { point, segment });
    }
    if (!productAt(x, y)) continue;
    const { slope, rough } = C.risk(x, y);
    if (slope > slopeLimit) {
      return conclude('hold', `${name} slope ${slope.toFixed(2)}°, above the limit of ${slopeLimit}°. ${advice}`, { point, segment });
    }
    if (rough > roughnessLimit) {
      return conclude('hold', `${name} roughness ${rough.toFixed(3)}, above the limit of ${roughnessLimit}. ${advice}`, { point, segment });
    }
  }
  if (focus.zone) return conclude('reroute', 'The route crosses a marked exclusion zone. Detour around the marked segment and check the new route.', focus.zone);
  if (result.maxSlope > slopeLimit) {
    return conclude('reroute', `The maximum sampled slope of ${result.maxSlope.toFixed(2)}° exceeds the ${slopeLimit}° limit. Detour around this slope.`, focus.slope);
  }
  if (result.maxRoughness > roughnessLimit) {
    return conclude('reroute', `Sampled terrain roughness exceeds the ${roughnessLimit} limit. Choose a smoother segment.`, focus.roughness);
  }
  if (focus.missing) return conclude('hold', 'Some segments lack elevation data. Obtain terrain data or choose a route with coverage.', focus.missing);
  if (focus.derivative) return conclude('hold', 'Some samples lack the neighboring elevations needed to calculate slope or roughness. Check terrain coverage on this segment.', focus.derivative);
  if (focus.coarse) return conclude('hold', 'Some segments have only kilometer-scale MOLA elevations. Finer terrain data are needed to assess local roughness.', focus.coarse);
  return conclude('go', 'Sampled slope and roughness stay within the limits, and the route avoids marked exclusion zones. The terrain data support proceeding to Site A.', focus.slope);
}
