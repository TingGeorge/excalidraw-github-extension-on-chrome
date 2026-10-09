// Zips dist/ into release/excalidraw-github-preview-<version>.zip, ready for
// "Load unpacked" (after unzipping) or upload to the Chrome Web Store.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
if (!existsSync(join(dist, "manifest.json"))) {
  console.error("dist/ is missing — run `npm run build` first.");
  process.exit(1);
}
const { version } = JSON.parse(readFileSync(join(dist, "manifest.json"), "utf8"));
const outDir = join(root, "release");
const zip = join(outDir, `excalidraw-github-preview-${version}.zip`);
mkdirSync(outDir, { recursive: true });
rmSync(zip, { force: true });
execFileSync("zip", ["-r", "-q", "-X", zip, "."], { cwd: dist, stdio: "inherit" });
console.log(`${zip} (${(statSync(zip).size / 1024 / 1024).toFixed(1)} MB)`);
