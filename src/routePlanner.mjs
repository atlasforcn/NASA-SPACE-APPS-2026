import C from '../core.mjs';
import { energyStep, validateEnergyOptions } from '../energy-model.mjs';

// Times are explicit Earth-derived walking assumptions, independent of rover simulation speed.
export function measureRoute(path, options = {}) {
  const { speedKmh = 3, highSlope = 15 } = options;
  validateEnergyOptions(options);
  let energy = 0, materialEnergy = 0, unknownMaterialDistance = 0, molaDistance = 0;
  let seamDistance = 0;
  const terrainSegments = [];
  const causeDistances = new Map();
  let length = 0, surface = 0, gain = 0, loss = 0, maxSlope = 0, steep = 0, riskDistance = 0, hours = 0;
  const step = Math.max(10, (C.demInfo()?.cellMeters || 40) / 3);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], d = C.distance(a, b), n = Math.max(1, Math.ceil(d / step));
    for (let k = 1; k <= n; k++) {
      const p = { x: a.x + (b.x-a.x)*(k-1)/n, y: a.y + (b.y-a.y)*(k-1)/n };
      const q = { x: a.x + (b.x-a.x)*k/n, y: a.y + (b.y-a.y)*k/n };
      const ds = d/n, midpoint = {x:(q.x+p.x)/2,y:(q.y+p.y)/2};
      const product = C.terrainProduct(midpoint.x,midpoint.y);
      const seam = !C.sameHeightGrid(p,midpoint) || !C.sameHeightGrid(midpoint,q);
      const dz = seam ? 0 : C.elevation(q.x,q.y)-C.elevation(p.x,p.y);
      if (!C.validDEMPoint(p.x,p.y) || !C.validDEMPoint(q.x,q.y)) return null;
      if (seam) seamDistance += ds;
      if (product?.coarse) molaDistance += ds;
      const previous = terrainSegments.at(-1);
      if (previous && previous.product === product?.id && previous.seam === seam && previous.sampling === product?.sampling) previous.distance += ds;
      else terrainSegments.push({ product: product?.id, sampling: product?.sampling, cellMeters: product?.cellMeters, distance: ds, seam, roughnessAvailable: !product?.coarse });
      const r = C.risk((p.x+q.x)/2,(p.y+q.y)/2);
      if (!Number.isFinite(dz) || r.unknown) return null;
      const nav = r.navigation;
      const baseEnergy=energyStep(ds,dz,options);
      energy += baseEnergy*nav.factor;
      materialEnergy += baseEnergy*(nav.factor-1);
      if(nav.unknown) unknownMaterialDistance += ds;
      for(const cause of nav.reasons) causeDistances.set(cause,(causeDistances.get(cause)||0)+ds);
      length += ds; surface += Math.hypot(ds,dz);
      gain += Math.max(0,dz); loss += Math.max(0,-dz); maxSlope = Math.max(maxSlope,r.slope);
      if (r.slope > highSlope) steep += ds;
      riskDistance += ds*(r.cost-1);
      // Tobler curve normalized so configured speed is the flat-ground speed.
      const speed = speedKmh * Math.exp(-3.5*(Math.abs((ds ? dz/ds : 0)+0.05)-0.05));
      hours += ds/1000/speed;
    }
  }
  return { terrainSegments, seamDistance, energy, materialEnergy, unknownMaterialDistance, molaDistance, navigationReasons: [...causeDistances].map(([reason,distance])=>({reason,distance})), length, surface, gain, loss, maxSlope, steep, riskDistance, riskScore: length ? riskDistance/length : 0, hours };
}

export function buildItinerary(start, stops, options = {}) {
  const { speedKmh = 3, riskWeight = 1, highSlope = 15, roundTrip = false, stopMinutes = 15, budgetHours = 8 } = options;
  if (!stops.length || ![speedKmh,riskWeight,highSlope,stopMinutes,budgetHours].every(Number.isFinite) || speedKmh <= 0 || speedKmh > 10 || riskWeight < 0 || riskWeight > 5 || highSlope < 0 || highSlope > 45 || stopMinutes < 0 || budgetHours <= 0) throw Error('Enter a speed above 0 and up to 10 km/h, a risk weight of 0–5 and a valid time budget.');
  for (const station of stops) if (station.stopMinutes != null && (!Number.isFinite(station.stopMinutes) || station.stopMinutes < 0)) throw Error('Time at each site must be zero or more minutes');
  validateEnergyOptions(options);
  const destinations = [...stops, ...(roundTrip ? [{ ...start, name: 'Return to start', returnLeg: true }] : [])];
  function build(mode) {
    let from = start;
    const path = [{...start}], legs = [], stopIndices = [];
    for (const target of destinations) {
      const leg = C.planPath(from, target, undefined, { ...options, mode, riskWeight });
      if (!leg.reachable) return { path: [], length: 0, reachable: false, failedStop: target.name, legs: [] };
      const stats = measureRoute(leg.path, { ...options, speedKmh, highSlope });
      if (!stats) return { path: [], length: 0, reachable: false, failedStop: target.name, legs: [] };
      path.push(...leg.path.slice(1));
      stopIndices.push(path.length-1);
      legs.push({ name: target.name, ...stats, stopMinutes: target.returnLeg ? 0 : (target.stopMinutes ?? stopMinutes) });
      from = target;
    }
    // Legs partition the same path. Reuse their sampled metrics instead of
    // walking every DEM cell a second time for the itinerary summary.
    const totals = new Map();
    for (const leg of legs) for (const { reason, distance } of leg.navigationReasons)
      totals.set(reason, (totals.get(reason) || 0) + distance);
    const stats = {
      seamDistance: 0, energy: 0, materialEnergy: 0, unknownMaterialDistance: 0, molaDistance: 0,
      length: 0, surface: 0, gain: 0, loss: 0, maxSlope: 0,
      steep: 0, riskDistance: 0, hours: 0,
      navigationReasons: [...totals].map(([reason, distance]) => ({ reason, distance })),
    };
    for (const leg of legs) {
      for (const key of ['seamDistance', 'energy', 'materialEnergy', 'unknownMaterialDistance', 'molaDistance', 'length', 'surface', 'gain', 'loss', 'steep', 'riskDistance', 'hours']) stats[key] += leg[key];
      stats.maxSlope = Math.max(stats.maxSlope, leg.maxSlope);
    }
    stats.riskScore = stats.length ? stats.riskDistance / stats.length : 0;
    const totalHours = stats.hours + legs.reduce((sum,leg)=>sum+leg.stopMinutes,0)/60;
    return { path, ...stats, reachable: true, legs, stopIndices, totalHours, marginHours: budgetHours-totalHours, options: {...options} };
  }
  let shortest = build('shortest'), safer = build('safer');
  // Both candidates obey the same hard constraints; compare actual sampled metrics.
  if (shortest.reachable && safer.reachable) {
    if (safer.surface < shortest.surface) shortest = safer;
    if (shortest.riskDistance < safer.riskDistance) safer = shortest;
  }
  let energy = build('energy');
  for (const candidate of [shortest,safer]) {
    if (candidate.reachable && (!energy.reachable || candidate.energy < energy.energy)) energy = candidate;
  }
  return { shortest, safer, energy };
}
