import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const SOLO = fileURLToPath(new URL("./src/local-world.ts", import.meta.url));
const SOLO_STUB = fileURLToPath(
  new URL("./src/local-world.hosted.ts", import.meta.url),
);

/**
 * The hosted playtest page ships without solo mode: local-world.ts, and with
 * it the whole simulation, quest text and answers, resolves to a stub. A build
 * flag alone still emits the module.
 */
function hostedWithoutSolo(): Plugin {
  return {
    name: "threefold-hosted-without-solo",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!source.includes("local-world")) return null;
      const resolved = await this.resolve(source, importer, {
        ...options,
        skipSelf: true,
      });
      return resolved?.id === SOLO ? SOLO_STUB : null;
    },
  };
}

// `--mode hosted` builds the page the game server serves (npm run build:hosted).
export default defineConfig(({ mode }) => {
  const hosted = mode === "hosted";
  return {
    root: fileURLToPath(new URL(".", import.meta.url)),
    // Relative asset URLs: the build runs from any static host or sub-path.
    base: "./",
    define: { __THREEFOLD_HOSTED__: JSON.stringify(hosted) },
    plugins: [react(), ...(hosted ? [hostedWithoutSolo()] : [])],
    // Everything is generated in code at load time; no public runtime assets.
    publicDir: false,
    server: {
      port: 4177,
      strictPort: true,
      proxy: { "/evidence": "http://127.0.0.1:2567" },
    },
    build: {
      outDir: hosted ? "../../dist/hosted" : "../../dist/client",
      emptyOutDir: true,
      // The Babylon.js barrel dominates the game chunk (about 7.5 MB minified,
      // 1.7 MB gzipped); warn only if it grows well beyond that.
      chunkSizeWarningLimit: 8500,
    },
  };
});
