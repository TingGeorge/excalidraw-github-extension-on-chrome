import { expect, fixture, routeGitHub, test } from "./fixtures";

const REPO = "https://github.com/TingGeorge/excalidraw-github-extension-on-chrome";
const BLOB = `${REPO}/blob/main/samples/how-it-works.excalidraw`;
const RAW = `${REPO}/raw/refs/heads/main/samples/how-it-works.excalidraw`;

test("options page saves settings", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(page.getByRole("heading", { name: "Excalidraw Preview for GitHub" })).toBeVisible();
  const auto = page.getByLabel("Show the inline preview automatically when opening a diagram");
  await expect(auto).not.toBeChecked();
  await auto.check();
  await expect(page.locator(".opt-status")).toHaveText("Saved");
  await page.getByText("Dark", { exact: true }).click();
  await page.reload();
  await expect(page.getByLabel("Show the inline preview automatically when opening a diagram")).toBeChecked();
  await expect(page.getByLabel("Dark", { exact: true })).toBeChecked();
  await page.screenshot({ path: "test-results/options.png", fullPage: true });
});

test("popup renders compact settings", async ({ page, extensionId }) => {
  await page.setViewportSize({ width: 360, height: 520 });
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.getByRole("button", { name: "Open a local file…" })).toBeVisible();
  await expect(page.getByRole("button", { name: "All settings" })).toBeVisible();
  await page.screenshot({ path: "test-results/popup.png" });
});

test("auto inline setting renders the diagram when the file opens", async ({
  page,
  context,
  extensionId,
}) => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.getByLabel("Show the inline preview automatically when opening a diagram").check();
  await expect(options.locator(".opt-status")).toHaveText("Saved");
  await options.close();

  await routeGitHub(context, {
    [BLOB]: { body: fixture("github/blob-excalidraw.html"), contentType: "text/html" },
    [RAW]: { body: fixture("../../samples/how-it-works.excalidraw"), contentType: "text/plain" },
  });
  await page.goto(BLOB);
  await expect(
    page.frameLocator('[data-xgp="inline"] iframe').locator(".excalidraw canvas").first(),
  ).toBeVisible();
  await expect(page.locator('[data-xgp="actions"] [data-xgp-action="inline"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("diff buttons setting is stored in sync storage", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  const diff = page.getByLabel("Add “Preview diff” buttons on pull request, commit and compare pages");
  await expect(diff).toBeChecked();
  await diff.uncheck();
  await expect(page.locator(".opt-status")).toHaveText("Saved");
  const stored = await page.evaluate(() => chrome.storage.sync.get(null));
  expect(stored.diffButtons).toBe(false);
});
