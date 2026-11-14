// Camera pixels become bearing/elevation samples; gaps remain unobserved.
export function observationFromTrace(trace, width, height, { fov = 60, pitch = 0, angleStep = 3, projection = "perspective", ...options } = {}) {
  const maximum = projection === "equirectangular" ? 360 : 150;
  if (!["perspective", "equirectangular"].includes(projection) || !(fov >= 10 && fov <= maximum) || !Number.isFinite(pitch) || Math.abs(pitch) > 60)
    throw Error(`水平視角須為 10–${maximum}°，俯仰角須為 −60–60°。`);
  const focal = width / (2 * Math.tan(fov * Math.PI / 360));
  const tilt = pitch * Math.PI / 180, rays = [];
  for (let x = 0; x < trace.length; x++) {
    if (!Number.isFinite(trace[x])) continue;
    if (projection === "equirectangular") {
      const elevation = pitch + (height / 2 - trace[x]) * fov / width;
      if (Math.abs(elevation) < 90) rays.push({ x, bearing: (x / width - .5) * fov, elevation });
      continue;
    }
    const u = (x - width / 2) / focal, v = (height / 2 - trace[x]) / focal;
    const forward = Math.cos(tilt) - v * Math.sin(tilt), up = Math.sin(tilt) + v * Math.cos(tilt);
    rays.push({ x, bearing: Math.atan2(u, forward) * 180 / Math.PI,
      elevation: Math.atan2(up, Math.hypot(u, forward)) * 180 / Math.PI });
  }
  rays.sort((a, b) => a.bearing - b.bearing);
  const angles = [], elevations = [], valid = [];
  for (let a = 0; a < 360; a += angleStep) {
    angles.push(a);
    const bearing = a > 180 ? a - 360 : a;
    const index = rays.findIndex(p => p.bearing >= bearing);
    const right = rays[index], left = rays[Math.max(0, index - 1)];
    const usable = !!(right && left && bearing >= left.bearing && Math.abs(right.x - left.x) <= 2);
    valid.push(usable);
    const t = usable && right.bearing !== left.bearing ? (bearing - left.bearing) / (right.bearing - left.bearing) : 0;
    elevations.push(usable ? left.elevation + (right.elevation - left.elevation) * t : null);
  }
  if (valid.filter(Boolean).length < 6) throw Error("輪廓太短：請繪製更寬的山稜線，至少涵蓋六個取樣方向。");
  return { angles, elevations, valid, cameraHeight: 1.7,
    kind: "user-horizon", options: { ...options, angleStep } };
}

// Estimate sky colour from the brighter top border, then follow the first
// sustained departure from that sky. Columns without visible sky stay missing.
export function extractHorizon({ data, width, height }) {
  if (width < 1 || height < 5) return Array(width).fill(null);
  const pixels = [];
  for (let x = 0; x < width; x++) {
    const offset = x * 4, rgb = Array.from(data.slice(offset, offset + 3));
    pixels.push({ rgb, light: rgb.reduce((a, b) => a + b, 0) / 3 });
  }
  pixels.sort((a, b) => b.light - a.light);
  const sky = pixels.slice(0, Math.max(1, Math.ceil(width / 4)));
  const colour = [0, 1, 2].map(c => sky.reduce((sum, p) => sum + p.rgb[c], 0) / sky.length);
  const deviation = sky.reduce((sum, p) => sum + p.rgb.reduce((v, c, i) => v + Math.abs(c - colour[i]), 0) / 3, 0) / sky.length;
  const tolerance = Math.max(20, Math.min(45, deviation * 3 + 12));
  const isSky = (x, y) => {
    const offset = (y * width + x) * 4;
    return [0, 1, 2].reduce((sum, i) => sum + Math.abs(data[offset + i] - data[x * 4 + i]), 0) / 3 <= tolerance;
  };
  return Array.from({ length: width }, (_, x) => {
    if (colour.reduce((sum, c, i) => sum + Math.abs(data[x * 4 + i] - c), 0) / 3 > Math.max(45, tolerance)) return null;
    for (let y = 1; y < height - 3; y++) {
      let terrain = 0;
      for (let k = 0; k < 4; k++) if (!isSky(x, y + k)) terrain++;
      if (terrain >= 3) return y < 2 ? null : y;
    }
    return null;
  });
}
