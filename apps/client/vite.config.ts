import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  // Relative asset URLs: the build runs from any static host or sub-path.
  base: "./",
  plugins: [react()],
  // Everything is generated in code at load time; no public runtime assets.
  publicDir: false,
  server: {
    port: 4177,
    strictPort: true,
    proxy: { "/evidence": "http://127.0.0.1:2567" },
  },
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true,
    // The Babylon.js barrel dominates the game chunk (about 7.5 MB minified,
    // 1.7 MB gzipped); warn only if it grows well beyond that.
    chunkSizeWarningLimit: 8500,
  },
});
