import fs from "node:fs";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

// Mutate only generated output or a temporary untracked input; always restore it.
const file = "dist/data/jezero-extended/optical.png",
  original = fs.readFileSync(file);
const rejects = (message) => {
  const result = spawnSync(process.execPath, ["scripts/assets.mjs", "verify"], {
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0, "Corrupt output must fail verification");
  assert(result.stderr.includes(message), result.stderr);
};
try {
  fs.renameSync(file, file + ".missing");
  rejects("Missing/case mismatch");
} finally {
  if (fs.existsSync(file + ".missing")) fs.renameSync(file + ".missing", file);
}
try {
  fs.appendFileSync(file, Buffer.from([0]));
  rejects("Hash mismatch");
} finally {
  fs.writeFileSync(file, original);
}
try {
  fs.renameSync(file, "dist/data/jezero-extended/OPTICAL.png");
  rejects("Missing/case mismatch");
} finally {
  fs.renameSync("dist/data/jezero-extended/OPTICAL.png", file);
}
const unclassified = "data/__asset_integrity_test__.tmp";
try {
  fs.writeFileSync(unclassified, "not classified");
  rejects("Unclassified asset");
} finally {
  fs.unlinkSync(unclassified);
}
console.log(
  "Asset verifier rejects missing files, hash changes, case errors and unclassified inputs",
);
