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
    localDistance: 0, molaDistance: 0, missingDistance: 0, noGoCrossed: null
  };
  if (!Array.isArray(path) || path.length < 2 || !path.every(finitePoint)) {
    result.reason = '請先選取基地與 A 站，建立要檢查的路段。';
    return result;
  }
  if (!Number.isFinite(slopeLimit) || slopeLimit < 1 || slopeLimit > 45 ||
      !Number.isFinite(roughnessLimit) || roughnessLimit < 0 || roughnessLimit > 1) {
    result.reason = '請確認坡度上限介於 1–45°，粗糙度上限介於 0–1，再檢查路線。';
    return result;
  }
  const focus = {};
  function checkSample(point, segment) {
    const { x, y } = point;
    const last = result.samples.at(-1);
    if (!last || x !== last.x || y !== last.y) result.samples.push(point);
    const product = productAt(x, y);
    if (!product) {
      focus.missing ??= { point, segment };
      return 'missingDistance';
    }
    const { slope, rough } = C.risk(x, y);
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
      const distanceField = checkSample(middle, segment);
      result[distanceField] += length / count;
      checkSample(next, segment);
      if (!focus.zone && C.navigationSegmentBlocked(previous, next)) {
        focus.zone = { point: locateCrossing(previous, next), segment };
      }
      previous = next;
    }
  }
  if (!result.length) {
    result.reason = '基地與 A 站重合，請選取不同的位置再檢查路線。';
    return result;
  }
  result.noGoCrossed = Boolean(focus.zone);
  function conclude(verdict, reason, location) {
    return Object.assign(result, { verdict, reason }, location);
  }
  // A new line between the same fixed endpoints cannot resolve a hazard at either end.
  const endpoints = [
    { name: '基地', point: result.samples[0], segment: result.samples.slice(0, 2), advice: '請重新評估出發位置。' },
    { name: 'A 站', point: result.samples.at(-1), segment: result.samples.slice(-2), advice: '請暫緩造訪，或另選觀測位置。' }
  ];
  for (const { name, point, segment, advice } of endpoints) {
    const { x, y } = point;
    if (C.navigationAt(x, y).blocked) {
      result.noGoCrossed = true;
      return conclude('hold', `${name}位於人工禁行區內，更換中途路段仍會經過此點。${advice}`, { point, segment });
    }
    if (!productAt(x, y)) continue;
    const { slope, rough } = C.risk(x, y);
    if (slope > slopeLimit) {
      return conclude('hold', `${name}本身超限，坡度 ${slope.toFixed(2)}° 超過 ${slopeLimit}°。更換中途路段仍會經過此點。${advice}`, { point, segment });
    }
    if (rough > roughnessLimit) {
      return conclude('hold', `${name}本身超限，地形粗糙度 ${rough.toFixed(3)} 超過 ${roughnessLimit}。更換中途路段仍會經過此點。${advice}`, { point, segment });
    }
  }
  if (focus.zone) return conclude('reroute', '路線穿越已標示的人工禁行區。請繞開標記的路段，再檢查新路線。', focus.zone);
  if (result.maxSlope > slopeLimit) {
    return conclude('reroute', `取樣點的最大坡度 ${result.maxSlope.toFixed(2)}° 超過 ${slopeLimit}° 上限。請繞開此坡段。`, focus.slope);
  }
  if (result.maxRoughness > roughnessLimit) {
    return conclude('reroute', `取樣點的地形粗糙度超過 ${roughnessLimit} 上限。請改走起伏較小的路段。`, focus.roughness);
  }
  if (focus.missing) return conclude('hold', '部分路段缺少高程資料。請補齊地形資料，或改走有資料覆蓋的路線。', focus.missing);
  if (focus.derivative) return conclude('hold', '部分取樣點缺少可計算坡度或粗糙度的鄰近高程。請補查該段地形。', focus.derivative);
  if (focus.coarse) return conclude('hold', '部分路段只有公里級 MOLA 高程，無法評估局部粗糙度。請取得較細的地形資料後再決定。', focus.coarse);
  return conclude('go', '沿線取樣坡度與粗糙度均在設定上限內，路線避開已標示的禁行區。依現有地形資料，可規劃前往 A 站。', focus.slope);
}
