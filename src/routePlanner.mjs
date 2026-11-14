import C from '../core.mjs';
import { energyStep, validateEnergyOptions } from '../energy-model.mjs';

// Times are explicit Earth-derived walking assumptions, independent of rover simulation speed.
export function measureRoute(path, options = {}) {
  const { speedKmh = 3, highSlope = 15 } = options;
  validateEnergyOptions(options);
  let energy = 0;
  let length = 0, surface = 0, gain = 0, loss = 0, maxSlope = 0, steep = 0, riskDistance = 0, hours = 0;
  const step = Math.max(10, (C.demInfo()?.cellMeters || 40) / 3);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], d = C.distance(a, b), n = Math.max(1, Math.ceil(d / step));
    for (let k = 1; k <= n; k++) {
      const p = { x: a.x + (b.x-a.x)*(k-1)/n, y: a.y + (b.y-a.y)*(k-1)/n };
      const q = { x: a.x + (b.x-a.x)*k/n, y: a.y + (b.y-a.y)*k/n };
      const dz = C.elevation(q.x,q.y)-C.elevation(p.x,p.y), ds = d/n;
      const r = C.risk((p.x+q.x)/2,(p.y+q.y)/2);
      if (!Number.isFinite(dz) || r.unknown) return null;
      energy += energyStep(ds,dz,options);
      length += ds; surface += Math.hypot(ds,dz);
      gain += Math.max(0,dz); loss += Math.max(0,-dz); maxSlope = Math.max(maxSlope,r.slope);
      if (r.slope > highSlope) steep += ds;
      riskDistance += ds*(r.cost-1);
      // Tobler curve normalized so configured speed is the flat-ground speed.
      const speed = speedKmh * Math.exp(-3.5*(Math.abs((ds ? dz/ds : 0)+0.05)-0.05));
      hours += ds/1000/speed;
    }
  }
  return { energy, length, surface, gain, loss, maxSlope, steep, riskDistance, riskScore: length ? riskDistance/length : 0, hours };
}

export function buildItinerary(start, stops, options = {}) {
  const { speedKmh = 3, riskWeight = 1, highSlope = 15, roundTrip = false, stopMinutes = 15, budgetHours = 8 } = options;
  if (!stops.length || ![speedKmh,riskWeight,highSlope,stopMinutes,budgetHours].every(Number.isFinite) || speedKmh <= 0 || speedKmh > 10 || riskWeight < 0 || riskWeight > 5 || highSlope < 0 || highSlope > 45 || stopMinutes < 0 || budgetHours <= 0) throw Error('請輸入有效的速度（大於 0 且不超過 10 km/h）、風險權重（0–5）與時間預算。');
  validateEnergyOptions(options);
  const destinations = [...stops, ...(roundTrip ? [{ ...start, name: '返回起點', returnLeg: true }] : [])];
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
      legs.push({ name: target.name, ...stats, stopMinutes: target.returnLeg ? 0 : stopMinutes });
      from = target;
    }
    const stats = measureRoute(path, {...options,speedKmh,highSlope});
    const totalHours = stats.hours + stops.length*stopMinutes/60;
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
