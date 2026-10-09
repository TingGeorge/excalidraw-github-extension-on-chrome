import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

const root = import.meta.dirname;

/**
 * Excalidraw lists a CDN copy (esm.sh) after each bundled font as a fallback.
 * The extension bundles every font and must not contact third parties, so the
 * fallback is pointed at a path inside the extension instead (it is never
 * needed). The build fails if a CDN reference survives, e.g. after an upgrade.
 */
function noExcalidrawCdn(): Plugin {
  const CDN = "`https://esm.sh/";
  const CDN_HOSTS = /https:\/\/(esm\.sh|unpkg\.com|cdn\.jsdelivr\.net)\//;
  return {
    name: "no-excalidraw-cdn",
    transform(code, id) {
      if (!id.includes("@excalidraw") || !code.includes(CDN)) return null;
      return { code: code.split(CDN).join("`${self.location.origin}/no-cdn/"), map: null };
    },
    generateBundle(_options, bundle) {
      for (const [name, chunk] of Object.entries(bundle)) {
        if (chunk.type === "chunk" && CDN_HOSTS.test(chunk.code)) {
          this.error(`${name} still references a CDN (${CDN_HOSTS.exec(chunk.code)![0]})`);
        }
      }
    },
  };
}

// Builds the extension pages (viewer, options, popup). The content script and
// service worker are bundled separately by scripts/build.mjs with esbuild,
// because content scripts cannot be ES modules.
export default defineConfig({
  root: resolve(root, "src/pages"),
  base: "./",
  publicDir: false,
  plugins: [react(), noExcalidrawCdn()],
  build: {
    outDir: resolve(root, "dist"),
    emptyOutDir: false,
    target: "chrome120",
    chunkSizeWarningLimit: 8000,
    sourcemap: false,
    rollupOptions: {
      input: {
        viewer: resolve(root, "src/pages/viewer.html"),
        options: resolve(root, "src/pages/options.html"),
        popup: resolve(root, "src/pages/popup.html"),
      },
    },
  },
  worker: { format: "es" },
});
