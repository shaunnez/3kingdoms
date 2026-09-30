import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  publicDir: "../../assets/runtime",
  server: {
    port: 4177,
    strictPort: true,
    proxy: { "/evidence": "http://127.0.0.1:2567" },
  },
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1800,
  },
});
