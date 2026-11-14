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
  await page.goto(url);
  if (process.env.PRODUCTION_SMOKE === "1") {
    await page.waitForFunction(() => !document.getElementById("scan").disabled);
    assert.equal(
      await page.evaluate(() => typeof window.__mission),
      "undefined",
    );
    await page.locator("#scan").click();
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
    await page.locator("#plan").click();
    assert.equal(await page.locator("#simulate").isEnabled(), true);
    assert.deepEqual(errors, []);
    assert.deepEqual(missing, []);
    assert.deepEqual(external, []);
    console.log("Production browser smoke passed:", base);
  } else {
    await page.waitForFunction(() => window.__mission?.state.ready, {
      timeout: 30000,
    });
    const inspect = (fn) => page.evaluate(fn);
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
    await page.locator("#scenario-good").click();
    await page.locator("#scan").click();
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
    await page.locator("#scan").click();
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
    await page.locator("#scan").click();
    await page.locator("#cancel").click();
    await page.waitForTimeout(200);
    assert.equal(await inspect(() => window.__mission.state.result), null);
    await page.locator("#scan").click();
    await page.locator("#reset").click();
    await page.waitForTimeout(200);
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
    assert(await inspect(() => window.__mission.state.regional));
    assert(await inspect(() => window.__mission.state.route.path.length >= 2));
    assert(await page.locator("#route-profile").isVisible());
    await inspect(() => window.__mission.restore());
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
    await page.locator("#malay-card").click();
    assert(
      await page
        .getByText("NASA PDS 歷史紀錄 · 非人員位置／非樣本管端點")
        .isVisible(),
    );
    await page.getByRole("button", { name: "圖層", exact: true }).click();
    for (const layer of ["geology", "terrain", "slope", "none"])
      await page.locator("#analysis-layer").selectOption(layer);
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
    assert(await page.locator("#analysis-layer option[value=geology]").isDisabled());
    await page.locator("#analysis-layer").selectOption("terrain");
    await page.locator("#analysis-layer").selectOption("slope");
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
    await page.locator("#target-name").fill("我的觀測點");
    await page.locator("#add-target").click();
    await page.locator("#add-target").click();
    assert.equal(await inspect(() => window.__mission.state.pickingTarget), false);
    await page.locator("#add-target").click();
    const regionMap = await page.locator("#map").boundingBox();
    await page.locator("#map").click({ position: { x: regionMap.width / 2 + 35, y: regionMap.height / 2 + 35 } });
    assert.equal(await inspect(() => window.__mission.state.targets[0]?.name), "我的觀測點");
    assert.equal(await inspect(() => window.__mission.state.pickingTarget), false);
    assert.equal(await page.locator("#plan").isEnabled(), true);
    await page.locator("#plan").click();
    assert(await inspect(() => window.__mission.state.route !== null));
    assert(await inspect(() => !window.__mission.state.straightStatus.includes(" 0 m")));
    assert.equal(await page.locator("#expedition-plan").count(), 0);
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
    await page.locator("#scan").click();
    await page.waitForFunction(() => window.__mission.state.result !== null, {
      timeout: 120000,
    });
    assert.notEqual(
      await inspect(() => window.__mission.state.result.status),
      "good",
    );
    await page.getByRole("button", { name: "任務", exact: true }).click();
    await page.locator("#target-name").fill("保留的觀測點");
    await page.locator("#add-target").click();
    await page.locator("#map").click({position:{x:regionMap.width/2+20,y:regionMap.height/2+20}});
    const retainedId = await inspect(() => window.__mission.state.targets[0].id);
    await page.evaluate(() => window.__mission.overview());
    await page.locator("#target-name").fill("遠距觀測點");
    await page.locator("#add-target").click();
    await page.locator("#map").click({position:{x:regionMap.width/2+100,y:regionMap.height/2+60}});
    await page.waitForFunction(() => !window.__mission.state.regionLoading);
    await page.waitForFunction(() => window.__mission.state.targets.length===2 && !window.__mission.state.regionLoading);
    assert.equal(await inspect(() => window.__mission.state.targets[0].id),retainedId);
    assert.equal(await inspect(() => window.__mission.state.targets[1].name),"遠距觀測點");
    assert(await inspect(() => window.__mission.inspect().dem.xMax-window.__mission.inspect().dem.xMin>512000));
    await page.getByRole("button", { name: "圖層", exact: true }).click();
    await page.locator("#analysis-layer").selectOption("terrain");
    assert(await page.locator("#analysis-layer option[value=geology]").isDisabled());
    const layerGrid = await inspect(() => {
      const {dem, analysis} = window.__mission.inspect();
      return {origin:dem.origin,xMin:dem.xMin,step:dem.source.sample_step_m,
        samples:analysis.getLayers().map(layer => layer.getLatLng())};
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
    await page.locator("#restore-jezero").click();
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
    await page.waitForFunction(() => window.__mission?.state.ready);
    assert.equal(await inspect(() => window.__mission.state.tab), "mission");
    await page.locator("#pick-start").click();
    const reloadedMap = await page.locator("#map").boundingBox();
    await page.locator("#map").click({ position: { x: reloadedMap.width / 2, y: reloadedMap.height / 2 } });
    assert.equal(await inspect(() => window.__mission.state.pickingStart), false);
    assert.equal(await inspect(() => window.__mission.state.tab), "mission");
    await page.locator("#map").click({ position: { x: reloadedMap.width / 2 + 20, y: reloadedMap.height / 2 + 20 } });
    assert.equal(await inspect(() => window.__mission.state.tab), "mission");
    await page.locator("#scan").click();
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
