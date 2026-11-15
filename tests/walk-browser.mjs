import assert from 'node:assert/strict';
import fs from 'node:fs';

export async function verifyWalk(page, url) {
  await page.goto(url);
  await page.locator('#start-walk').click();

  const panel = page.locator('.walk-panel');
  const check = panel.locator('#check-science-route');
  const verdict = panel.locator('#science-route-verdict');
  const focus = panel.locator('#focus-science-evidence');
  const targets = () => page.evaluate(() => window.__mission.state.targets.map(t => t.id));
  const vehicle = () => page.evaluate(() => {
    const { truth, estimate, travelled } = window.__mission.state;
    return { truth, estimate, travelled };
  });

  await check.waitFor();
  assert.deepEqual(await targets(), ['s1']);
  assert(await verdict.isHidden());
  assert(await page.locator('#localization-tool').isHidden());
  const atBase = await vehicle();
  await check.click();
  await verdict.waitFor();
  assert.equal(await verdict.getAttribute('data-verdict'), 'go');
  assert.match(await verdict.innerText(), /可前往/);
  const evidence = panel.locator('dl.evidence');
  assert.match(await evidence.innerText(), /沿途最大坡度\s+5\.4°/);
  assert.match(await evidence.innerText(), /沿途最大粗糙度\s+0\.18/);
  await focus.click();
  await page.locator('#map .preflight-evidence').first().waitFor();
  await page.locator('#map .leaflet-popup').getByText('基地到 A 的判定位置').waitFor();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#map .leaflet-popup')).opacity === '1');
  assert.deepEqual(await vehicle(), atBase);

  fs.mkdirSync('test-results', {recursive: true});
  await page.screenshot({path: 'test-results/jezero-preflight-desktop.png'});
  await page.setViewportSize({width: 390, height: 844});
  const slopeLimit = panel.locator('#science-slope-limit');
  if (await slopeLimit.isHidden()) await panel.locator('.limits summary').click();
  await slopeLimit.fill('5');
  await check.click();
  await panel.locator('#science-route-verdict[data-verdict="hold"]').waitFor();
  assert.match(await verdict.innerText(), /暫緩出發/);
  assert.match(await panel.locator('.reason').innerText(), /A/);
  assert(await panel.locator('#check-science-detour').isHidden());
  assert.deepEqual(await vehicle(), atBase);
  await panel.locator('.limits summary').click();
  await verdict.scrollIntoViewIfNeeded();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({path: 'test-results/jezero-preflight-mobile.png'});
  await page.setViewportSize({width: 1600, height: 1000});

  await panel.locator('.limits summary').click();
  await slopeLimit.fill('15');
  await panel.locator('#science-no-go-name').fill('中央禁行區');
  await panel.locator('#science-no-go-radius').fill('60');
  await panel.locator('#science-pick-no-go').click();
  const map = page.locator('#map');
  const mapBox = await map.boundingBox();
  const routeBox = await map.locator('.leaflet-navigationRoute-pane path').first().boundingBox();
  await map.click({position: {
    x: routeBox.x + routeBox.width / 2 - mapBox.x,
    y: routeBox.y + routeBox.height / 2 - mapBox.y,
  }});
  await check.click();
  await panel.locator('#science-route-verdict[data-verdict="reroute"]').waitFor();
  assert.match(await evidence.innerText(), /穿越人工禁行區\s+是/);
  await panel.locator('#check-science-detour').click();
  await panel.locator('#science-detour-verdict[data-verdict="go"]').waitFor();
  assert.match(await panel.locator('dl.evidence').last().innerText(), /穿越人工禁行區\s+否/);
  await panel.locator('#focus-science-detour').click();
  await page.locator('#map .leaflet-popup').getByText('替代路線判定位置').waitFor();
  assert.deepEqual(await vehicle(), atBase);
  await panel.getByRole('button', {name: /移除.*中央禁行區/}).click();

  await page.locator('#reset').click();
  await page.locator('#start-walk').click();
  await check.waitFor();
  assert.deepEqual(await targets(), ['s1']);
  assert(await verdict.isHidden());
  assert.equal(await page.locator('#map .preflight-evidence').count(), 0);
  await page.getByRole('button', {name: '切換模式'}).click();
  await page.locator('#start-free').click();
  await page.locator('#pick-start').waitFor();
  assert(await check.isHidden());
  assert.equal(await page.evaluate(() => window.__mission.state.hasStart), false);
  assert.deepEqual(await targets(), []);
}

export async function verifyScienceOrder(page, url) {
  await page.goto(url);
  await page.locator('#start-free').click();
  const pending = new Map();
  const pattern = /\/science\/(thermal|spectral|chemical)\.bin$/;
  await page.route(pattern, route => pending.set(route.request().url().match(pattern)[1],route));
  await page.getByRole('button',{name:'圖層',exact:true}).click();
  const panel = page.locator('.layer-controls:visible');
  const toggle = id => panel.locator('input[value="'+id+'"]');
  for (const id of ['thermal','spectral','chemical']) await toggle(id).check();
  async function release(id, fail=false) {
    for (let n=0; n<100 && !pending.has(id); n++) await new Promise(r=>setTimeout(r,20));
    assert(pending.has(id));
    const route = pending.get(id);
    pending.delete(id);
    if (fail) await route.abort();
    else await route.continue();
  }
  await release('chemical');
  await page.waitForFunction(()=>window.__mission.state.scienceMeta?.title?.includes('Fe Conc.'));
  await release('spectral',true);
  await release('thermal');
  await page.waitForFunction(()=>window.__mission.state.scienceLayers.thermal.meta);
  assert((await page.locator('#layer-legend').textContent()).includes('Fe Conc.'));
  assert.equal(await page.locator('.science-context a[download]').getAttribute('href').then(v=>v.endsWith('chemical.bin')),true);
  await panel.getByRole('button',{name:'橄欖石豐度 上移'}).click();
  // Reordering can start another request for a previously failed layer.
  await release('spectral',true);
  await page.getByRole('button',{name:'重試載入科學圖層'}).click();
  await toggle('spectral').uncheck();
  await release('spectral');
  await page.waitForFunction(()=>!window.__mission.state.scienceLayers.spectral);
  await toggle('spectral').check();
  await page.waitForFunction(()=>window.__mission.state.scienceLayers.spectral.meta);
  const controls = panel.locator('.layer-customization__item').last();
  await controls.locator('select').selectOption('gray');
  await controls.getByLabel('上限').fill('0.2');
  await page.waitForFunction(()=>window.__mission.state.scienceLayers.spectral.range?.[1]===0.2);
  assert((await page.locator('.science-context').textContent()).includes('0 → 0.2'));
  await toggle('geophysical').check();
  await toggle('atmospheric').check();
  const cards=page.locator('.layer-guidance:visible article');
  assert.equal(await cards.count(),5);
  await cards.filter({hasText:'同格歷史測站'}).waitFor();
  assert((await cards.locator('..').first().innerText()).includes('wt % Fe'));
  await toggle('chemical').uncheck();
  assert.equal(await cards.count(),4);
  await page.unroute(pattern);
}
