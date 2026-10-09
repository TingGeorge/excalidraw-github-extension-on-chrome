import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, fixture, ROOT, routeGitHub, test } from "./fixtures";

const GIST = "https://gist.github.com/example-user/0f1e2d3c4b5a69788796a5b4c3d2e1f0";
const RAW = `${GIST}/raw/9b96b41e01c4b3c3608a9f1003f5f7ee7647742f/how-it-works.excalidraw`;
const sample = readFileSync(join(ROOT, "samples/how-it-works.excalidraw"), "utf8");

test.beforeEach(async ({ context }) => {
  await routeGitHub(context, {
    [GIST]: { body: fixture("github/gist.html"), contentType: "text/html" },
    [RAW]: { body: sample, contentType: "text/plain" },
  });
});

const excalidrawFile = '.file:has([data-xgp="actions"])';

test("adds Preview and Inline only to the Excalidraw file of a gist", async ({ page }) => {
  await page.goto(GIST);
  await expect(page.locator('[data-xgp="actions"]')).toHaveCount(1);
  const file = page.locator(excalidrawFile);
  await expect(file.locator(".gist-blob-name")).toHaveText("how-it-works.excalidraw");
  // placed right before GitHub's Raw button
  const nextIsRaw = await page
    .locator('[data-xgp="actions"]')
    .evaluate((el) => (el.nextElementSibling as HTMLAnchorElement | null)?.href.includes("/raw/") ?? false);
  expect(nextIsRaw).toBe(true);
});

test("Preview opens the gist file in a new tab", async ({ page, context }) => {
  await page.goto(GIST);
  const [viewer] = await Promise.all([
    context.waitForEvent("page"),
    page.locator('[data-xgp="actions"]').getByRole("button", { name: "Preview" }).click(),
  ]);
  await expect(viewer.locator(".excalidraw canvas").first()).toBeVisible();
  await expect(viewer.locator(".xv-title__name")).toHaveText("how-it-works.excalidraw");
  await expect(viewer.locator(".xv-title__context")).toContainText("gist");
});

test("Inline replaces only that file's code with the diagram", async ({ page }) => {
  await page.goto(GIST);
  const file = page.locator(excalidrawFile);
  await file.getByRole("button", { name: "Inline" }).click();
  await expect(
    file.frameLocator('[data-xgp="inline"] iframe').locator(".excalidraw canvas").first(),
  ).toBeVisible();
  await expect(file.locator(".blob-wrapper")).toBeHidden();
  // The other file in the gist is untouched.
  await expect(page.locator(".file", { hasText: "notes.md" }).locator(".blob-wrapper")).toBeVisible();
  await file.getByRole("button", { name: "Inline" }).click();
  await expect(file.locator('[data-xgp="inline"]')).toHaveCount(0);
  await expect(file.locator(".blob-wrapper")).toBeVisible();
});

test("after a Turbo cache restore there is exactly one working button group", async ({ page, context }) => {
  await page.goto(GIST);
  await expect(page.locator('[data-xgp="actions"]')).toHaveCount(1);
  // What Turbo does on back navigation: snapshot (before-cache), later restore a clone.
  await page.evaluate(() => {
    document.dispatchEvent(new Event("turbo:before-cache"));
    document.body.replaceWith(document.body.cloneNode(true));
  });
  await expect(page.locator('[data-xgp="actions"]')).toHaveCount(1);
  const [viewer] = await Promise.all([
    context.waitForEvent("page"),
    page.locator('[data-xgp="actions"]').getByRole("button", { name: "Preview" }).click(),
  ]);
  await expect(viewer.locator(".excalidraw canvas").first()).toBeVisible();
});

test("a restored clone without the before-cache cleanup is replaced, not duplicated", async ({ page }) => {
  await page.goto(GIST);
  await expect(page.locator('[data-xgp="actions"]')).toHaveCount(1);
  await page.evaluate(() => document.body.replaceWith(document.body.cloneNode(true)));
  await page.waitForTimeout(300);
  await expect(page.locator('[data-xgp="actions"]')).toHaveCount(1);
});
