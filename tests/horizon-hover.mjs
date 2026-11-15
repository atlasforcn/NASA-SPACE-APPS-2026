import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve('dist');
const server = createServer((req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://local').pathname);
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  const target = file.endsWith(path.sep) ? file + 'index.html' : file;
  if (!fs.existsSync(target)) return res.writeHead(404).end();
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
  res.setHeader('Content-Type', types[path.extname(target)] || 'application/octet-stream');
  fs.createReadStream(target).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  browser = await chromium.launch({ headless: true,
    ...(fs.existsSync(edge) ? { executablePath: edge } : {}) });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.locator('#start-free').click();
  await page.waitForFunction(() => window.__mission?.state.ready);
  const hover = fraction => page.locator('#panorama').evaluate((canvas, fraction) => {
    const rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new PointerEvent('pointermove', {
      clientX: rect.left + rect.width * fraction, clientY: rect.top + rect.height / 2,
    }));
  }, fraction);
  await page.evaluate(() => { window.__mission.scan(); window.__mission.cancel(); });
  await hover(0.5);
  assert.equal(await page.locator('.horizon-hover-point').count(), 1);
  const first = await page.locator('#horizon-hover').textContent();
  assert(first.includes('bearing 45°'));
  await hover(0.75);
  assert((await page.locator('#horizon-hover').textContent()).includes('bearing 75°'));
  await page.evaluate(() => { window.__mission.state.truth.x += 200; });
  await hover(0.5);
  assert.equal(await page.locator('#horizon-hover').textContent(), first);
  await page.locator('#panorama').dispatchEvent('pointerleave');
  assert.equal(await page.locator('.horizon-hover-point').count(), 0);
  await page.evaluate(() => window.__mission.reset('poor'));
  await page.evaluate(() => { window.__mission.scan(); window.__mission.cancel(); });
  await hover(0);
  assert.equal(await page.locator('.horizon-hover-point').count(), 0);
  assert((await page.locator('#horizon-hover').textContent()).includes('No valid observation'));
  await page.evaluate(() => window.__mission.reset('good'));
  assert.equal(await page.locator('.horizon-hover-point').count(), 0);
  assert.deepEqual(errors, []);
  console.log('Snapshot hover: map point, yaw, capture pose, missing rays and cleanup passed');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
