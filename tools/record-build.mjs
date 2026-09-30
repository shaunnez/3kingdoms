import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
async function paths(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...(await paths(p)));
    else out.push(p);
  }
  return out;
}
const files = [
  ...(await paths("apps")),
  ...(await paths("packages")),
  ...(await paths("assets/runtime")),
  "package.json",
  "package-lock.json",
  "tsconfig.json",
].sort();
const hashes = {};
for (const p of files)
  hashes[p] = createHash("sha256")
    .update(await readFile(p))
    .digest("hex");
const fingerprint = createHash("sha256")
  .update(JSON.stringify(hashes))
  .digest("hex");
await writeFile(
  "artifacts/checkpoint/build-manifest.json",
  JSON.stringify(
    {
      build: "0.1.0-briar-gate",
      recordedAt: new Date().toISOString(),
      fingerprint,
      files: hashes,
    },
    null,
    2,
  ) + "\n",
);
console.log({ build: "0.1.0-briar-gate", fingerprint, files: files.length });
