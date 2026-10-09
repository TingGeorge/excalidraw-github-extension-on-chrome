import { expect, test } from "./fixtures";
import { join } from "node:path";

test("viewer renders a local file", async ({ page, extensionId }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`chrome-extension://${extensionId}/viewer.html`);
  await page.locator('input[type="file"]').setInputFiles(join(import.meta.dirname, "../../samples/how-it-works.excalidraw"));
  await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "test-results/smoke-viewer.png" });
  console.log("errors:", errors);
});
