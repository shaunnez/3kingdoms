/**
 * Build the game for a plain static host (for example a claude.ai Artifact):
 * one tiny page plus game.js and game.css, with fonts inlined as data URIs and
 * no other assets. The page runs in solo mode: the world simulation is hosted
 * in the page, so no server is needed.
 *
 * Usage: node tools/build-artifact.mjs [outDir=dist/artifact]
 */
import { build } from "vite";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const out = resolve(process.argv[2] ?? "dist/artifact");
const work = resolve("dist/artifact-build");
await build({
  configFile: resolve("apps/client/vite.config.ts"),
  base: "./",
  logLevel: "warn",
  build: {
    outDir: work,
    emptyOutDir: true,
    // Fonts and any other assets become data URIs inside the CSS and JS.
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    modulePreload: false,
    chunkSizeWarningLimit: 16_000,
    rolldownOptions: { output: { codeSplitting: false } },
  },
});

const built = (await readdir(join(work, "assets"))).filter(
  (name) => !name.endsWith(".map"),
);
const script = built.filter((name) => name.endsWith(".js"));
const style = built.filter((name) => name.endsWith(".css"));
if (script.length !== 1 || style.length !== 1 || built.length !== 2)
  throw new Error(`Expected one script and one stylesheet, got ${built}`);

// Hosts that wrap pages supply <!doctype>, <html>, <head> and <body>.
const page = [
  "<title>THREEFOLD</title>",
  '<meta name="theme-color" content="#2b2140" />',
  '<link rel="stylesheet" href="game.css" />',
  '<div id="root"></div>',
  '<script type="module" src="game.js"></script>',
  "",
].join("\n");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await writeFile(join(out, "index.html"), page);
await writeFile(
  join(out, "game.js"),
  await readFile(join(work, "assets", script[0])),
);
await writeFile(
  join(out, "game.css"),
  await readFile(join(work, "assets", style[0])),
);
const files = await readdir(out);
const sizes = {};
let total = 0;
for (const name of files) {
  const bytes = (await readFile(join(out, name))).length;
  sizes[name] = bytes;
  total += bytes;
}
console.log(JSON.stringify({ out, sizes, mib: +(total / 2 ** 20).toFixed(2) }));
if (total > 60 * 2 ** 20) throw new Error("Build exceeds the host's limits");
