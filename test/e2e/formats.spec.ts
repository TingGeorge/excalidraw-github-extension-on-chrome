import { expect, test } from "./fixtures";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";

const SAMPLES = join(import.meta.dirname, "../../samples");
const OUT = process.env.XGP_SHOTS ?? "test-results-formats";
const MIME = "application/vnd.excalidraw+json";

const problems: string[] = [];

test.beforeEach(async ({ page }) => {
  problems.length = 0;
  page.on(
    "console",
    (m) =>
      m.type() === "error" &&
      // Known: Excalidraw's SVG export tries woff2 glyph subsetting via eval, which the extension CSP blocks;
      // it catches the error and falls back to embedding whole fonts. Reported, not fatal.
      !/^(Skipped glyph subsetting|Failed to use workers for subsetting)/.test(m.text()) &&
      problems.push(`console: ${m.text()}`),
  );
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
});
test.afterEach(() => {
  expect(problems).toEqual([]);
});

async function open(
  page: Page,
  extensionId: string,
  file: string | { name: string; mimeType: string; buffer: Buffer },
) {
  await page.goto(`chrome-extension://${extensionId}/viewer.html?theme=light`);
  await page
    .locator('input[type="file"]')
    .setInputFiles(typeof file === "string" ? join(SAMPLES, file) : file);
}

const cases = [
  { file: "how-it-works.excalidraw" },
  { file: "how-it-works.excalidraw.svg" },
  { file: "how-it-works.excalidraw.png" },
  { file: "obsidian-note.excalidraw.md" },
  { file: "shapes.excalidrawlib", items: 4 },
];

for (const { file, items } of cases) {
  test(`renders ${file}`, async ({ page, extensionId }) => {
    await open(page, extensionId, file);
    await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
    await expect(page.locator(".xv-title__name")).toHaveText(file);
    await expect(page.locator(".xv-error")).toHaveCount(0);
    if (items) await expect(page.locator(".xv-chip")).toHaveText(`${items} library items`);
    else await expect(page.locator(".xv-chip")).toHaveCount(0);
    await page.waitForTimeout(1000);
    await expect(page.locator(".xv-error")).toHaveCount(0);
    await page.screenshot({ path: `${OUT}/${file}.png` });
  });
}

test("embedded scenes are really present in the exported samples", () => {
  expect(readFileSync(join(SAMPLES, "how-it-works.excalidraw.svg"), "utf8")).toContain(
    `payload-type:${MIME}`,
  );
  expect(readFileSync(join(SAMPLES, "how-it-works.excalidraw.png")).includes(Buffer.from(MIME))).toBe(true);
});

test("a plain .svg without an embedded scene shows a friendly error", async ({ page, extensionId }) => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="red"/></svg>';
  await open(page, extensionId, { name: "plain.svg", mimeType: "image/svg+xml", buffer: Buffer.from(svg) });
  const err = page.locator(".xv-error");
  await expect(err).toBeVisible();
  await expect(err).toContainText("does not contain an embedded Excalidraw scene");
  await page.screenshot({ path: `${OUT}/plain-svg-error.png` });
});

for (const [item, name] of [
  ["Download PNG", "how-it-works.png"],
  ["Download SVG", "how-it-works.svg"],
  ["Download .excalidraw", "how-it-works.excalidraw"],
] as const) {
  test(`Export menu: ${item} -> ${name}`, async ({ page, extensionId }) => {
    await open(page, extensionId, "how-it-works.excalidraw");
    await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
    await page.getByRole("button", { name: "Export" }).click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("menuitem", { name: item }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(name);
    expect(readFileSync(await download.path()).length).toBeGreaterThan(1000);
  });
}

test("Export names from every format drop the double extension", async ({ page, extensionId }) => {
  const names: Record<string, string> = {
    "how-it-works.excalidraw.svg": "how-it-works.png",
    "how-it-works.excalidraw.png": "how-it-works.png",
    "obsidian-note.excalidraw.md": "obsidian-note.png",
  };
  for (const [file, expected] of Object.entries(names)) {
    await open(page, extensionId, file);
    await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
    await page.getByRole("button", { name: "Export" }).click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("menuitem", { name: "Download PNG" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(expected);
  }
});
