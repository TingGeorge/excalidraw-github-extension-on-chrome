// Builds the extension into dist/.
//   node scripts/build.mjs           production build
//   node scripts/build.mjs --watch   rebuild on change (reload the extension in chrome://extensions)
// XGP_OUT_DIR=<dir> builds somewhere other than dist/.
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { build as viteBuild } from "vite";
import { writeNotices } from "./notices.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, process.env.XGP_OUT_DIR ?? "dist");
const watch = process.argv.includes("--watch");
// --dev: unminified development build (readable React errors) without watching.
const dev = watch || process.argv.includes("--dev");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

// 1. Static files: manifest (version synced from package.json), icons, Excalidraw fonts.
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const manifest = JSON.parse(await readFile(join(root, "static/manifest.json"), "utf8"));
manifest.version = pkg.version;
await writeFile(join(dist, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
await cp(join(root, "static/icons"), join(dist, "icons"), { recursive: true });
await cp(join(root, "static/_locales"), join(dist, "_locales"), { recursive: true });
await cp(join(root, "node_modules/@excalidraw/excalidraw/dist/prod/fonts"), join(dist, "fonts"), {
  recursive: true,
});
writeNotices(root, join(dist, "THIRD_PARTY_NOTICES.txt"));

// 2. Content script (classic script, IIFE) and service worker (ES module).
const esbuildOptions = {
  absWorkingDir: root,
  bundle: true,
  target: "chrome120",
  minify: !dev,
  legalComments: "none",
  logLevel: "info",
  define: { "process.env.NODE_ENV": JSON.stringify(dev ? "development" : "production") },
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
// `vite build` bundles React's production build unless NODE_ENV says otherwise.
if (dev) process.env.NODE_ENV = "development";
await viteBuild({
  configFile: join(root, "vite.config.ts"),
  mode: dev ? "development" : "production",
  logLevel: "warn",
  build: { outDir: dist, ...(dev ? { minify: false } : {}), ...(watch ? { watch: {} } : {}) },
});

if (!watch) console.log(`\nBuilt extension ${pkg.version} into ${dist}`);
