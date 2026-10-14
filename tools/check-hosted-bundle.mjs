/**
 * Proves the hosted playtest page ships no solo simulation: no quest text or
 * answers, no solo save code. Markers are long string literals taken from the
 * simulation and solo sources at run time (so they follow later rewrites),
 * minus any that other client code also contains.
 *
 * Usage: node tools/check-hosted-bundle.mjs [dir=dist/hosted] [--expect-solo]
 *   default        fail (exit 1) if any marker appears in the build
 *   --expect-solo  positive control: require at least three markers present
 */
import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const args = process.argv.slice(2);
const expectSolo = args.includes("--expect-solo");
const dir = resolve(args.find((a) => !a.startsWith("--")) ?? "dist/hosted");

async function files(root) {
  const out = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) out.push(...(await files(path)));
    else out.push(path);
  }
  return out;
}
const LITERAL = /(["'`])((?:(?!\1)[ -~]){24,})\1/g;
async function literals(path) {
  const found = new Set();
  for (const m of (await readFile(path, "utf8")).matchAll(LITERAL))
    if (!m[2].includes("\\") && !m[2].includes("${")) found.add(m[2]);
  return found;
}

const sources = [
  "packages/simulation/world.ts",
  "apps/client/src/local-world.ts",
];
const markers = new Set(["threefold-solo-world-v1"]);
for (const source of sources)
  for (const text of await literals(source)) markers.add(text);
// Strings the rest of the client also ships are not evidence of solo code.
const shared = [
  ...(await files("apps/client/src")).filter(
    (f) => /\.(ts|tsx)$/.test(f) && !/local-world[^/]*$/.test(f),
  ),
  ...(await files("packages/contracts")),
  "packages/simulation/map.ts",
];
for (const path of shared)
  for (const text of await literals(path)) markers.delete(text);

const hits = [];
const built = await files(dir);
for (const path of built) {
  if (!/\.(js|mjs|html|css|map|json|txt)$/.test(path)) continue;
  const text = await readFile(path, "utf8");
  for (const marker of markers)
    if (text.includes(marker))
      hits.push({ file: relative(dir, path), marker: marker.slice(0, 60) });
}
const named = built.some((f) => /local-world/.test(f));
const summary = {
  dir,
  mode: expectSolo ? "expect-solo" : "hosted",
  markers: markers.size,
  files: built.length,
  hits: hits.length,
  soloFileNames: named,
};
console.log(JSON.stringify(summary));
if (expectSolo) {
  if (new Set(hits.map((h) => h.marker)).size < 3) {
    console.error("Expected the solo simulation in this build, found none.");
    process.exit(1);
  }
} else if (hits.length || named) {
  for (const h of hits.slice(0, 20))
    console.error(`solo marker in ${h.file}: ${h.marker}`);
  if (named) console.error("A built file name contains local-world.");
  process.exit(1);
}
