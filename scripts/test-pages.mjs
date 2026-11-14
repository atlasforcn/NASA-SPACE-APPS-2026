import { spawnSync } from "node:child_process";
const run = (file, args, base, extra = {}) => {
  const p = spawnSync(process.execPath, [file, ...args], {
    stdio: "inherit",
    env: { ...process.env, PAGES_BASE_PATH: base, ...extra },
  });
  if (p.status !== 0) process.exit(p.status || 1);
};
for (const base of ["/", "/nasa2026/"]) {
  console.log("Testing Pages base", base);
  run("scripts/assets.mjs", ["prepare"], base);
  run("node_modules/vite/bin/vite.js", ["build", "--mode", "test"], base);
  run("scripts/assets.mjs", ["verify"], base);
  run("tests/assets.mjs", [], base);
  run("tests/browser.mjs", [], base);
  run("node_modules/vite/bin/vite.js", ["build"], base);
  run("scripts/assets.mjs", ["verify"], base);
  run("tests/browser.mjs", [], base, { PRODUCTION_SMOKE: "1" });
}
