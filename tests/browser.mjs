import { verifyWalk, verifyScienceOrder } from './walk-browser.mjs';
import { verifyCuriosityLanding } from './curiosity-browser.mjs';
import { verifyEnvironmentAlerts } from './environment-alerts-browser.mjs';
import { verifyRouteLocation } from './route-location-browser.mjs';
import { chromium } from "@playwright/test";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import assert from "node:assert/strict";
import P from "../planet.mjs";
const base = process.env.PAGES_BASE_PATH || "/",
  root = path.resolve(process.env.STATIC_DIST || "dist");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".bin": "application/octet-stream",
  ".md": "text/plain",
};
const server = http.createServer((req, res) => {
  let name;
  try {
    const url = new URL(req.url, "http://local");
    if (!url.pathname.startsWith(base)) {
      res.writeHead(404).end();
      return;
    }
    name = path.resolve(
      root,
      decodeURIComponent(url.pathname.slice(base.length)) || "index.html",
    );
    if (!name.startsWith(root + path.sep)) throw Error();
  } catch {
    res.writeHead(403).end();
    return;
  }
  if (!fs.existsSync(name) || !fs.statSync(name).isFile()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, {
    "Content-Type": types[path.extname(name)] || "application/octet-stream",
  });
  fs.createReadStream(name).pipe(res);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`,
  url = origin + base;
const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_EXECUTABLE
      ? { executablePath: process.env.BROWSER_EXECUTABLE }
      : process.platform === "win32" && fs.existsSync(edge)
        ? { executablePath: edge }
        : {}),
  });
  const page = await browser.newPage({
      viewport: { width: 1600, height: 1000 },
    }),
    errors = [],
    missing = [],
    external = [],
    requests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 400) missing.push(r.url());
  });
  page.on("request", (r) => requests.push(r.url()));
  await page.route("**/*", (route) => {
    if (!route.request().url().startsWith(origin)) {
      external.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  async function scan() {
    if (await page.locator("#localization-tool").isHidden()) await page.locator("#open-localization").click();
    await page.locator("#scan").click();
  }
  async function chooseStart() {
    await page.getByRole('button', { name: '任務', exact: true }).click();
    await page.locator('#pick-start').click();
    const box = await page.locator('#map').boundingBox();
    await page.locator('#map').click({position: {x: box.width / 2, y: box.height / 2}});
    await page.waitForFunction(() => document.getElementById('scan').disabled === false);
  }
  async function openDetails(...ids) {
    for (const id of ids) {
      const disclosure = page.locator('#' + id);
      if (!(await disclosure.evaluate(element => element.open))) {
        await disclosure.locator(':scope > summary').click();
      }
    }
  }
  const bearingMarker = page.locator('#map .horizon-view-bearing');
  const leftTurn = page.getByRole('button', {name: /左轉 30°/});
  const rightTurn = page.getByRole('button', {name: /右轉 30°/});
  async function assertMapBearing(expected) {
    await bearingMarker.waitFor({state:'visible'});
    const attribute = await bearingMarker.getAttribute('data-bearing');
    assert.notEqual(attribute, null);
    const bearing = Number(attribute);
    assert(bearing >= 0 && bearing < 360, `Invalid map bearing ${bearing}`);
    assert(Math.abs((bearing - expected + 540) % 360 - 180) < 0.01, `Map bearing ${bearing}, expected ${expected}`);
  }
  const screenBearing = () => bearingMarker.locator('svg').evaluate(svg => {
    const transform = new DOMMatrixReadOnly(getComputedStyle(svg).transform);
    return Math.atan2(transform.b, transform.a) * 180 / Math.PI;
  });
  const screenTurn = (before, after) => (after - before + 540) % 360 - 180;
  const layerInput = kind => page.locator(`.layer-controls:visible input[type="checkbox"][value="${kind}"]`);
  async function setLayer(kind) {
    const selected=page.locator('.layer-controls:visible input[type="checkbox"][value]:checked');
    while(await selected.count()) await selected.first().uncheck();
    if(kind!=='none') await layerInput(kind).check();
  }
  async function selectedLayer() {
    const selected=page.locator('.layer-controls:visible input[type="checkbox"][value]:checked');
    return await selected.count()?selected.first().getAttribute('value'):'none';
  }
  const layerDisabled=kind=>layerInput(kind).isDisabled();
  if (process.env.PRODUCTION_SMOKE === "1") {
    await page.addInitScript(() => Object.defineProperty(crypto, "randomUUID", { value: undefined }));
  }
  await page.goto(url);
  if (process.env.PRODUCTION_SMOKE === '1') await verifyEnvironmentAlerts(page, url);
  if (process.env.PRODUCTION_SMOKE === '1') await verifyCuriosityLanding(page, url);
  await page.locator('#start-free').click();
  if (process.env.PRODUCTION_SMOKE !== '1') { await verifyScienceOrder(page, url); await verifyWalk(page, url); }
  if (process.env.PRODUCTION_SMOKE === "1") {
    await page.waitForFunction(() => !document.getElementById("pick-start").disabled);
    await page.locator('#mars-overview').click();
    await page.waitForFunction(() => /視野中心高程 -?\d+\.\d m/.test(document.querySelector('.map-height')?.textContent || ''));
    await setLayer('terrain');
    assert.equal(await selectedLayer(), 'terrain');
    await page.waitForFunction(() => [...document.images].some(i => i.src.endsWith('/data/mars-global-dem.jpg') && i.complete && i.naturalWidth > 0));
    await page.screenshot({path: 'test-results/overview-height.png'});
    await setLayer('none');
    await page.waitForFunction(() => [...document.images].some(i => i.src.endsWith('/data/mars-global-optical.jpg') && i.complete && i.naturalWidth === 2048));
    await page.setViewportSize({width: 390, height: 844});
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({path: 'test-results/overview-mobile.png'});
    assert(await page.locator('#map-optical').isHidden());
    const mobileMap = await page.locator('#map').boundingBox();
    await page.locator('#map').click({position: {x: mobileMap.width / 2, y: mobileMap.height / 2}});
    await page.getByRole('button', {name: '調整圖層'}).click();
    assert(await page.locator('#layer-settings-title').evaluate(el => el === document.activeElement));
    await setLayer('terrain');
    assert.equal(await selectedLayer(), 'terrain');
    await page.setViewportSize({width: 1600, height: 1000});
    await page.goto(url);
    await page.locator('#start-free').click();
    await page.waitForFunction(() => !document.getElementById('pick-start').disabled);
    assert(await page.locator("#scan").isDisabled());
    await chooseStart();
    assert.equal(
      await page.evaluate(() => typeof window.__mission),
      "undefined",
    );
    assert(await bearingMarker.isHidden());
    await page.locator('#open-localization').click();
    await assertMapBearing(45);
    await page.setViewportSize({width:390, height:844});
    await rightTurn.click();
    await assertMapBearing(75);
    await page.locator('#map').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const bounds = document.querySelector('#map .horizon-view-bearing path')?.getBoundingClientRect();
      if (!bounds?.width) return false;
      const above = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      return !!above?.closest('#map');
    }, null, {timeout:5000});
    await leftTurn.click();
    await page.setViewportSize({width:1600, height:1000});
    await leftTurn.click();
    await assertMapBearing(15);
    const northeast = await screenBearing();
    await leftTurn.click();
    await assertMapBearing(345);
    assert(screenTurn(northeast, await screenBearing()) < -10);
    await page.locator('#close-localization').click();
    assert(await bearingMarker.isHidden());
    await page.locator('#open-localization').click();
    await assertMapBearing(345);
    await rightTurn.click();
    await assertMapBearing(15);
    assert(Math.abs(screenTurn(northeast, await screenBearing())) < 0.01);
    await scan();
    await page.waitForFunction(
      () =>
        document.getElementById("localization-status").textContent ===
        "定位良好",
      { timeout: 120000 },
    );
    assert.equal(await page.locator("#candidates li").count(), 3);
    await page.getByRole("button", { name: "任務", exact: true }).click();
    await page.locator("#target-name").fill("Jezero 自訂點");
    await page.locator("#add-target").click();
    const smokeMap = await page.locator("#map").boundingBox();
    await page.locator("#map").click({ position: { x: smokeMap.width / 2 + 35, y: smokeMap.height / 2 + 35 } });
    const destination = page.locator("#destination");
    const originalId = await destination.inputValue();
    await page.locator("#target-name").fill("第二個自訂點");
    await page.locator("#add-target").click();
    await page.locator("#map").click({ position: { x: smokeMap.width / 2 + 60, y: smokeMap.height / 2 + 35 } });
    const secondId = await destination.inputValue();
    assert(secondId.startsWith("custom-") && secondId !== originalId);
    await page.locator("#remove-target").click();
    assert.equal(await destination.locator("option").evaluateAll(options => options.some(o => o.text.includes("第二個自訂點"))), false);
    await destination.selectOption(originalId);
    const profile = page.locator('.map-workspace .map-profile');
    const chart = profile.locator('#route-profile');
    const profileToggle = profile.locator('#profile-toggle');
    assert(await profile.isHidden());
    assert(await page.locator('#free-route-challenge').isHidden());
    assert(await page.locator('#slope-limit').isHidden());
    assert.equal(await page.locator('#mission-settings').getAttribute('open'), null);
    await page.locator("#plan").click();
    await chart.waitFor();
    const mapBounds = await page.locator('#map').boundingBox();
    const chartBounds = await chart.boundingBox();
    assert(chartBounds.x + chartBounds.width / 2 > mapBounds.x + mapBounds.width / 2);
    assert(chartBounds.y + chartBounds.height / 2 > mapBounds.y + mapBounds.height / 2);
    assert(chartBounds.x + chartBounds.width <= mapBounds.x + mapBounds.width + 1);
    assert(chartBounds.y + chartBounds.height <= mapBounds.y + mapBounds.height + 1);
    assert.equal(await profileToggle.getAttribute('aria-expanded'), 'true');
    await page.screenshot({path:'test-results/map-profile-desktop.png'});
    const routeDistance = await page.locator('#path-distance').innerText();
    await page.locator('#open-curiosity-demo').click();
    await page.locator('#curiosity-reveal').click();
    await page.locator('#curiosity-nasa-mark').waitFor();
    await page.screenshot({path:'test-results/curiosity-demo-desktop.png'});
    await page.locator('#curiosity-close').click();
    await page.waitForFunction(() => document.activeElement?.id === 'open-curiosity-demo');
    await verifyRouteLocation(page, page.locator('#free-route-challenge'), {
      repeat: true, screenshot: 'test-results/route-location-free-desktop.png',
    });
    assert.equal(await destination.inputValue(), originalId);
    assert.equal(await page.locator('#path-distance').innerText(), routeDistance);
    assert(await chart.isVisible());
    assert(await page.locator('#simulate').isEnabled());
    await profileToggle.click();
    assert(await chart.isHidden());
    await profileToggle.click();
    assert(await chart.isVisible());
    await profileToggle.click();
    await page.setViewportSize({width:390,height:844});
    await page.locator('#plan').click();
    await chart.waitFor();
    assert.equal(await profileToggle.getAttribute('aria-expanded'), 'true');
    await page.waitForFunction(() => {
      const box = document.querySelector('#route-profile').getBoundingClientRect();
      return box.top >= 0 && box.bottom <= innerHeight + 1 && box.width > 150 &&
        box.left >= 0 && box.right <= innerWidth + 1;
    });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({path:'test-results/map-profile-mobile.png'});
    await page.setViewportSize({width:1600,height:1000});
    assert.equal(await page.locator("#simulate").isEnabled(), true);
    await page.waitForFunction(() => document.querySelectorAll('canvas.navigation-risk-tile').length > 0);
    assert.equal(await page.locator('canvas.navigation-risk-tile').first().evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
    assert.equal(await page.locator('canvas.navigation-risk-tile').first().evaluate(el => getComputedStyle(el).borderRadius), '0px');
    assert.equal(await page.locator('#choose-energy').getAttribute('aria-pressed'), 'true');
    assert((await page.locator('.route-comparison').textContent()).includes('估計耗電'));
    await page.locator('#choose-shortest').click();
    await page.locator('#choose-energy').click();
    const plannedDistance = await page.locator('#path-distance').textContent();
    await openDetails('mission-settings', 'settings-terrain');
    await page.locator('#task-navigation-risk').uncheck();
    assert.equal(await page.locator('canvas.navigation-risk-tile').count(), 0);
    assert.equal(await page.locator('#simulate').isEnabled(), true);
    assert.equal(await page.locator('#path-distance').textContent(), plannedDistance);
    await page.locator('#task-navigation-risk').check();
    await page.getByRole('button', {name: '查看坡度', exact: true}).click();
    assert.equal(await selectedLayer(), 'slope');
    await page.screenshot({path:'test-results/navigation-risk.png'});
    await page.locator('#roughness-limit').fill('0.5');
    assert.equal(await page.locator('#simulate').isDisabled(), true);
    await page.locator('#roughness-limit').fill('1');
    await page.locator('#plan').click();
    await openDetails('settings-energy');
    await page.locator('#uphill-penalty').fill('12');
    assert.equal(await page.locator('#simulate').isDisabled(), true);
    await page.locator('#plan').click();
    await openDetails('route-comparison-details');
    await page.locator('.route-comparison').scrollIntoViewIfNeeded();
    await page.screenshot({path:'test-results/navigation-energy.png'});
    // Navigation data is independent of the currently displayed science layer.
    await page.route('**/data/science/thermal.bin', route => route.fulfill({status:503,body:'temporary navigation data failure'}));
    await openDetails('settings-material');
    await page.locator('#nav-thermal').check();
    await page.waitForFunction(() => document.querySelector('#navigation-data-status')?.textContent.includes('載入失敗'));
    assert(await page.locator('#plan').isDisabled());
    assert(await page.locator('#simulate').isDisabled());
    await page.unroute('**/data/science/thermal.bin');
    const failedThermal=missing.findIndex(url=>url.endsWith('/data/science/thermal.bin'));
    assert(failedThermal>=0);missing.splice(failedThermal,1);
    await page.getByRole('button',{name:'重試導航資料',exact:true}).click();
    await page.waitForFunction(() => document.querySelector('#navigation-data-status')?.textContent.includes('熱慣量已接入'));
    await page.locator('#plan').click();
    assert(await page.locator('#simulate').isEnabled());
    const materialDistance=await page.locator('#path-distance').textContent();
    await page.getByRole('button',{name:'圖層',exact:true}).click();
    await setLayer('spectral');
    await page.waitForFunction(() => document.querySelector('.science-context')?.textContent.includes('已疊加下載格網'));
    await page.getByRole('button',{name:'任務',exact:true}).click();
    assert(await page.locator('#nav-thermal').isChecked());
    assert(await page.locator('#simulate').isEnabled());
    assert.equal(await page.locator('#path-distance').textContent(),materialDistance);
    await setLayer('none');
    await openDetails('settings-no-go');
    await page.locator('#no-go-name').fill('人工影像禁行測試');
    await page.locator('#no-go-radius').fill('50');
    await page.locator('#pick-no-go').click();
    const exclusionMap=await page.locator('#map').boundingBox();
    await page.locator('#map').click({position:{x:exclusionMap.width/2,y:exclusionMap.height/2}});
    await page.waitForFunction(() => document.querySelector('.no-go-list')?.textContent.includes('人工影像禁行測試'));
    await page.locator('#no-go-name').fill('第二個禁行區');
    await page.locator('#pick-no-go').click();
    await page.locator('#map').click({position:{x:exclusionMap.width/2+65,y:exclusionMap.height/2}});
    await page.getByRole('button',{name:'移除禁行區 第二個禁行區',exact:true}).click();
    assert.equal(await page.locator('.no-go-list li').count(), 1);
    assert(await page.locator('#simulate').isDisabled());
    await page.locator('#plan').click();
    assert((await page.locator('#route-status').textContent()).includes('無法抵達'));
    assert.match(await page.locator('#straight-status').innerText(), /直線受阻，請調整目的地或停靠點/);
    assert(await page.locator('#free-route-challenge').isHidden());
    assert(await page.locator('#map-route-challenge').isHidden());
    await page.locator('#task-navigation-risk').uncheck();
    await page.locator('#plan').click();
    assert(await page.locator('#simulate').isDisabled());
    await page.locator('.navigation-materials').scrollIntoViewIfNeeded();
    await page.screenshot({path:'test-results/navigation-materials.png'});
    await page.getByRole('button',{name:'移除禁行區 人工影像禁行測試',exact:true}).click();
    await page.locator('#task-navigation-risk').check();
    await page.locator('#plan').click();
    assert(await page.locator('#simulate').isEnabled());


    await page.getByRole('button', { name: '圖層', exact: true }).click();
    const science = page.locator('.science-context');
    await setLayer('atmospheric');
    await page.waitForFunction(() => document.querySelector('.science-context')?.textContent.includes('715.002'));
    assert((await science.textContent()).includes('MEDA'));
    assert.equal(await science.locator('input[type="checkbox"]').count(), 0);
    for (const layer of ['thermal','spectral','geophysical','chemical']) {
      await setLayer(layer);
      await page.waitForFunction(() => document.querySelector('.science-context')?.textContent.includes('已疊加下載格網'));
      await page.waitForFunction(() => {
        const images = [...document.querySelectorAll('img.science-raster')];
        return images.length === 3 && images.every(img => img.complete && img.naturalWidth > 0);
      });
      assert((await science.locator('.science-sample').textContent()).includes('所選位置：'));
    }
    await science.getByRole('button', { name: '查看全球疊圖' }).click();
    await page.screenshot({path:'test-results/science-global-chemical.png'});
    await setLayer('radiation');
    await page.waitForFunction(() => document.querySelector('.science-context')?.textContent.includes('8.925'));
    assert.equal(await page.locator('img.science-raster').count(), 0);
    await science.getByRole('button', { name: '查看測站位置' }).click();
    await page.screenshot({path:'test-results/science-rad-station.png'});
    await setLayer('terrain');
    assert((await science.textContent()).includes('DEM 高程：'));
    assert(!(await science.textContent()).includes('0.67 mSv'));
    assert(!(await science.textContent()).includes('715.002'));
    await page.getByRole('button', {name:'任務',exact:true}).click();
    const previousDestination = await page.locator('#destination').inputValue();
    await page.locator('#slope-limit').fill('20');
    await openDetails('settings-stops');
    await page.locator('#stop-named-search').fill('Olympus Mons');
    await page.locator('#stop-named-place').selectOption('Olympus Mons');
    await page.locator('#stop-add-named').click();
    await page.waitForFunction(() => [...document.querySelectorAll('.planner-controls [role="status"]')].some(el => el.textContent.includes('200 km')));
    assert.equal(await page.locator('#destination').inputValue(), previousDestination);
    assert.equal(await page.locator('#slope-limit').inputValue(), '20');
    assert.equal(await page.locator('.planner-stops li').count(), 0);
    await page.locator('#stop-add-named').click();
    assert.equal(await page.locator('.planner-stops li').count(), 0);
    await page.locator('#stop-named-search').fill('Alba Mons');
    await page.locator('#stop-named-place').selectOption('Alba Mons');
    await page.locator('#stop-add-named').click();
    await page.waitForFunction(() => [...document.querySelectorAll('.planner-controls [role="status"]')].some(el => el.textContent.includes('加入失敗') && el.textContent.includes('200 km')));
    assert.equal(await page.locator('#destination').inputValue(), previousDestination);
    assert.equal(await page.locator('#slope-limit').inputValue(), '20');
    await page.getByRole('button', {name:'探索',exact:true}).click();
    await page.locator('#named-search').fill('Jezero');
    await page.locator('#named-list button').first().click();
    await page.locator('#named-set-destination').click();
    await page.waitForFunction(() => document.querySelector('#destination')?.value === 'custom-named-Jezero');
    assert.equal(await page.locator('.planner-stops li').count(), 0);
    await page.screenshot({path:'test-results/named-stops.png'});

    assert.deepEqual(errors, []);
    assert.deepEqual(missing, []);
    assert.deepEqual(external, []);
    console.log("Production browser smoke passed:", base);
  } else {
    await page.waitForFunction(() => window.__mission?.state.ready, {
      timeout: 30000,
    });
    const inspect = (fn) => page.evaluate(fn);
    assert.equal(await inspect(() => window.__mission.state.hasStart), false);
    assert(await page.locator("#scan").isDisabled());
    assert(await page.locator("#drift").isDisabled());
    assert.equal(await page.locator("#position").textContent(), "尚未設定起點");
    assert.equal(await page.locator('#map path[stroke="#9af0e0"]').count(), 0);
    assert.equal(await page.getByText("E -750 m", {exact: false}).count(), 0);
    assert(await page.locator("#horizon-editor").isHidden());
    assert(await page.locator("#localization-tool").isHidden());
    await page.locator("#open-localization").click();
    assert(await bearingMarker.isHidden());
    await page.locator(".horizon-input summary").click();
    // Drawing and uploads must also work before any mission start is chosen.
    assert(await page.locator("#horizon-match").isEnabled());
    assert.equal(await page.locator("#horizon-search-scope").textContent(), "未設起點，將搜尋目前載入的地形區域。");
    const initialEditor = page.locator("#horizon-editor");
    await initialEditor.scrollIntoViewIfNeeded();
    const initialBox = await initialEditor.boundingBox();
    await page.mouse.move(initialBox.x + 5, initialBox.y + initialBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(initialBox.x + initialBox.width - 5, initialBox.y + initialBox.height / 2, { steps: 30 });
    await page.mouse.up();
    await page.locator("#horizon-match").click();
    await page.waitForFunction(() => window.__mission.state.externalHorizon);
    assert((await page.locator("#horizon-input-status").textContent()).includes("已送出輪廓"));
    await page.locator("#cancel").click();
    const widePhoto = await page.evaluate(() => {
      const cv = document.createElement("canvas"); cv.width = 3430; cv.height = 450;
      const ctx = cv.getContext("2d"); ctx.fillStyle = "#dddddd"; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.fillStyle = "#887766"; ctx.fillRect(0, 120, cv.width, 330);
      return cv.toDataURL().split(",")[1];
    });
    await page.locator("#horizon-photo").setInputFiles(process.env.USER_HORIZON_IMAGE ||
      { name: "wide-ridge.png", mimeType: "image/png", buffer: Buffer.from(widePhoto, "base64") });
    await page.waitForFunction(() => document.getElementById("horizon-input-status").textContent.includes("橘線是擷取的山稜"));
    assert(await initialEditor.evaluate(cv => cv.height < 105));
    fs.mkdirSync("test-results", { recursive: true });
    await page.locator(".horizon-input").screenshot({ path: "test-results/wide-horizon-input.png" });
    await page.locator("#horizon-projection").selectOption("equirectangular");
    await page.locator("#horizon-fov").fill("180");
    await page.locator("#horizon-match").click();
    await page.waitForFunction(() => window.__mission.state.externalHorizon && !window.__mission.state.searching, null, { timeout: 120000 });
    assert.equal(await inspect(() => window.__mission.state.status), "外部輪廓候選");
    assert.equal(await inspect(() => window.__mission.state.hasStart), false);
    const candidateHeadings = await inspect(() => window.__mission.state.result.candidates.map(c => c.heading));
    if (candidateHeadings.length) {
      await assertMapBearing(candidateHeadings[0]);
      const index = candidateHeadings.length - 1;
      await page.locator('#candidates button').nth(index).click();
      await rightTurn.click();
      await assertMapBearing(candidateHeadings[index] + 30);
    } else {
      assert(await bearingMarker.isHidden());
    }
    assert.equal(await page.locator('#map path[stroke="#9af0e0"]').count(), 0);
    assert(await page.locator("#curve").evaluate(cv => cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data.some((v, i) => i % 4 === 3 && v)));
    await page.locator("#horizon-projection").selectOption("perspective");
    await page.locator("#horizon-fov").fill("60");
    await page.locator("#horizon-blank").click();
    await inspect(() => window.__mission.reset());
    // A second detailed site must switch the numeric frame AND every local overlay.
    assert(!requests.some(p=>p.includes('/data/gale/')), 'Gale is loaded on demand');
    await page.getByRole('button',{name:'探索',exact:true}).click();
    assert.deepEqual(await page.locator('#dem-region-preset option').evaluateAll(options => options.map(o => o.value)), ['jezero', 'gale', 'valles-ctx']);
    await page.locator('#dem-region-preset').selectOption('valles-ctx');
    await page.locator('#load-region').click();
    await page.waitForFunction(()=>window.__mission.state.siteId==='valles-ctx'&&!window.__mission.state.regionLoading);
    assert.equal(await page.locator('.panel-heading h1').textContent(), '水手號谷');
    assert((await page.locator('.region-description').textContent()).includes('谷壁'));
    assert.equal(await inspect(()=>window.__mission.state.siteName),'Valles');
    assert.equal(await inspect(()=>window.__mission.state.showNavigationRisk),false);
    await page.waitForFunction(()=>Array.from(document.images).some(i=>i.src.endsWith('/data/valles/optical.png')&&i.complete&&i.naturalWidth===501));
    await page.locator('#dem-region-preset').selectOption('gale');
    await page.locator('#load-region').click();
    await page.waitForFunction(()=>window.__mission.state.siteId==='gale'&&!window.__mission.state.regionLoading);
    assert.equal(await page.locator('.panel-heading h1').textContent(), '蓋爾撞擊坑');
    assert((await page.locator('.region-description').textContent()).includes('好奇號'));
    assert.equal(await inspect(()=>window.__mission.inspect().dem.schema),'mars-local-grid-v1');
    assert.equal(await inspect(()=>window.__mission.inspect().dem.source.sample_step_m),20);
    assert.equal(await inspect(()=>window.__mission.state.regional),false);
    assert.equal(await inspect(()=>window.__mission.state.pois.some(p=>p.id==='butler')),false);
    assert.equal(await inspect(()=>window.__mission.state.geologyAvailable),false);
    await page.getByRole('button',{name:'任務',exact:true}).click();
    await openDetails('mission-tools');
    assert.equal(await page.locator('#expedition-plan').isVisible(),true);
    assert.equal(await page.locator('#expedition-plan').isDisabled(),true);
    assert.equal(await page.locator('.map-legend').isVisible(),true);
    await page.waitForFunction(()=>Array.from(document.images).some(i=>i.src.endsWith('/data/gale/optical.png')&&i.complete&&i.naturalWidth===1500));
    await page.getByRole('button',{name:'圖層',exact:true}).click();
    for(const kind of ['terrain','slope','hillshade','roughness']) {
      await setLayer(kind);
      await page.waitForFunction(()=>window.__mission.inspect().analysis?.getLayers().some(layer=>layer.getElement?.()?.src?.startsWith('data:image/png')));
    }
    assert.equal(await layerDisabled('geology'),true);
    fs.mkdirSync('test-results',{recursive:true});
    await page.screenshot({path:'test-results/gale-layers.png'});
    await page.getByRole('button',{name:'探索',exact:true}).click();
    await page.locator('#dem-region-preset').selectOption('jezero');
    await page.locator('#load-region').click();
    await page.waitForFunction(()=>window.__mission.state.siteId==='jezero');
    assert.equal(await page.locator('.panel-heading h1').textContent(), '傑澤羅撞擊坑');
    assert((await page.locator('.region-description').textContent()).includes('三角洲'));
    assert.equal(await inspect(()=>window.__mission.inspect().dem.schema),'mars-local-grid-v1');
    assert.equal(await inspect(()=>window.__mission.state.geologyAvailable),true);
    assert(await inspect(()=>window.__mission.state.pois.some(p=>p.id==='butler')));
    await page.waitForFunction(()=>Array.from(document.images).some(i=>i.src.endsWith('/data/jezero-extended/optical.png')&&i.complete&&i.naturalWidth>0));
    assert.equal(await inspect(() => window.__mission.state.targets.length), 0);
    await page.getByRole("button", { name: "任務", exact: true }).click();
    assert.equal(await page.locator("#plan").isEnabled(), false);
    await page.locator("#target-name").fill("Jezero 自訂點");
    await page.locator("#add-target").click();
    const jezeroMap = await page.locator("#map").boundingBox();
    await page.locator("#map").click({ position: { x: jezeroMap.width / 2 + 35, y: jezeroMap.height / 2 + 35 } });
    assert.equal(await inspect(() => window.__mission.state.targets[0]?.name), "Jezero 自訂點");
    await page.locator("#remove-target").click();
    assert.equal(await inspect(() => window.__mission.state.targets.length), 0);
    await chooseStart();
    assert.equal(await inspect(() => window.__mission.state.hasStart), true);
    assert.equal(await page.locator('#map path[stroke="#9af0e0"]').count(), 1);
    // User observations must search without reading or correcting simulator truth.
    const editor = page.locator("#horizon-editor");
    await editor.scrollIntoViewIfNeeded();
    const editorBox = await editor.boundingBox();
    await page.mouse.move(editorBox.x + 5, editorBox.y + editorBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(editorBox.x + editorBox.width - 5, editorBox.y + editorBox.height / 2, { steps: 30 });
    await page.mouse.up();
    assert(await page.locator("#horizon-input-status").textContent().then(v => v.includes("橘線")));
    const photo = await page.evaluate(() => {
      const cv = document.createElement("canvas"); cv.width = 700; cv.height = 260;
      const ctx = cv.getContext("2d"); ctx.fillStyle = "#d9bbaa"; ctx.fillRect(0, 0, 700, 260);
      ctx.fillStyle = "#443322"; ctx.beginPath(); ctx.moveTo(0, 260);
      for (let x = 0; x <= 700; x++) ctx.lineTo(x, 130 + Math.sin(x / 45) * 12);
      ctx.lineTo(700, 260); ctx.fill(); return cv.toDataURL().split(",")[1];
    });
    await page.locator("#horizon-photo").setInputFiles({ name: "ridge.png", mimeType: "image/png", buffer: Buffer.from(photo, "base64") });
    await page.waitForFunction(() => document.getElementById("horizon-input-status").textContent.includes("橘線是擷取的山稜"));
    await page.locator(".horizon-input").screenshot({ path: "test-results/horizon-input.png" });
    const beforeExternal = await inspect(() => ({ ...window.__mission.state.estimate }));
    await page.locator("#horizon-match").click();
    await page.waitForFunction(() => window.__mission.state.externalHorizon && !window.__mission.state.searching, null, { timeout: 120000 });
    assert.equal(await inspect(() => window.__mission.state.status), "外部輪廓候選");
    assert.deepEqual(await inspect(() => ({ ...window.__mission.state.estimate })), beforeExternal);
    assert.equal(await inspect(() => window.__mission.inspect().observation.kind), "user-horizon");
    await page.locator("#horizon-blank").click();
    await page.locator("#horizon-match").click();
    assert((await page.locator("#horizon-input-status").textContent()).includes("輪廓太短"));
    await page.locator("#reset").click();
    // Keep the navigation scenarios on a fixed destination for reproducibility.
    await inspect(() => {
      window.__mission.state.targets = [{ id: "test-goal", name: "導航測試點", x: -2200, y: -800, unit: "測試地形" }];
      window.__mission.state.destination = "test-goal";
    });
    assert(
      !requests.some((p) => p.endsWith("mola16.bin")),
      "Global DEM must be lazy",
    );
    await page.getByRole("button", { name: "任務", exact: true }).click();
    await page.locator("#plan").click();
    assert(await inspect(() => window.__mission.state.route.reachable));
    assert(await inspect(() => !window.__mission.state.straightStatus.includes(" 0 m")));
    await page.locator("#simulate").click();
    assert(await inspect(() => window.__mission.state.running && window.__mission.state.searching));
    await page.waitForFunction(() => window.__mission.state.travelled > 30);
    await page.locator("#simulate").click();
    await openDetails('mission-tools');
    await page.locator("#scenario-good").click();
    await scan();
    await page.waitForFunction(() => window.__mission.state.result !== null, {
      timeout: 120000,
    });
    const good = await inspect(() => ({
      status: window.__mission.state.result.status,
      candidates: window.__mission.state.result.candidates.length,
      error: Math.hypot(
        window.__mission.state.truth.x - window.__mission.state.estimate.x,
        window.__mission.state.truth.y - window.__mission.state.estimate.y,
      ),
    }));
    assert.equal(good.status, "good");
    assert.equal(good.candidates, 3);
    assert(good.error <= 100);
    const chartImages = () => page.evaluate(() =>
      ['panorama', 'curve'].map(id => document.getElementById(id).toDataURL()));
    const capturedCharts = await chartImages();
    const capturedHeading = await inspect(() => window.__mission.state.truth.heading);
    const estimateHeading = await inspect(() => window.__mission.state.estimate.heading);
    const candidates = await page.locator('#candidates').innerText();
    await assertMapBearing(capturedHeading);
    const capturedScreenBearing = await screenBearing();
    const capturedPosition = await bearingMarker.evaluate(marker => marker.style.transform);
    await rightTurn.click();
    await assertMapBearing(capturedHeading + 30);
    assert(screenTurn(capturedScreenBearing, await screenBearing()) > 10);
    const rotatedCharts = await chartImages();
    assert.notEqual(rotatedCharts[0], capturedCharts[0]);
    assert.notEqual(rotatedCharts[1], capturedCharts[1]);
    await leftTurn.click();
    await assertMapBearing(capturedHeading);
    assert(Math.abs(screenTurn(capturedScreenBearing, await screenBearing())) < 0.01);
    assert.deepEqual(await chartImages(), capturedCharts);
    assert.equal(await inspect(() => window.__mission.state.truth.heading), capturedHeading);
    assert.equal(await inspect(() => window.__mission.state.estimate.heading), estimateHeading);
    assert.equal(await page.locator('#candidates').innerText(), candidates);
    // The map and both charts describe the captured view even after the rover moves.
    await inspect(() => {
      window.__mission.state.truth.x += 100;
      window.__mission.state.truth.heading += 27;
    });
    await rightTurn.click();
    await assertMapBearing(capturedHeading + 30);
    assert.equal(await bearingMarker.evaluate(marker => marker.style.transform), capturedPosition);
    await leftTurn.click();
    assert.deepEqual(await chartImages(), capturedCharts);
    await inspect(() => {
      window.__mission.state.truth.x -= 100;
      window.__mission.state.truth.heading -= 27;
    });
    const targetBearing = await inspect(() => {
      const { truth, destination, targets } = window.__mission.state;
      const target = targets.find(t => t.id === destination);
      return (Math.atan2(target.x - truth.x, target.y - truth.y) * 180 / Math.PI + 360) % 360;
    });
    await page.getByRole('button', {name:'對準標記點'}).click();
    await assertMapBearing(targetBearing);
    await page.locator("#plan").click();
    await page.locator("#simulate").click();
    await page.waitForFunction(() => window.__mission.state.localizationCount >= 2, {
      timeout: 120000,
    });
    assert(await inspect(() => window.__mission.state.route?.reachable));
    await page.waitForFunction(() => !window.__mission.state.running, {
      timeout: 30000,
    });
    assert(
      await inspect(
        () =>
          window.__mission.inspect().waypoint ===
          window.__mission.state.route.path.length - 1,
      ),
    );
    await page.locator("#scenario-poor").click();
    const before = await inspect(() => ({
      ...window.__mission.state.estimate,
    }));
    await scan();
    await page.waitForFunction(() => window.__mission.state.result !== null, {
      timeout: 120000,
    });
    assert.notEqual(
      await inspect(() => window.__mission.state.result.status),
      "good",
    );
    assert.deepEqual(
      await inspect(() => ({ ...window.__mission.state.estimate })),
      before,
    );
    await scan();
    await page.locator("#cancel").click();
    await page.waitForTimeout(200);
    assert.equal(await inspect(() => window.__mission.state.result), null);
    await scan();
    await page.locator("#reset").click();
    await page.waitForTimeout(200);
    await assertMapBearing(45);
    assert.equal(await inspect(() => window.__mission.state.result), null);
    await page.locator("#draw-points").click();
    await page.locator("#map").click({ position: { x: 800, y: 350 } });
    assert(await inspect(() => window.__mission.state.points.length >= 2));
    await page.locator("#route-undo").click();
    assert.equal(await inspect(() => window.__mission.state.points.length), 1);
    await inspect(() => {
      const m = window.__mission,
        p = m.state.estimate;
      m.appendPoint({ x: p.x + 30, y: p.y });
      m.finishDrawing();
    });
    assert(await inspect(() => window.__mission.state.route.custom));
    assert(await page.locator('.map-profile #route-profile').isVisible());
    await page.waitForFunction(() => {
      const canvas = document.getElementById("route-profile");
      return window.__mission.state.profileInfo.includes("目前路線") &&
        canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height)
          .data.some((value, i) => i % 4 === 3 && value > 0);
    });
    await inspect(async () => {
      const m = window.__mission;
      m.beginDrawing("points");
      m.appendPoint({ x: 999999, y: 999999 });
      await m.finishDrawing();
    });
    assert.equal(await inspect(() => window.__mission.state.regional),false);
    assert.equal(await inspect(() => window.__mission.state.route),null);
    assert(await inspect(() => window.__mission.state.regionStatus.includes('200 km')));
    await inspect(() => window.__mission.restore());
    assert(await page.locator("#scan").isDisabled());
    await chooseStart();
    await page.locator("#route-clear").click();
    await page.locator("#draw-freehand").click();
    const box = await page.locator("#map").boundingBox();
    await page.mouse.move(box.x + 400, box.y + 260);
    await page.mouse.down();
    await page.mouse.move(box.x + 470, box.y + 260, { steps: 10 });
    await page.mouse.up();
    assert(await inspect(() => window.__mission.state.points.length > 1));
    await page.locator("#route-clear").click();
    await page.locator("#expedition-plan").click();
    await page.locator('.map-profile #route-profile').waitFor();
    assert.equal(
      await inspect(() => window.__mission.state.expedition.length),
      2,
    );
    assert(
      await inspect(() => window.__mission.state.profileInfo.includes("DEM")),
    );
    assert(await page.locator("#route-profile").evaluate((canvas) =>
      canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height)
        .data.some((value, i) => i % 4 === 3 && value > 0),
    ));
    assert(await inspect(() => {
      const m = window.__mission;
      return Math.hypot(m.state.expedition[0].path[0].x - m.state.truth.x,
        m.state.expedition[0].path[0].y - m.state.truth.y) < 100;
    }));
    await page.getByRole("checkbox", { name: "比較不同路線" }).check();
    await page.waitForFunction(() => window.__mission.state.profileLegend.length === 2);
    await page.locator("#route-profile").hover({ position: { x: 100, y: 60 } });
    await page.waitForFunction(() => window.__mission.state.profileHover.includes("高程"));
    await page.locator("#draw-locate").click();
    await inspect(() => window.__mission.reset());
    await page.waitForFunction(() => window.__mission.state.expedition.length === 0 &&
      !window.__mission.state.profileHover && window.__mission.state.profileLegend.length === 0);
    assert(await page.locator('.map-profile').isHidden());
    await page.locator("#malay-card").click();
    assert(
      await page
        .getByText("NASA PDS 記錄的是投放樣本時的車體位置。")
        .isVisible(),
    );
    await page.getByRole("button", { name: "圖層", exact: true }).click();
    for (const layer of ["geology", "terrain", "slope", "none"])
      await setLayer(layer);
    await page.locator("#optical").uncheck();
    await page.locator("#optical").check();
    await page.getByRole("button", { name: "探索", exact: true }).click();
    await page.locator("#named-search").fill("Olympus");
    await page.locator("#named-list button").first().click();
    await page.locator("#named-type").selectOption("MO");
    assert(await page.locator("#named-count").textContent());
    // Fail first global binary request, then prove retry loads successfully.
    // Cross-region drawing above already loaded MOLA; use a fresh app instance.
    await page.reload();
    await page.locator('#start-free').click();
    await page.waitForFunction(() => window.__mission?.state.ready);
    await page.getByRole("button", { name: "探索", exact: true }).click();
    await page.route("**/data/mola16.bin", (route) =>
      route.fulfill({ status: 503, body: "temporary failure" }),
    );
    await page.locator("#region-start").click();
    await page.waitForFunction(() => !window.__mission.state.regionLoading);
    assert(
      await inspect(() => window.__mission.state.regionStatus.includes("失敗")),
    );
    await page.unroute("**/data/mola16.bin");
    for (const [lat, lng] of [
      [18.65, -133.8],
      [0, 179.9],
      [90, 0],
      [-90, 170],
    ]) {
      await page.locator("#region-lat").fill(String(lat));
      await page.locator("#region-lng").fill(String(lng));
      await page.locator("#region-start").click();
      await page.waitForFunction(
        () =>
          window.__mission.state.regional &&
          !window.__mission.state.regionLoading,
      );
      assert.equal(
        await inspect(() => window.__mission.inspect().dem.schema),
        "mars-region-grid-v1",
      );
    }
    await page.getByRole("button", { name: "圖層", exact: true }).click();
    assert(await layerDisabled('geology'));
    await setLayer("terrain");
    await setLayer("slope");
    await page.getByRole("button", { name: "探索", exact: true }).click();
    await page.locator("#region-lat").fill("0");
    await page.locator("#region-lng").fill("179.9");
    await page.locator("#region-start").click();
    await page.waitForFunction(() => !window.__mission.state.regionLoading);
    assert.equal(await inspect(() => window.__mission.state.targets.length), 0);
    assert(await inspect(() => window.__mission.state.pois.length > 0));
    await page.getByRole("button", { name: "任務", exact: true }).click();
    await page.locator("#pick-start").click();
    const startMap = await page.locator("#map").boundingBox();
    await page.locator("#map").click({ position: { x: startMap.width / 2 + 20, y: startMap.height / 2 + 20 } });
    assert.equal(await inspect(() => window.__mission.state.pickingStart), false);
    assert(await inspect(() => window.__mission.state.routeStatus.includes("起點已設定")));
    assert.equal(await page.locator("#plan").isEnabled(), false);
    await page.locator("#target-name").fill("我的目的地");
    await page.locator("#add-target").click();
    await page.locator("#add-target").click();
    assert.equal(await inspect(() => window.__mission.state.pickingTarget), false);
    await page.locator("#add-target").click();
    const regionMap = await page.locator("#map").boundingBox();
    await page.locator("#map").click({ position: { x: regionMap.width / 2 + 35, y: regionMap.height / 2 + 35 } });
    assert.equal(await inspect(() => window.__mission.state.targets[0]?.name), "我的目的地");
    assert.equal(await inspect(() => window.__mission.state.pickingTarget), false);
    assert.equal(await page.locator("#plan").isEnabled(), true);
    await page.locator("#plan").click();
    assert(await inspect(() => window.__mission.state.route !== null));
    assert(await inspect(() => !window.__mission.state.straightStatus.includes(" 0 m")));
    await openDetails('mission-tools');
    assert.equal(await page.locator("#expedition-plan").isVisible(), true);
    assert.equal(await page.locator("#expedition-plan").isDisabled(), true);
    await inspect(() => { window.__mission.planExpedition(); window.__mission.showStation(); });
    assert(await inspect(() => window.__mission.state.regional && window.__mission.state.targets.length === 1));
    await page.waitForFunction(() => window.__mission.state.profileInfo.includes("MOLA DEM"));
    // Long regional traverses must not overflow Math.min/max argument limits.
    await inspect(() => {
      window.__mission.state.route = {
        path: Array.from({ length: 12 }, (_, i) => ({ x: i % 2 ? 120000 : -120000, y: 0 })),
        reachable: true,
      };
    });
    await page.waitForFunction(() => window.__mission.state.profileInfo.includes("2640.00 km"));
    assert(await page.locator("#route-profile").evaluate((canvas) =>
      canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height)
        .data.some((value, i) => i % 4 === 3 && value > 0),
    ));
    await page.locator("#remove-target").click();
    assert.equal(await inspect(() => window.__mission.state.targets.length), 0);
    assert.equal(await inspect(() => window.__mission.state.route), null);
    assert.equal(await page.locator("#plan").isEnabled(), false);
    await page.getByRole("button", { name: "探索", exact: true }).click();
    await scan();
    await page.waitForFunction(() => window.__mission.state.result !== null, {
      timeout: 120000,
    });
    assert.notEqual(
      await inspect(() => window.__mission.state.result.status),
      "good",
    );
    await page.getByRole("button", { name: "任務", exact: true }).click();
    await page.locator("#target-name").fill("保留的目的地");
    await page.locator("#add-target").click();
    await page.locator("#map").click({position:{x:regionMap.width/2+20,y:regionMap.height/2+20}});
    const retainedId = await inspect(() => window.__mission.state.targets[0].id);
    await page.evaluate(() => window.__mission.overview());
    await page.locator("#target-name").fill("遠距目的地");
    await page.locator("#add-target").click();
    await page.locator("#map").click({position:{x:regionMap.width/2+100,y:regionMap.height/2+60}});
    await page.waitForFunction(() => !window.__mission.state.regionLoading);
    await page.waitForFunction(() => window.__mission.state.targets.length===2 && !window.__mission.state.regionLoading);
    assert.equal(await inspect(() => window.__mission.state.targets[0].id),retainedId);
    assert.equal(await inspect(() => window.__mission.state.targets[1].name),"遠距目的地");
    assert(await inspect(() => window.__mission.inspect().dem.xMax-window.__mission.inspect().dem.xMin>512000));
    await page.getByRole("button", { name: "圖層", exact: true }).click();
    await setLayer("terrain");
    assert(await layerDisabled('geology'));
    const layerGrid = await inspect(() => {
      const {dem, analysis} = window.__mission.inspect();
      return {origin:dem.origin,xMin:dem.xMin,step:dem.source.sample_step_m,
        samples:analysis.getLayers().flatMap(layer => layer.getLayers?.() || [layer]).filter(layer => layer.getLatLng).map(layer => layer.getLatLng())};
    });
    const firstSample = P.geoToLocal(layerGrid.origin, layerGrid.samples[0]);
    const lastSample = P.geoToLocal(layerGrid.origin, layerGrid.samples.at(-1));
    assert(Math.abs(firstSample.x - (layerGrid.xMin + 2 * layerGrid.step)) < 1);
    assert(Math.abs(lastSample.x - (layerGrid.xMin + 126 * layerGrid.step)) < 1);
    await page.getByRole("button", { name: "任務", exact: true }).click();
    await page.locator("#plan").click();
    assert(await inspect(() => window.__mission.state.route.path.length > 1));
    assert(await page.locator("#route-profile").isVisible());
    await inspect(() => window.__mission.overview());
    await page.locator("#pick-start").click();
    await page.locator("#map").click({position:{x:regionMap.width/2-100,y:regionMap.height/2+40}});
    await page.waitForFunction(() => !window.__mission.state.regionLoading && !window.__mission.state.pickingStart)
      .catch(async error => { console.error(await inspect(() => ({status:window.__mission.state.routeStatus,region:window.__mission.state.regionStatus}))); throw error; });
    assert.equal(await inspect(() => window.__mission.state.targets.length), 2);
    assert.equal(await inspect(() => window.__mission.state.targets[0].id), retainedId);
    await page.getByRole("button", { name: "探索", exact: true }).click();
    await page.locator('#dem-region-preset').selectOption('jezero');
    await page.locator('#load-region').click();
    assert.equal(await inspect(() => window.__mission.state.regional), false);
    assert.equal(await inspect(() => window.__mission.state.targets.length), 0);
    // Fetch every published byte, not just the resources requested on initial load.
    const manifest = JSON.parse(fs.readFileSync("static-assets.json", "utf8"));
    for (const entry of manifest.filter((e) => e.disposition === "publish")) {
      const r = await page.request.get(url + entry.path);
      assert(r.ok(), entry.path);
      const bytes = await r.body();
      const canonical = /\.(?:json|geojson|lbl|csv|xml|md|txt|svg)$/i.test(entry.path)
        ? Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n"), "utf8") : bytes;
      assert.equal(canonical.length, entry.bytes, entry.path);
    }
    await page.goto(url);
    await page.locator('#start-free').click();
    await page.waitForFunction(() => window.__mission?.state.ready);
    // Both controls share state; overview has optical imagery and numeric heights
    // before creating a regional mission.
    await page.locator('#mars-overview').click();
    await page.waitForFunction(() => window.__mission.state.globalView);
    await page.waitForFunction(() => [...document.images].some(i => i.src.endsWith('/data/mars-global-optical.jpg') && i.complete && i.naturalWidth === 2048));
    await page.getByRole('button', {name: '任務', exact: true}).click();
    await setLayer('terrain');
    assert.equal(await selectedLayer(), 'terrain');
    await page.waitForFunction(() => [...document.images].some(i => i.src.endsWith('/data/mars-global-dem.jpg') && i.complete && i.naturalWidth > 0));
    const overviewMap = await page.locator('#map').boundingBox();
    await page.waitForTimeout(500);
    await page.mouse.move(overviewMap.x + overviewMap.width / 2, overviewMap.y + overviewMap.height / 2);
    await page.waitForFunction(() => window.__mission.state.elevation.includes('MOLA 16 ppd'));
    await page.getByRole('button', {name: '圖層', exact: true}).click();
    assert.equal(await page.locator('.map-layer-status').count(), 0);
    await setLayer('none');
    await page.getByRole('button', {name: '任務', exact: true}).click();
    assert.equal(await selectedLayer(), 'none');
    await page.locator('#map-optical').uncheck();
    assert.equal(await page.locator('#optical').isChecked(), false);
    await page.getByRole('button', {name: '圖層', exact: true}).click();
    await page.locator('#optical').check();
    await page.getByRole('button', {name: '任務', exact: true}).click();
    assert.equal(await page.locator('#map-optical').isChecked(), true);
    await page.screenshot({path: 'test-results/overview-optical.png'});
    await inspect(() => window.__mission.restore());
    await page.getByRole('button', {name: '任務', exact: true}).click();


    assert.equal(await inspect(() => window.__mission.state.tab), "mission");
    await page.locator("#pick-start").click();
    const reloadedMap = await page.locator("#map").boundingBox();
    await page.locator("#map").click({ position: { x: reloadedMap.width / 2, y: reloadedMap.height / 2 } });
    assert.equal(await inspect(() => window.__mission.state.pickingStart), false);
    assert.equal(await inspect(() => window.__mission.state.tab), "mission");
    await page.locator("#map").click({ position: { x: reloadedMap.width / 2 + 20, y: reloadedMap.height / 2 + 20 } });
    assert.equal(await inspect(() => window.__mission.state.tab), "mission");
    await scan();
    await page.waitForFunction(() => window.__mission.state.result !== null, {
      timeout: 120000,
    });
    fs.mkdirSync("test-results", { recursive: true });
    await page.screenshot({
      path: `test-results/${base === "/" ? "root" : "project"}-desktop.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert(
      await inspect(() => document.documentElement.scrollWidth <= innerWidth),
    );
    await page.locator(".panel-toggle").click();
    assert.equal(
      await page.locator(".panel-toggle").getAttribute("aria-expanded"),
      "false",
    );
    await page.locator(".panel-toggle").focus();
    await page.keyboard.press("Enter");
    assert.equal(
      await page.locator(".panel-toggle").getAttribute("aria-expanded"),
      "true",
    );
    await page.screenshot({
      path: `test-results/${base === "/" ? "root" : "project"}-mobile.png`,
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    assert.deepEqual(
      missing.filter((p) => !p.endsWith("mola16.bin")),
      [],
    );
    console.log("Browser verification passed:", base, JSON.stringify(good));
  }
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
