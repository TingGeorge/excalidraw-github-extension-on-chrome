import { expect, fixture, routeGitHub, test } from "./fixtures";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = "https://github.com/TingGeorge/excalidraw-github-extension-on-chrome";
const BLOB = `${REPO}/blob/main/samples/how-it-works.excalidraw`;
const RAW = `${REPO}/raw/refs/heads/main/samples/how-it-works.excalidraw`;
const sample = readFileSync(join(import.meta.dirname, "../../samples/how-it-works.excalidraw"), "utf8");

test.beforeEach(async ({ context }) => {
  await routeGitHub(context, {
    [BLOB]: { body: fixture("github/blob-excalidraw.html"), contentType: "text/html" },
    [RAW]: { body: sample, contentType: "text/plain" },
  });
});

test("adds Preview and Inline buttons next to Raw", async ({ page }) => {
  await page.goto(BLOB);
  const actions = page.locator('[data-xgp="actions"]');
  await expect(actions).toBeVisible();
  await expect(actions.getByRole("button", { name: "Preview" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Inline" })).toBeVisible();
  // placed right before GitHub's Raw/Copy/Download group
  const next = await actions.evaluate(
    (el) => el.nextElementSibling?.querySelector('[data-testid="raw-button"]') !== null,
  );
  expect(next).toBe(true);
  await page.screenshot({
    path: "test-results/blob-buttons.png",
    clip: { x: 0, y: 0, width: 1280, height: 400 },
  });
});

test("Preview opens the diagram in a new tab", async ({ page, context }) => {
  await page.goto(BLOB);
  const [viewer] = await Promise.all([
    context.waitForEvent("page"),
    page.locator('[data-xgp="actions"]').getByRole("button", { name: "Preview" }).click(),
  ]);
  await expect(viewer.locator(".excalidraw canvas").first()).toBeVisible();
  await expect(viewer.locator(".xv-title__name")).toHaveText("how-it-works.excalidraw");
  await viewer.waitForTimeout(800);
  await viewer.screenshot({ path: "test-results/blob-viewer-tab.png" });
});

test("Inline shows the diagram on the page and hides the code", async ({ page }) => {
  await page.goto(BLOB);
  await page.locator('[data-xgp="actions"]').getByRole("button", { name: "Inline" }).click();
  const frame = page.frameLocator('[data-xgp="inline"] iframe');
  await expect(frame.locator(".excalidraw canvas").first()).toBeVisible();
  await expect(page.locator("section[data-xgp-hidden]")).toHaveCount(1);
  await page.waitForTimeout(800);
  await page.screenshot({ path: "test-results/blob-inline.png" });
  await page.locator('[data-xgp="actions"]').getByRole("button", { name: "Inline" }).click();
  await expect(page.locator('[data-xgp="inline"]')).toHaveCount(0);
  await expect(page.locator("section[data-xgp-hidden]")).toHaveCount(0);
});
