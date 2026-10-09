import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

// Builds the extension pages (viewer, options, popup). The content script and
// service worker are bundled separately by scripts/build.mjs with esbuild,
// because content scripts cannot be ES modules.
export default defineConfig({
  root: resolve(import.meta.dirname, "src/pages"),
  base: "./",
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: resolve(import.meta.dirname, "dist"),
    emptyOutDir: false,
    target: "chrome120",
    chunkSizeWarningLimit: 8000,
    sourcemap: false,
    rollupOptions: {
      input: {
        viewer: resolve(import.meta.dirname, "src/pages/viewer.html"),
        options: resolve(import.meta.dirname, "src/pages/options.html"),
        popup: resolve(import.meta.dirname, "src/pages/popup.html"),
      },
    },
  },
  worker: { format: "es" },
});
