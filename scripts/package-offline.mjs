import fs from "node:fs";
import { zipSync, unzipSync, strToU8 } from "fflate";
import { verify, walk } from "./assets.mjs";
verify();
if (JSON.parse(fs.readFileSync("dist/build-info.json", "utf8")).base !== "/") {
  throw Error(
    "Offline archives require a root-path build. Clear PAGES_BASE_PATH and run npm run build first.",
  );
}
const files = Object.fromEntries(
  walk("dist").map((p) => [p.slice(5), new Uint8Array(fs.readFileSync(p))]),
);
files["serve.cjs"] = strToU8(
  fs
    .readFileSync("server.js", "utf8")
    .replace("path.join(__dirname,'dist')", "__dirname"),
);
files["start-demo.cmd"] = strToU8(
  '@echo off\r\ncd /d "%~dp0"\r\nnode serve.cjs\r\n',
);
files["START.txt"] = strToU8(
  "Run node serve.cjs, or serve this directory with any static HTTP server.\nOpen http://127.0.0.1:18070/ . Do not use file://. No network is needed.\n",
);
const zipped = zipSync(files, { level: 6 }),
  contents = unzipSync(zipped);
for (const [name, bytes] of Object.entries(files))
  if (!Buffer.from(bytes).equals(Buffer.from(contents[name])))
    throw Error("ZIP verification failed: " + name);
fs.writeFileSync(
  process.env.OFFLINE_OUTPUT || "deliverables/Martian-Navigator-offline.zip",
  zipped,
);
console.log("Verified offline archive:", Object.keys(files).length, "files");
