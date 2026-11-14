export const scienceLayerIds = ['thermal', 'spectral', 'geophysical', 'atmospheric', 'radiation', 'chemical'];

export function decodeScienceGrid(buffer, meta) {
  if (buffer.byteLength !== meta.width * meta.height * 4) throw Error('科學格網大小不符');
  const view = new DataView(buffer);
  const values = new Float32Array(meta.width * meta.height);
  for (let i = 0; i < values.length; i++) values[i] = view.getFloat32(i * 4, true);
  return values;
}

// Nearest original downloaded cell. No spatial interpolation of coarse observations.
export function sampleScienceGrid(meta, values, lat, lng) {
  if (!meta || meta.kind !== 'raster' || !values || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90) return null;
  const lon = ((lng + 180) % 360 + 360) % 360 - 180;
  const col = Math.min(meta.width - 1, Math.floor((lon + 180) / 360 * meta.width));
  const row = Math.min(meta.height - 1, Math.floor((90 - lat) / 180 * meta.height));
  const value = values[row * meta.width + col];
  return Number.isFinite(value) ? value : null;
}

export function createScienceLoader(asset, fetcher = fetch) {
  let manifest;
  const cache = new Map();
  async function load(key) {
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
  return { load };
}
