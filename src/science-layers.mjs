export const scienceLayerIds = ['thermal', 'spectral', 'geophysical', 'atmospheric', 'radiation', 'chemical'];

export function decodeScienceGrid(buffer, meta) {
  if (buffer.byteLength !== meta.width * meta.height * 4) throw Error('科學格網大小不符');
  const view = new DataView(buffer);
  const values = new Float32Array(meta.width * meta.height);
  for (let i = 0; i < values.length; i++) values[i] = view.getFloat32(i * 4, true);
  return values;
}

// Nearest original downloaded cell. No spatial interpolation of coarse observations.
export function scienceCell(meta, values, lat, lng) {
  if (!meta || meta.kind !== 'raster' || !values || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90) return null;
  const lon = ((lng + 180) % 360 + 360) % 360 - 180;
  const col = Math.min(meta.width - 1, Math.floor((lon + 180) / 360 * meta.width));
  const row = Math.min(meta.height - 1, Math.floor((90 - lat) / 180 * meta.height));
  const value = values[row * meta.width + col];
  const dx = 360 / meta.width, dy = 180 / meta.height;
  return { row, col, west: -180 + col * dx, east: -180 + (col+1) * dx,
    north: 90-row*dy, south: 90-(row+1)*dy, value: Number.isFinite(value) ? value : null };
}

export function sampleScienceGrid(meta, values, lat, lng) {
  return scienceCell(meta, values, lat, lng)?.value ?? null;
}

export function createScienceLoader(asset, fetcher = fetch) {
  let manifest;
  const cache = new Map();
  const pending = new Map();
  async function download(key) {
    if (!scienceLayerIds.includes(key)) throw Error('未知科學圖層');
    if (cache.has(key)) return cache.get(key);
    if (!manifest) {
      const response = await fetcher(asset('data/science/manifest.json'));
      if (!response.ok) throw Error('科學圖層目錄載入失敗');
      manifest = await response.json();
    }
    const meta = manifest.datasets[key];
    let values = null;
    if (meta.kind === 'raster') {
      const response = await fetcher(asset(`data/science/${key}.bin`));
      if (!response.ok) throw Error('科學數值格網載入失敗');
      values = decodeScienceGrid(await response.arrayBuffer(), meta);
    }
    const result = { meta, values };
    cache.set(key, result);
    return result;
  }
  function load(key) {
    if (!pending.has(key)) pending.set(key, download(key).finally(() => pending.delete(key)));
    return pending.get(key);
  }
  return { load };
}
