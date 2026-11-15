import C from '../core.mjs';
import S from '../skyline.mjs';
import { geoDistance } from './navigation-context.mjs';

const mapWidth = 480;
const mapHeight = 300;

// Keep the search area tied to the route the user sees. The hidden position
// and the user's estimate never determine the window supplied to the matcher.
function routeBounds(path, cellSize) {
  let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
  for (const { x, y } of path) {
    west = Math.min(west, x);
    east = Math.max(east, x);
    south = Math.min(south, y);
    north = Math.max(north, y);
  }
  const padding = Math.max(150, cellSize * 4, Math.max(east - west, north - south) * .14);
  const aspect = mapWidth / mapHeight;
  const halfWidth = Math.max(east - west + 2 * padding, (north - south + 2 * padding) * aspect) / 2;
  const cx = (east + west) / 2, cy = (north + south) / 2;
  return { minX: cx - halfWidth, maxX: cx + halfWidth,
    minY: cy - halfWidth / aspect, maxY: cy + halfWidth / aspect };
}

function renderTerrain(bounds) {
  const canvas = document.createElement('canvas');
  canvas.width = mapWidth;
  canvas.height = mapHeight;
  const ctx = canvas.getContext('2d');
  const pixels = ctx.createImageData(mapWidth, mapHeight);
  const heights = new Float32Array(mapWidth * mapHeight);
  const spacing = (bounds.maxX - bounds.minX) / mapWidth;
  let low = Infinity, high = -Infinity;
  for (let row = 0; row < mapHeight; row++) {
    for (let col = 0; col < mapWidth; col++) {
      const z = C.demAt(bounds.minX + (col + .5) * spacing, bounds.maxY - (row + .5) * spacing);
      heights[row * mapWidth + col] = z;
      if (!Number.isFinite(z)) continue;
      low = Math.min(low, z);
      high = Math.max(high, z);
    }
  }
  const range = Math.max(1, high - low);
  for (let i = 0; i < heights.length; i++) {
    const z = heights[i], offset = 4 * i;
    if (Number.isFinite(z)) {
      const west = i % mapWidth ? heights[i - 1] : z;
      const north = i >= mapWidth ? heights[i - mapWidth] : z;
      const slope = ((Number.isFinite(west) ? west - z : 0) + (Number.isFinite(north) ? north - z : 0)) / spacing;
      const shade = 29 + 59 * (z - low) / range + 35 * Math.tanh(4 * slope);
      pixels.data[offset] = shade;
      pixels.data[offset + 1] = shade * 1.07;
      pixels.data[offset + 2] = shade * 1.04;
    } else {
      pixels.data[offset] = 12;
      pixels.data[offset + 1] = 24;
      pixels.data[offset + 2] = 29;
    }
    pixels.data[offset + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas.toDataURL('image/png');
}

// A local route can extend into a coarse MOLA fallback outside the active tile.
// Clip each segment in route order so even a short covered section is eligible.
function coveredSegments(path, grid) {
  const segments = [];
  let distance = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    let start = 0, end = 1;
    for (const [origin, delta, min, max] of [
      [a.x, b.x - a.x, grid.xMin, grid.xMax],
      [a.y, b.y - a.y, grid.yMin, grid.yMax],
    ]) {
      if (delta === 0) {
        if (origin < min || origin > max) end = -1;
        continue;
      }
      const t1 = (min - origin) / delta, t2 = (max - origin) / delta;
      start = Math.max(start, Math.min(t1, t2));
      end = Math.min(end, Math.max(t1, t2));
    }
    if (start >= end) continue;
    const length = C.distance(a, b) * (end - start);
    segments.push({ a, b, start, end, length, offset: distance });
    distance += length;
  }
  if (!segments.length) throw new Error('這條路線未穿過目前的 DEM 圖幅。請改選有地形資料的路段，或為圖幅外的長路線建立 MOLA 區域任務。');
  return { segments, distance };
}

function routePoint({ segments, distance }, fraction) {
  const d = fraction * distance;
  const { a, b, start, end, length, offset } = segments.find(s => s.offset + s.length >= d);
  const t = start + (end - start) * (d - offset) / length;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function searchMap(dem, observation, bounds, coarseStep, signal) {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const worker = new Worker(new URL('./skyline-worker.js', import.meta.url), { type: 'module' });
    function finish() {
      signal?.removeEventListener('abort', cancel);
      worker.terminate();
    }
    function cancel() {
      finish();
      reject(new DOMException('搜尋已取消', 'AbortError'));
    }
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') return;
      finish();
      if (data.type === 'result') resolve(data.result);
      else reject(new Error(data.message || '山稜搜尋失敗'));
    };
    worker.onerror = () => {
      finish();
      reject(new Error('無法執行山稜搜尋，請重新嘗試。'));
    };
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      worker.postMessage({ id: 1, dem, observation, bounds,
        options: { coarseStep, candidateSeparation: Math.max(30, coarseStep) } });
    } catch (error) {
      finish();
      reject(error);
    }
  });
}

export function makeRouteChallenge({ route, grid, profileOptions, isCurrent, lifetime }) {
  if (!grid || !route?.path || !isCurrent()) throw new Error('請先選擇有地形資料的路線。');
  const path = [];
  for (const { x, y } of route.path) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('此路線缺少座標。');
    const last = path.at(-1);
    if (last && x === last.x && y === last.y) continue;
    path.push({ x, y });
  }
  if (path.length < 2) throw new Error('請先建立一段有長度的路線。');

  const cellSize = (grid.xMax - grid.xMin) / (grid.width - 1);
  const bounds = routeBounds(path, cellSize);
  const coverage = coveredSegments(path, grid);
  const searchBounds = {
    minX: Math.max(bounds.minX, grid.xMin), maxX: Math.min(bounds.maxX, grid.xMax),
    minY: Math.max(bounds.minY, grid.yMin), maxY: Math.min(bounds.maxY, grid.yMax),
  };
  const coarseStep = Math.max(cellSize,
    Math.max(searchBounds.maxX - searchBounds.minX, searchBounds.maxY - searchBounds.minY) / 20);
  const options = { ...profileOptions, angleStep: 6, gridOnly: true };
  const regional = grid.schema === 'mars-region-grid-v1';
  const errorDistance = regional
    ? (a, b) => geoDistance(C.localToLatLng(a.x, a.y), C.localToLatLng(b.x, b.y))
    : C.distance;
  let previous = null;
  function checkRegion() {
    if (!isCurrent()) throw new Error('地形區域已切換，請重新進入路線定位。');
  }
  function newRound() {
    checkRegion();
    const offset = Math.random();
    // Probe multiple interior distances, including on routes with gaps in DEM
    // coverage. Prefer a viewpoint separated from the previous round in metres.
    const fractions = Array.from({ length: 20 }, (_, i) => .05 + .9 * ((offset + i * .381966) % 1));
    const points = fractions.map(f => routePoint(coverage, f));
    const first = previous ? points.filter(p => C.distance(p, previous) >= coverage.distance * .1) : points;
    let truth, observation;
    for (const point of [...new Set([...first, ...points])]) {
      if (!Number.isFinite(C.demAt(point.x, point.y))) continue;
      const scan = S.simulate({ ...point, heading: 0 }, { ...options, seed: Math.floor(Math.random() * 2 ** 32) });
      if (scan.valid.filter(Boolean).length < 12) continue;
      truth = point;
      observation = scan;
      break;
    }
    if (!truth) throw new Error('這段路線的 DEM 山稜覆蓋不足。請改選有地形資料的路段。若長路線超出局部圖幅，可建立 MOLA 區域任務來比對大尺度山形。');
    previous = truth;
    return {
      observation,
      preview(guess) {
        checkRegion();
        return S.profile(guess, options);
      },
      reveal(guess) {
        checkRegion();
        return { truth: { ...truth }, guessErrorMeters: errorDistance(guess, truth) };
      },
      async locate(signal) {
        checkRegion();
        const result = await searchMap(grid, observation, searchBounds, coarseStep,
          signal && lifetime ? AbortSignal.any([signal, lifetime]) : signal || lifetime);
        checkRegion();
        const candidate = result.candidates[0] || null;
        return { candidate, errorMeters: candidate ? errorDistance(candidate, truth) : null,
          status: result.status, reason: result.reason };
      },
    };
  }
  const partialCoverage = path.some(p => p.x < grid.xMin || p.x > grid.xMax || p.y < grid.yMin || p.y > grid.yMax);
  return { name: route.name, startLabel: route.startLabel, endLabel: route.endLabel,
    path, bounds, mapImage: renderTerrain(bounds), regional, partialCoverage, newRound };
}
