import assert from 'node:assert/strict';
import fs from 'node:fs';

export async function verifyWalk(page, url) {
  await page.goto(url);
  await page.locator('#start-walk').dblclick({force:true});
  const panel = page.locator('.walk-panel');
  await panel.getByText('A、B 位於同一格', {exact:false}).waitFor();
  const state = fn => page.evaluate(fn);
  assert.equal(await state(() => window.__mission.state.targets.length),2);
  await panel.getByRole('button',{name:/科學觀測站 B/}).press('Enter');
  assert(await panel.getByText(/Njf 的平滑地表/).isVisible());
  const before = await state(() => window.__mission.state.route.length);
  await panel.getByRole('button',{name:'查看地質單元'}).click();
  assert.equal(await state(() => window.__mission.state.route.length),before);
  await panel.getByLabel('任務預算（小時）').fill('1');
  await panel.getByText(/基地 → A → B → 基地.*超時/).waitFor();
  fs.mkdirSync('test-results',{recursive:true});
  await page.screenshot({path:'test-results/jezero-walk-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  assert(await state(() => document.documentElement.scrollWidth <= innerWidth));
  await panel.getByRole('button',{name:/示範快轉到科學觀測站 A/}).click();
  await panel.getByLabel('觀察筆記').fill('可見脊紋，記錄方向');
  await panel.getByLabel(/現場紀錄/).selectOption('已觀察');
  assert(await page.locator('#localization-tool').isHidden());
  await panel.getByRole('button',{name:'開啟山頂相儀'}).click();
  await page.locator('#observe-mode').selectOption('poor');
  const prior = await state(()=>({...window.__mission.state.estimate}));
  await page.locator('#scan').click();
  await panel.getByText(/同 DEM 模擬.*保留里程推估/).waitFor({timeout:120000});
  await page.locator('#close-localization').click();
  assert(await page.locator('#localization-tool').isHidden());
  assert.deepEqual(await state(()=>({...window.__mission.state.estimate})),prior);
  assert.equal(await panel.getByLabel('觀察筆記').inputValue(),'可見脊紋，記錄方向');
  await panel.getByRole('button',{name:'略過 B 返程'}).click();
  await panel.getByText(/本路線含返程/).waitFor();
  await page.screenshot({path:'test-results/jezero-walk-mobile.png'});
  await panel.getByRole('button',{name:'示範快轉到返回基地'}).click();
  await panel.getByText('已返抵基地').waitFor();
  assert.equal(await state(() => window.__mission.state.walk.stations[1].outcome),'略過');
  const download = page.waitForEvent('download');
  await panel.getByRole('button',{name:'匯出行程與站點紀錄'}).click();
  const geo = JSON.parse(fs.readFileSync(await (await download).path(),'utf8'));
  assert(geo.features.some(f=>f.geometry.type === 'Point' && f.properties.outcome === '已觀察' && f.properties.scans.length));
  assert.equal(geo.features.filter(f=>f.properties.status === '已行進').length,2);
  await page.locator('#reset').click();
  await page.locator('#start-walk').click();
  assert.equal(await state(() => window.__mission.state.targets.length),2);
  await page.setViewportSize({width:1600,height:1000});
  await page.goto(url);
}

export async function verifyScienceOrder(page, url) {
  await page.goto(url);
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
  await panel.getByRole('button',{name:'橄欖石 上移'}).click();
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
  await page.unroute(pattern);
}
