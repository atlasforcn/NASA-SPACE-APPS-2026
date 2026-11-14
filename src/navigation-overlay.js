import L from 'leaflet';
import C from '../core.mjs';

// Sample in geographic map pixels, then transform into the active DEM frame.
// This also keeps regional, polar and seam-crossing maps aligned with routes.
export function createNavigationOverlay(map) {
  const RiskGrid = L.GridLayer.extend({
    createTile(coords) {
      const tile = document.createElement('canvas');
      const size = this.getTileSize();
      tile.width = size.x; tile.height = size.y;
      tile.className = 'navigation-risk-tile';
      const ctx = tile.getContext('2d'), step = 8;
      for (let y = 0; y < size.y; y += step) for (let x = 0; x < size.x; x += step) {
        const geo = map.unproject(L.point(coords.x * size.x + x + step/2, coords.y * size.y + y + step/2), coords.z);
        if (Math.abs(geo.lat) > 90) continue;
        const p = C.latLngToLocal(geo.lat, ((geo.lng + 180) % 360 + 360) % 360 - 180);
        if (p.x < C.LIMIT.minX || p.x > C.LIMIT.maxX || p.y < C.LIMIT.minY || p.y > C.LIMIT.maxY || !Number.isFinite(p.x + p.y)) continue;
        const risk = C.risk(p.x, p.y);
        if (!risk.blocked) continue;
        ctx.fillStyle = risk.unknown ? '#eab45a66' : '#ff514b77';
        ctx.fillRect(x, y, step, step);
      }
      return tile;
    },
  });
  return new RiskGrid({pane: 'navigationRisk', tileSize: 256, updateWhenIdle: true, keepBuffer: 1, attribution: '導航遮罩：DEM 坡度／粗糙度／缺測'});
}
