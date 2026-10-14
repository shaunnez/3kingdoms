/**
 * Bundles the game server into one file (dist/server/main.mjs), so the
 * deployment image needs no node_modules.
 *
 * keepNames matters: Colyseus finds the Express app by its function name, and
 * a renamed bundle crashes on the first /matchmake request.
 */
import { build } from "esbuild";

const result = await build({
  entryPoints: ["apps/server/main.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  keepNames: true,
  outfile: "dist/server/main.mjs",
  // CommonJS dependencies inside an ES module bundle still call require().
  banner: {
    js: 'import { createRequire as __threefoldRequire } from "node:module"; const require = __threefoldRequire(import.meta.url);',
  },
  // Optional native accelerators; the server works without them.
  external: [
    "bufferutil",
    "utf-8-validate",
    "msgpackr-extract",
    "@colyseus/tools",
  ],
  logLevel: "warning",
  metafile: true,
});
if (result.warnings.some((w) => /could not resolve|missing/i.test(w.text)))
  throw new Error("Server bundle is missing a module");
const bytes = Object.values(result.metafile.outputs).reduce(
  (sum, o) => sum + o.bytes,
  0,
);
console.log(JSON.stringify({ out: "dist/server/main.mjs", bytes }));
