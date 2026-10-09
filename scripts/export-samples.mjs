// Exports samples/how-it-works.excalidraw to .excalidraw.svg / .excalidraw.png (scene embedded)
// by driving the built viewer in Chromium, exactly like a user clicking Export > Download SVG/PNG.
// Usage: XGP_OUT_DIR=.build-formats node scripts/build.mjs && XGP_DIST=.build-formats node scripts/export-samples.mjs
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, process.env.XGP_DIST ?? "dist");
const src = join(root, "samples/how-it-works.excalidraw");
const MIME = "application/vnd.excalidraw+json";

const context = await chromium.launchPersistentContext("", {
  channel: "chromium",
  headless: true,
  viewport: { width: 1280, height: 860 },
  locale: "en-US",
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});
try {
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent("serviceworker");
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/viewer.html?theme=light`);
  await page.locator('input[type="file"]').setInputFiles(src);
  await page.locator(".excalidraw canvas").first().waitFor();
  await page.waitForTimeout(800);

  for (const [item, out] of [
    ["Download SVG", "how-it-works.excalidraw.svg"],
    ["Download PNG", "how-it-works.excalidraw.png"],
  ]) {
    await page.getByRole("button", { name: "Export" }).click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("menuitem", { name: item }).click(),
    ]);
    const tmp = await download.path();
    const bytes = await readFile(tmp);
    if (!bytes.includes(Buffer.from(MIME))) throw new Error(`${out}: no embedded scene found`);
    await writeFile(join(root, "samples", out), bytes);
    console.log(`wrote samples/${out} (${bytes.length} bytes, scene embedded)`);
  }
} finally {
  await context.close();
}
