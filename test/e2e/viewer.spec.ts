import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, fixture, ROOT, routeGitHub, test } from "./fixtures";

const REPO = "https://github.com/TingGeorge/excalidraw-github-extension-on-chrome";
const BLOB = `${REPO}/blob/main/samples/how-it-works.excalidraw`;
const RAW = `${REPO}/raw/refs/heads/main/samples/how-it-works.excalidraw`;
const SAMPLE = join(ROOT, "samples/how-it-works.excalidraw");

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  return errors;
}

async function openLocal(page: Page, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}/viewer.html`);
  await page.locator('input[type="file"]').setInputFiles(SAMPLE);
  await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
}

test("viewer without a file shows the local file picker", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/viewer.html`);
  await expect(page.getByRole("heading", { name: "Preview an Excalidraw file" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose file…" })).toBeVisible();
});

test("expired preview id shows a helpful error", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/viewer.html?id=does-not-exist`);
  await expect(page.getByRole("alert")).toContainText("expired");
});

test("theme toggle switches Excalidraw to dark mode", async ({ page, extensionId }) => {
  const errors = collectErrors(page);
  await openLocal(page, extensionId);
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator(".excalidraw.theme--dark")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.waitForTimeout(500);
  await page.screenshot({ path: "test-results/viewer-dark.png" });
  expect(errors).toEqual([]);
});

test("edit mode marks local edits and can discard them", async ({ page, extensionId }) => {
  await openLocal(page, extensionId);
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.locator(".App-toolbar")).toBeVisible();
  // draw a rectangle
  await page.keyboard.press("r");
  // draw away from the toolbar and the shape properties panel
  const canvas = page.locator("canvas.interactive");
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width - 260, box.y + box.height - 220);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 120, box.y + box.height - 120, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByText("Local edits are not saved to GitHub")).toBeVisible();
  await page.getByRole("button", { name: "Discard edits" }).click();
  await expect(page.getByText("Local edits are not saved to GitHub")).toHaveCount(0);
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.locator(".App-toolbar")).toHaveCount(0);
});

test.describe("Traditional Chinese", () => {
  test.use({ locale: "zh-TW" });

  test("UI strings are translated", async ({ page, extensionId }) => {
    await openLocal(page, extensionId);
    await expect(page.getByRole("button", { name: "編輯" })).toBeVisible();
    await expect(page.getByRole("button", { name: "匯出" })).toBeVisible();
    await page.getByRole("button", { name: "匯出" }).click();
    await expect(page.getByRole("menuitem", { name: "下載 PNG" })).toBeVisible();
    await page.screenshot({ path: "test-results/viewer-zh-tw.png" });
  });
});

test.describe("inline preview on GitHub", () => {
  test.beforeEach(async ({ context }) => {
    await routeGitHub(context, {
      [BLOB]: { body: fixture("github/blob-excalidraw.html"), contentType: "text/html" },
      [RAW]: { body: readFileSync(SAMPLE, "utf8"), contentType: "text/plain" },
    });
  });

  test("viewer header shows repo, branch and folder", async ({ page, context }) => {
    await page.goto(BLOB);
    const [viewer] = await Promise.all([
      context.waitForEvent("page"),
      page.locator('[data-xgp="actions"]').getByRole("button", { name: "Preview" }).click(),
    ]);
    await expect(viewer.locator(".xv-title__context")).toHaveText(
      "TingGeorge/excalidraw-github-extension-on-chrome · main · samples",
    );
  });

  test("mouse wheel scrolls the GitHub page until the diagram is clicked", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 700 });
    await page.goto(BLOB);
    await page.locator('[data-xgp="actions"]').getByRole("button", { name: "Inline" }).click();
    const iframe = page.locator('[data-xgp="inline"] iframe');
    const frame = page.frameLocator('[data-xgp="inline"] iframe');
    await expect(frame.locator(".excalidraw canvas").first()).toBeVisible();
    await iframe.scrollIntoViewIfNeeded();
    const box = (await iframe.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 200);
    const before = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 300);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before);

    // Clicking into the diagram must not make the page jump...
    const box2 = (await iframe.boundingBox())!;
    const beforeClick = await page.evaluate(() => window.scrollY);
    await page.mouse.click(box2.x + box2.width / 2, box2.y + 200);
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => window.scrollY);
    expect(after).toBe(beforeClick);
    // ...and afterwards the wheel pans the canvas instead of the page.
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.scrollY)).toBe(after);
  });

  test("inline preview can be resized and remembers its height", async ({ page }) => {
    await page.goto(BLOB);
    await page.locator('[data-xgp="actions"]').getByRole("button", { name: "Inline" }).click();
    const container = page.locator('[data-xgp="inline"]');
    await expect(container).toBeVisible();
    const handle = page.locator(".xgp-inline__resize");
    await handle.scrollIntoViewIfNeeded();
    const start = (await container.boundingBox())!.height;
    const hb = (await handle.boundingBox())!;
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2, hb.y - 150, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => (await container.boundingBox())!.height).toBeLessThan(start - 100);
    const saved = (await container.boundingBox())!.height;
    // Close and reopen: the new height is used.
    const inlineBtn = page.locator('[data-xgp="actions"]').getByRole("button", { name: "Inline" });
    await inlineBtn.click();
    await inlineBtn.click();
    await expect
      .poll(async () => Math.round((await container.boundingBox())!.height))
      .toBe(Math.round(saved));
  });
});

test.describe("opening a GitHub link directly (context menu)", () => {
  test("viewer.html?url=<blob url> downloads the file through the service worker", async ({
    page,
    context,
    extensionId,
  }) => {
    await routeGitHub(context, {
      [`${REPO}/raw/main/samples/how-it-works.excalidraw`]: {
        body: readFileSync(SAMPLE, "utf8"),
        contentType: "text/plain",
      },
    });
    await page.goto(`chrome-extension://${extensionId}/viewer.html?url=${encodeURIComponent(BLOB)}`);
    await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
    await expect(page.locator(".xv-title__name")).toHaveText("how-it-works.excalidraw");
  });

  test("a missing file shows the signed-out hint and a retry button", async ({
    page,
    context,
    extensionId,
  }) => {
    await routeGitHub(context, {});
    await page.goto(`chrome-extension://${extensionId}/viewer.html?url=${encodeURIComponent(BLOB)}`);
    await expect(page.getByRole("alert")).toContainText("signed in");
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  });
});

test("Discard edits works more than once", async ({ page, extensionId }) => {
  await openLocal(page, extensionId);
  await page.getByRole("button", { name: "Edit" }).click();
  const canvas = page.locator("canvas.interactive");
  const box = (await canvas.boundingBox())!;
  const draw = async (dx: number) => {
    await page.keyboard.press("r");
    await page.mouse.move(box.x + box.width - 300 + dx, box.y + box.height - 220);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 200 + dx, box.y + box.height - 140, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.press("Escape");
  };
  for (const dx of [0, 40]) {
    await draw(dx);
    await expect(page.getByText("Local edits are not saved to GitHub")).toBeVisible();
    await page.getByRole("button", { name: "Discard edits" }).click();
    await expect(page.getByText("Local edits are not saved to GitHub")).toHaveCount(0);
  }
});

test("an expired preview falls back to downloading the file again", async ({
  page,
  context,
  extensionId,
}) => {
  await routeGitHub(context, {
    [`${REPO}/raw/main/samples/how-it-works.excalidraw`]: {
      body: readFileSync(SAMPLE, "utf8"),
      contentType: "text/plain",
    },
  });
  await page.goto(`chrome-extension://${extensionId}/viewer.html?id=gone&url=${encodeURIComponent(BLOB)}`);
  await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
  await expect(page.locator(".xv-title__name")).toHaveText("how-it-works.excalidraw");
});
