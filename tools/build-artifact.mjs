/**
 * Build the game as one self-contained HTML page for static hosts that only
 * allow inline scripts (for example a claude.ai Artifact). The page runs in
 * solo mode: the world simulation is hosted in the page, so no server is needed.
 *
 * Usage: node tools/build-artifact.mjs [outFile=dist/artifact/threefold.html]
 */
import { build } from "vite";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const out = resolve(process.argv[2] ?? "dist/artifact/threefold.html");
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

const html = await readFile(join(work, "index.html"), "utf8");
const assets = new Map();
for (const name of await readdir(join(work, "assets")))
  assets.set(
    `./assets/${name}`,
    await readFile(join(work, "assets", name), "utf8"),
  );
const take = (href) => {
  const body = assets.get(href);
  if (body === undefined) throw new Error(`Missing built asset ${href}`);
  assets.delete(href);
  return body;
};

const title =
  html.match(/<title>[\s\S]*?<\/title>/)?.[0] ?? "<title>THREEFOLD</title>";
const styles = [
  ...html.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g),
].map((m) => `<style>\n${take(m[1])}\n</style>`);
const scripts = [
  ...html.matchAll(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g),
].map(
  (m) =>
    // Inline module code must never contain a literal closing script tag.
    `<script type="module">\n${take(m[1]).replace(/<\/script/gi, "<\\/script")}\n</script>`,
);
if (!scripts.length)
  throw new Error("No module entry found in the built index.html");
const leftover = [...assets.keys()].filter((k) => !k.endsWith(".map"));
if (leftover.length)
  throw new Error(`Unreferenced chunks would be lost: ${leftover.join(", ")}`);

// The host supplies <!doctype>, <html>, <head> and <body>; ship only the content.
const page = [
  title,
  '<meta name="theme-color" content="#2b2140" />',
  ...styles,
  '<div id="root"></div>',
  ...scripts,
  "",
].join("\n");
await mkdir(dirname(out), { recursive: true });
await writeFile(out, page);
const mib = Buffer.byteLength(page) / 1024 / 1024;
console.log(JSON.stringify({ out, mib: Number(mib.toFixed(2)) }));
if (mib > 15.5)
  throw new Error("Single-file page exceeds the 16 MB host limit");
