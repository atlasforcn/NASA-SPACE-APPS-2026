import { chromium } from "@playwright/test";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import assert from "node:assert/strict";
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
  for(const file of ['slides.html','docs/reference-v03.html','docs/core.js','docs/main.js','docs/styles.css','deliverables/Martian-Navigator.pptx',...Array.from({length:5},(_,i)=>'deliverables/slides/'+(i+1)+'.png')])assert.equal(fs.existsSync(path.join(root,file)),false,'Repository-only asset must not be published: '+file);
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
    assert(
      !requests.some((p) => p.endsWith("mola16.bin")),
      "Global DEM must be lazy",
    );
    await page.getByRole("button", { name: "任務", exact: true }).click();
    await page.locator("#plan").click();
    assert(await inspect(() => window.__mission.state.route.reachable));
    await page.locator("#simulate").click();
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
    await inspect(() => {
      const m = window.__mission;
      m.beginDrawing("points");
      m.appendPoint({ x: 999999, y: 999999 });
      m.finishDrawing();
    });
    assert.equal(
      await inspect(() => window.__mission.state.route.reachable),
      false,
    );
    assert(await page.locator("#simulate").isDisabled());
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
      3,
    );
    assert(
      await inspect(() => window.__mission.state.profileInfo.includes("DEM")),
    );
    await page.locator("#malay-card").click();
    assert(
      await page
        .getByText("NASA PDS 歷史紀錄 · 非人員位置／非樣本管端點")
        .isVisible(),
    );
    for (const [button, status] of [
      ["#checkpoint-clear", "good"],
      ["#checkpoint-poor", "poor"],
    ]) {
      await page.locator(button).click();
      await page.locator("#scan").click();
      await page.waitForFunction(() => window.__mission.state.result !== null, {
        timeout: 120000,
      });
      assert(
        await inspect(() =>
          window.__mission.state.checkpointMessage.includes("CP-01"),
        ),
      );
      if (status === "good")
        assert.equal(
          await inspect(() => window.__mission.state.result.status),
          "good",
        );
      else
        assert.notEqual(
          await inspect(() => window.__mission.state.result.status),
          "good",
        );
    }
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
    await page.locator("#analysis-layer").selectOption("geology");
    assert(
      (await page.locator("#layer-legend").textContent()).includes("尚無"),
    );
    await page.locator("#analysis-layer").selectOption("terrain");
    await page.locator("#analysis-layer").selectOption("slope");
    await page.getByRole("button", { name: "探索", exact: true }).click();
    await page.locator("#region-lat").fill("0");
    await page.locator("#region-lng").fill("179.9");
    await page.locator("#region-start").click();
    await page.waitForFunction(() => !window.__mission.state.regionLoading);
    await page.locator("#scan").click();
    await page.waitForFunction(() => window.__mission.state.result !== null, {
      timeout: 120000,
    });
    assert.notEqual(
      await inspect(() => window.__mission.state.result.status),
      "good",
    );
    await page.locator("#restore-jezero").click();
    assert.equal(await inspect(() => window.__mission.state.regional), false);
    // Fetch every published byte, not just the resources requested on initial load.
    const manifest = JSON.parse(fs.readFileSync("static-assets.json", "utf8"));
    for (const entry of manifest.filter((e) => e.disposition === "publish")) {
      const r = await page.request.get(url + entry.path);
      assert(r.ok(), entry.path);
      assert.equal((await r.body()).length, entry.bytes, entry.path);
    }
    await page.goto(url);
    await page.waitForFunction(() => window.__mission?.state.ready);
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
