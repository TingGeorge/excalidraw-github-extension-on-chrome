// Builds the extension into dist/.
//   node scripts/build.mjs           production build
//   node scripts/build.mjs --watch   rebuild on change (reload the extension in chrome://extensions)
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { build as viteBuild } from "vite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const watch = process.argv.includes("--watch");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

// 1. Static files: manifest (version synced from package.json), icons, Excalidraw fonts.
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const manifest = JSON.parse(await readFile(join(root, "static/manifest.json"), "utf8"));
manifest.version = pkg.version;
await writeFile(join(dist, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
await cp(join(root, "static/icons"), join(dist, "icons"), { recursive: true });
await cp(join(root, "node_modules/@excalidraw/excalidraw/dist/prod/fonts"), join(dist, "fonts"), {
  recursive: true,
});

// 2. Content script (classic script, IIFE) and service worker (ES module).
const esbuildOptions = {
  absWorkingDir: root,
  bundle: true,
  target: "chrome120",
  minify: !watch,
  legalComments: "none",
  logLevel: "info",
  define: { "process.env.NODE_ENV": JSON.stringify(watch ? "development" : "production") },
};
const scripts = [
  { ...esbuildOptions, entryPoints: { content: "src/content/index.ts" }, format: "iife", outdir: dist },
  { ...esbuildOptions, entryPoints: { content: "src/content/content.css" }, outdir: dist },
  { ...esbuildOptions, entryPoints: { background: "src/background/index.ts" }, format: "esm", outdir: dist },
];
if (watch) {
  for (const options of scripts) await (await esbuild.context(options)).watch();
} else {
  await Promise.all(scripts.map((options) => esbuild.build(options)));
}

// 3. Extension pages (viewer, options, popup) with Vite.
await viteBuild({
  configFile: join(root, "vite.config.ts"),
  mode: watch ? "development" : "production",
  logLevel: "warn",
  build: watch ? { watch: {}, minify: false } : {},
});

if (!watch) console.log(`\nBuilt extension ${pkg.version} into dist/`);
