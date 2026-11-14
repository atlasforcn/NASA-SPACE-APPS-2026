import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const inventoryPath = "static-assets.json";
export const walk = (dir) =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir, { withFileTypes: true })
        .flatMap((e) =>
          e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
        )
    : [];
const assetBytes = (p) => {
  const bytes = fs.readFileSync(p);
  // JSON metadata is text and Git may check it out with CRLF on Windows.
  // Hash its canonical LF form so the inventory stays portable across OSes.
  return p.endsWith(".json")
    ? Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n"), "utf8")
    : bytes;
};
const hash = (p) =>
  crypto.createHash("sha256").update(assetBytes(p)).digest("hex");
const fail = (s) => {
  throw Error(s);
};
const records = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
const inventoryFiles = () => [
  ...["data", "docs"]
    .flatMap(walk)
    .filter((p) => !p.includes("/__pycache__/")),
  ...fs.readdirSync(".", { withFileTypes: true })
    .filter(e => e.isFile() && /\.(png|jpe?g|webp|svg|pdf|pptx|zip|webm|mp4)$/i.test(e.name))
    .map(e => e.name),
];
export function checkInventory() {
  const published = records
    .filter((r) => r.disposition === "publish")
    .map((r) => r.path);
  if (new Set(published.map((p) => p.toLowerCase())).size !== published.length)
    fail("Duplicate/case-colliding published asset paths");
  if (new Set(records.map((r) => r.source)).size !== records.length)
    fail("Duplicate asset source");
  const known = new Set(records.map((r) => r.source));
  for (const p of inventoryFiles())
    if (!known.has(p))
      fail(
        "Unclassified asset: " +
          p +
          "; classify it explicitly in static-assets.json",
      );
  for (const r of records) {
    if (!["publish", "repository"].includes(r.disposition))
      fail("Invalid classification: " + r.source);
    if (r.disposition === "publish") {
      if (!fs.existsSync(r.source)) fail("Missing source: " + r.source);
      if (assetBytes(r.source).byteLength !== r.bytes || hash(r.source) !== r.sha256)
        fail(
          "Asset changed; review and run npm run assets:update: " + r.source,
        );
    }
  }
}
export function prepare() {
  checkInventory();
  // Clear previously published assets when they become repository-only.
  const publicRoot = path.resolve("public");
  for (const r of records.filter(r => r.disposition === "repository")) {
    const target = path.resolve(publicRoot, r.path || r.source);
    if (!target.startsWith(publicRoot + path.sep)) fail("Invalid public asset path: " + target);
    if (fs.existsSync(target) && fs.statSync(target).isFile()) fs.unlinkSync(target);
  }
  for (const r of records.filter((r) => r.disposition === "publish")) {
    const target = "public/" + r.path;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(r.source, target);
  }
  console.log(
    "Prepared",
    records.filter((r) => r.disposition === "publish").length,
    "static assets",
  );
}
export function verify() {
  checkInventory();
  const output = new Set(walk("dist").map((p) => p.slice(5)));
  for (const r of records) {
    if (r.disposition === "publish") {
      if (!output.has(r.path)) fail("Missing/case mismatch in dist: " + r.path);
      if (
        fs.statSync("dist/" + r.path).size !== r.bytes ||
        hash("dist/" + r.path) !== r.sha256
      )
        fail("Hash mismatch: " + r.path);
    } else if (output.has(r.path || r.source))
      fail("Repository-only asset leaked into dist: " + r.source);
  }
  for (const p of walk("public")) {
    const relative = p.slice(7);
    if (!output.has(relative)) fail("Public file not deployed: " + relative);
    if (
      !records.some((r) => r.disposition === "publish" && r.path === relative)
    )
      fail("Unclassified public asset: " + relative);
  }
  // Exact-case resolution works identically on Windows and Linux.
  const htmlFiles = walk("dist").filter((p) => p.endsWith(".html"));
  for (const p of walk("dist").filter((p) => /\.(html|css)$/.test(p))) {
    const source = fs.readFileSync(p, "utf8");
    const refs = p.endsWith(".html")
      ? [
          ...source.matchAll(
            /<(?:script|link|img|a)\b[^>]*?\s(?:src|href)=["']([^"']+)["']/g,
          ),
        ].map((m) => m[1])
      : [...source.matchAll(/url\(\s*["']?([^\s)'";]+)["']?\s*\)/g)].map(
          (m) => m[1],
        );
    for (let ref of refs) {
      if (/^(https?:|data:|#|mailto:|javascript:)/.test(ref)) continue;
      ref = decodeURIComponent(ref.split(/[?#]/)[0]);
      let target;
      if (ref.startsWith("/")) {
        const base = process.env.PAGES_BASE_PATH || "/";
        if (!ref.startsWith(base)) fail("URL escapes base: " + ref);
        target = ref.slice(base.length);
      } else
        target = path.posix.normalize(
          path.posix.join(path.posix.dirname(p.slice(5)), ref),
        );
      if (!output.has(target))
        fail(`Broken reference ${p}: ${ref} -> ${target}`);
    }
  }
  for (const p of [
    "index.html",
    "data/mola16.bin",
  ])
    if (!output.has(p)) fail("Missing required runtime entry: " + p);
  if (!htmlFiles.length) fail("No built HTML");
  console.log(
    "Verified static hashes, classifications, HTML/CSS links and DEM",
  );
}
const command = process.argv[2];
if (command === "inventory") {
  for (const r of records.filter((r) => r.disposition === "publish")) {
    r.bytes = assetBytes(r.source).byteLength;
    r.sha256 = hash(r.source);
  }
  fs.writeFileSync(inventoryPath, JSON.stringify(records, null, 2) + "\n");
  checkInventory();
} else if (command === "prepare") prepare();
else if (command === "verify") verify();
