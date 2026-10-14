/**
 * Build the game for a plain static host (for example a claude.ai Artifact):
 * one tiny page plus game.js and game.css, with fonts inlined as data URIs and
 * no other assets. The page runs in solo mode: the world simulation is hosted
 * in the page, so no server is needed.
 *
 * By default the page is a fragment for hosts that wrap pages in their own
 * document (such as a claude.ai Artifact). --standalone emits a complete
 * document for any plain static host.
 *
 * Usage: node tools/build-artifact.mjs [outDir=dist/artifact] [--standalone]
 */
import { build } from "vite";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

const args = process.argv.slice(2);
const standalone = args.includes("--standalone");
const out = resolve(args.find((a) => !a.startsWith("--")) ?? "dist/artifact");
const work = resolve("dist/artifact-build");
const inside = (child, parent) => {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !path.startsWith(sep));
};
// The output folder is replaced, so refuse anything that holds other work.
if (inside(process.cwd(), out) || inside(work, out) || inside(out, work))
  throw new Error(`Refusing to replace ${out}: choose an empty output folder`);
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

// Wrapping hosts supply <!doctype>, <html>, <head>, <body> and the charset.
const page = [
  ...(standalone
    ? [
        "<!doctype html>",
        '<html lang="en">',
        '<meta charset="utf-8" />',
        '<meta name="viewport" content="width=device-width, initial-scale=1" />',
      ]
    : []),
  "<title>THREEFOLD</title>",
  '<meta name="theme-color" content="#2b2140" />',
  '<link rel="stylesheet" href="game.css" />',
  '<div id="root"></div>',
  '<script type="module" src="game.js"></script>',
  ...(standalone ? ["</html>"] : []),
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
