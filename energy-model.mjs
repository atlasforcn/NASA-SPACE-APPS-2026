// Relative traction energy: 1 unit equals 1 km on flat ground.
// No calibrated vehicle/battery data or negative-energy regeneration assumed.
export const minimumEnergyRatio = 0.25;
export function validateEnergyOptions({ uphillPenalty = 10, downhillSaving = 5 } = {}) {
  if (![uphillPenalty, downhillSaving].every(v => Number.isFinite(v) && v >= 0 && v <= 100))
    throw Error('Uphill and downhill energy coefficients must be between 0 and 100');
}
export function energyStep(distance, rise, { uphillPenalty = 10, downhillSaving = 5 } = {}) {
  if (!Number.isFinite(distance) || !Number.isFinite(rise) || distance < 0) return Infinity;
  if (!distance) return rise === 0 ? 0 : Infinity;
  const grade = rise / distance;
  const ratio = grade >= 0 ? 1 + uphillPenalty * grade : Math.max(minimumEnergyRatio, 1 + downhillSaving * grade);
  return Math.hypot(distance, rise) * ratio;
}
export function segmentEnergy(a, b, elevation, sampleStep, options = {}, factorAt = () => 1, sameGrid = () => true) {
  const distance = Math.hypot(b.x-a.x, b.y-a.y), n = Math.max(1, Math.ceil(distance / sampleStep));
  let energy = 0, previous = elevation(a.x,a.y);
  let p = a;
  for (let i = 1; i <= n; i++) {
    const q = {x:a.x+(b.x-a.x)*i/n, y:a.y+(b.y-a.y)*i/n};
    const z = elevation(q.x,q.y);
    const t=(i-.5)/n;
    energy += energyStep(distance/n, sameGrid(p,q) ? z-previous : 0, options)*factorAt(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t);
    previous = z;
    p = q;
  }
  return energy;
}
