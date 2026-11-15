import assert from 'node:assert/strict';
import fs from 'node:fs';
import { verifyRouteLocation } from './route-location-browser.mjs';

function assertOnRoute(point, path) {
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  assert(path.some((end, index) => {
    if (index === 0) return false;
    const start = path[index - 1];
    return Math.abs(distance(start, point) + distance(point, end) - distance(start, end)) < 0.01;
  }), 'The simulated observation must be sampled along the selected route');
}

export async function verifyWalk(page, url) {
  await page.goto(url);
  await page.locator('#start-walk').click();

  const panel = page.locator('.walk-panel');
  const check = panel.locator('#check-science-route');
  const verdict = panel.locator('#science-route-verdict');
  const focus = panel.locator('#focus-science-evidence');
  const findDetours = panel.locator('#check-science-detour');
  const choices = panel.locator('#walk-alternatives').getByRole('radio');
  const profile = page.getByRole('region', { name: '路線高程剖面' });
  async function showEvidence(section) {
    const details = section.locator('details.route-evidence');
    if (!(await details.evaluate(el => el.open))) await details.locator('summary').click();
    return section.locator('dl.evidence').innerText();
  }
  const targets = () => page.evaluate(() => window.__mission.state.targets.map(t => t.id));
  const vehicle = () => page.evaluate(() => {
    const { truth, estimate, travelled } = window.__mission.state;
    return { truth, estimate, travelled };
  });

  await check.waitFor();
  assert.deepEqual(await targets(), ['s1']);
  assert(await verdict.isHidden());
  assert(await profile.isHidden());
  assert(await page.locator('#localization-tool').isHidden());
  const atBase = await vehicle();
  await check.click();
  await verdict.waitFor();
  assert.equal(await verdict.getAttribute('data-verdict'), 'reroute');
  assert.match(await verdict.innerText(), /建議改道/);
  const direct = await page.evaluate(() => {
    const { assessment } = window.__mission.state.walk;
    return { length: assessment.length, slope: assessment.maxSlope };
  });
  assert(direct.length > 5000 && direct.slope > 15);
  const directSection = panel.locator('section.assessment:has(#science-route-verdict)');
  const directEvidence = await showEvidence(directSection);
  assert(directEvidence.includes(direct.slope.toFixed(1) + '°'));
  assert.match(directEvidence, /穿越人工禁行區\s+否/);
  await profile.locator('.profile-legend').getByText(/直線/).waitFor();
  await focus.click();
  await page.locator('#map .preflight-evidence').first().waitFor();
  await page.locator('#map .leaflet-popup').getByText('基地到 A 的判定位置').waitFor();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#map .leaflet-popup')).opacity === '1');
  assert.deepEqual(await vehicle(), atBase);

  const directObservation = await verifyRouteLocation(page, panel.locator('#science-route-challenge'));
  const directPath = await page.evaluate(() => window.__mission.state.directRoute.path);
  assertOnRoute(directObservation, directPath);
  assert.deepEqual(await vehicle(), atBase);

  await findDetours.click();
  assert.equal(await choices.count(), 2);
  const routes = await page.evaluate(() => window.__mission.state.walk.alternatives.map(({ id, name, result }) => ({
    id, name, length: result.length, slope: result.maxSlope, verdict: result.verdict
  })));
  assert(routes.every(r => r.verdict === 'go' && r.slope <= 15 && r.length > direct.length));
  // The longer route offers a gentler maximum slope. Both reach the same observation station.
  const [shorter, gentler] = [...routes].sort((a, b) => a.length - b.length);
  assert(gentler.length > shorter.length && gentler.slope < shorter.slope);
  const legend = profile.locator('.profile-legend').getByRole('listitem');
  assert.equal(await legend.count(), 3);
  for (const route of routes) assert((await legend.allTextContents()).some(text => text.includes(route.name)));
  for (const route of routes) {
    const radio = panel.locator('#walk-route-' + route.id);
    await radio.check();
    assert(await radio.isChecked());
    assert.equal(await page.evaluate(() => window.__mission.state.walk.selectedAlternative), route.id);
    await page.locator('#map path.science-route-' + route.id + '.selected').waitFor();
    assert(await panel.locator('#science-detour-verdict[data-verdict="go"]').isVisible());
    assert.match(await profile.locator('.profile-legend').innerText(), /直線/);
    assert.deepEqual(await vehicle(), atBase);
  }
  await panel.locator('#focus-science-detour').click();
  await page.locator('#map .leaflet-popup').getByText('替代路線判定位置', {exact:true}).waitFor();
  fs.mkdirSync('test-results', {recursive: true});
  await page.screenshot({path: 'test-results/jezero-preflight-desktop.png'});
  await page.setViewportSize({width: 390, height: 844});
  const detourObservation = await verifyRouteLocation(page, page.locator('#map-route-challenge'), {
    repeat: true, screenshot: 'test-results/route-location-science-mobile.png',
  });
  const activeDetour = await page.evaluate(() => {
    const {alternatives, selectedAlternative} = window.__mission.state.walk;
    return alternatives.find(route => route.id === selectedAlternative);
  });
  assert.equal(activeDetour.id, routes.at(-1).id);
  assertOnRoute(detourObservation, activeDetour.path);
  assert.deepEqual(await vehicle(), atBase);
  const slopeLimit = panel.locator('#science-slope-limit');
  if (await slopeLimit.isHidden()) await panel.locator('.limits summary').click();
  await slopeLimit.fill('1');
  await check.click();
  await panel.locator('#science-route-verdict[data-verdict="hold"]').waitFor();
  assert.match(await verdict.innerText(), /暫緩出發/);
  assert.match(await panel.locator('.reason').first().innerText(), /超限/);
  assert(await panel.locator('#check-science-detour').isHidden());
  assert.deepEqual(await vehicle(), atBase);
  await panel.locator('.limits summary').click();
  await verdict.scrollIntoViewIfNeeded();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({path: 'test-results/jezero-preflight-mobile.png'});
  await page.setViewportSize({width: 1600, height: 1000});

  // Reopen the guided walk to restore the complete route to the map before placing an exclusion.
  await page.locator('#reset').click();
  await page.locator('#start-walk').click();
  await check.waitFor();
  if (await slopeLimit.isHidden()) await panel.locator('.limits summary').click();
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
  assert.match(await showEvidence(directSection), /穿越人工禁行區\s+是/);
  await findDetours.click();
  if (await choices.count()) await choices.first().check();
  await panel.locator('#science-detour-verdict[data-verdict="go"]').waitFor();
  const detourSection = panel.locator('section.assessment:has(#science-detour-verdict)');
  assert.match(await showEvidence(detourSection), /穿越人工禁行區\s+否/);
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
