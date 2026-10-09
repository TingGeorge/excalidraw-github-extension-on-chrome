/**
 * Generates the README images in docs/images. Not part of the normal test run:
 *   npm run build && npm run screenshots
 */
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, fixture, ROOT, routeGitHub, test } from "./fixtures";
import { styled } from "./primer";

test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 (npm run screenshots) to regenerate docs/images");

const OUT = join(ROOT, "docs/images");
mkdirSync(OUT, { recursive: true });

const REPO = "https://github.com/TingGeorge/excalidraw-github-extension-on-chrome";
const BLOB = `${REPO}/blob/main/samples/how-it-works.excalidraw`;
const RAW = `${REPO}/raw/refs/heads/main/samples/how-it-works.excalidraw`;
const sample = (name: string) => readFileSync(join(ROOT, "samples", name), "utf8");

async function serveBlob(page: Page, mode: "light" | "dark" = "light") {
  await routeGitHub(page.context(), {
    [BLOB]: { body: styled(fixture("github/blob-excalidraw.html"), mode), contentType: "text/html" },
    [RAW]: { body: sample("how-it-works.excalidraw"), contentType: "text/plain" },
  });
}

test.describe("crisp", () => {
  test.use({ deviceScaleFactor: 2 });

  test("toolbar", async ({ page }) => {
    // Just GitHub's real file-header button bar (from the captured page) on a plain background.
    const full = fixture("github/blob-excalidraw.html");
    const start = full.indexOf('<div class="react-blob-header-edit-and-raw-actions');
    const end = full.indexOf("</button>", full.indexOf('data-testid="download-raw-button"'));
    const bar = `${full.slice(start, end)}</button></div></div></div>`;
    const html = styled(
      `<html data-color-mode="light" data-light-theme="light" data-dark-theme="dark"><head></head>` +
        `<body style="margin:0;padding:12px 16px;background:var(--bgColor-default)">` +
        `<div style="display:flex;align-items:center">${bar}</div></body></html>`,
    );
    await routeGitHub(page.context(), {
      [BLOB]: { body: html, contentType: "text/html" },
      [RAW]: { body: sample("how-it-works.excalidraw"), contentType: "text/plain" },
    });
    await page.setViewportSize({ width: 600, height: 56 });
    await page.goto(BLOB);
    await expect(page.locator('[data-xgp="actions"]')).toBeVisible();
    await page.screenshot({ path: join(OUT, "toolbar.png") });
  });
});

test("viewer", async ({ page, context }) => {
  await page.setViewportSize({ width: 1200, height: 720 });
  await serveBlob(page);
  await page.goto(BLOB);
  const [viewer] = await Promise.all([
    context.waitForEvent("page"),
    page.locator('[data-xgp="actions"]').getByRole("button", { name: "Preview" }).click(),
  ]);
  await viewer.setViewportSize({ width: 1200, height: 720 });
  await expect(viewer.locator(".excalidraw canvas").first()).toBeVisible();
  await viewer.getByRole("button", { name: "Fit to content" }).click();
  await viewer.waitForTimeout(1200);
  await viewer.screenshot({ path: join(OUT, "viewer.png") });
});

test("diff", async ({ page, extensionId, context }) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  const base = fixture("github/how-it-works.base.excalidraw");
  const head = sample("how-it-works.excalidraw");
  const [viewer] = await Promise.all([
    context.waitForEvent("page"),
    page.evaluate(
      ([baseData, headData]) => {
        const source = (ref: string) => ({
          repo: "TingGeorge/excalidraw-github-extension-on-chrome",
          ref,
          path: "samples/how-it-works.excalidraw",
          fileName: "how-it-works.excalidraw",
          kind: "excalidraw" as const,
        });
        return chrome.runtime.sendMessage({
          type: "xgp:open",
          payload: {
            mode: "diff",
            title: "PR #1",
            pageUrl: "https://github.com/TingGeorge/excalidraw-github-extension-on-chrome/pull/1/files",
            path: "samples/how-it-works.excalidraw",
            base: { source: source("e4413ee"), content: { encoding: "text", data: baseData }, label: "main" },
            head: {
              source: source("2fa8000"),
              content: { encoding: "text", data: headData },
              label: "claude/eloquent-babbage-6mkmev",
            },
            theme: "light",
          },
        });
      },
      [base, head],
    ),
  ]);
  await viewer.setViewportSize({ width: 1400, height: 760 });
  await expect(viewer.getByTestId("xv-pane-head").locator(".excalidraw canvas").first()).toBeVisible();
  await viewer.getByRole("button", { name: "Fit to content" }).click();
  await viewer.waitForTimeout(1200);
  await viewer.screenshot({ path: join(OUT, "diff.png") });
});

test("inline dark", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await serveBlob(page, "dark");
  await page.goto(BLOB);
  await page.locator('[data-xgp="actions"]').getByRole("button", { name: "Inline" }).click();
  await expect(
    page.frameLocator('[data-xgp="inline"] iframe').locator(".excalidraw canvas").first(),
  ).toBeVisible();
  await page.waitForTimeout(1000);
  await page.locator('[data-xgp="inline"]').screenshot({ path: join(OUT, "inline-dark.png") });
});
