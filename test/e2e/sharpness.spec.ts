/**
 * The diagram must stay sharp: in the inline preview on GitHub, after zooming, after
 * "Fit to content", and after the page zoom (devicePixelRatio) changes.
 *
 * Excalidraw paints each element from a cached bitmap. Two things made those
 * copies blurry: blitting them at fractional device pixels (on GPU canvases a
 * half-pixel copy smears rows), and reusing bitmaps rendered for another zoom or
 * pixel density. The tests record every crisp blit Excalidraw makes on its
 * canvas (an init script wraps drawImage before the viewer's own code runs) and
 * compare the canvas with a full repaint.
 */
import type { BrowserContext, Frame, Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, fixture, ROOT, routeGitHub, test } from "./fixtures";

const REPO = "https://github.com/TingGeorge/excalidraw-github-extension-on-chrome";
const BLOB = `${REPO}/blob/main/samples/how-it-works.excalidraw`;
const RAW = `${REPO}/raw/refs/heads/main/samples/how-it-works.excalidraw`;
const SAMPLE = readFileSync(join(ROOT, "samples/how-it-works.excalidraw"), "utf8");

interface Scene {
  elements: Array<Record<string, unknown> & { x: number; y: number; width: number; height: number }>;
}

/** The sample, scaled and shifted so it needs a fractional zoom and has fractional coordinates. */
function scaledSample(factor: number): string {
  const scene = JSON.parse(SAMPLE) as Scene;
  for (const el of scene.elements) {
    el.x = el.x * factor + 0.37;
    el.y = el.y * factor + 0.61;
    el.width *= factor;
    el.height *= factor;
    if (Array.isArray(el.points))
      el.points = (el.points as number[][]).map(([x, y]) => [x! * factor, y! * factor]);
    if (typeof el.fontSize === "number") el.fontSize *= factor;
  }
  return JSON.stringify(scene);
}

/** Records the device position of every non-smoothed canvas-to-canvas copy on Excalidraw's canvases. */
function recordBlits(context: BrowserContext) {
  return context.addInitScript(() => {
    if (!location.protocol.startsWith("chrome-extension")) return;
    const native = CanvasRenderingContext2D.prototype.drawImage;
    const blits: Array<[number, number]> = [];
    (window as unknown as { __blits: typeof blits }).__blits = blits;
    CanvasRenderingContext2D.prototype.drawImage = function (
      this: CanvasRenderingContext2D,
      ...args: unknown[]
    ) {
      if (
        !this.imageSmoothingEnabled &&
        args[0] instanceof HTMLCanvasElement &&
        this.canvas instanceof HTMLCanvasElement &&
        this.canvas.classList.contains("excalidraw__canvas")
      ) {
        const t = this.getTransform();
        const [dx, dy] = (args.length === 9 ? [args[5], args[6]] : [args[1], args[2]]) as [number, number];
        blits.push([t.a * dx + t.c * dy + t.e, t.b * dx + t.d * dy + t.f]);
      }
      return (native as (...a: unknown[]) => void).apply(this, args);
    } as typeof native;
  });
}

type Target = Page | Frame;

/** Blits recorded since the last call, as [x, y] device positions. */
async function takeBlits(target: Target): Promise<Array<[number, number]>> {
  return target.evaluate(() => {
    const blits = (window as unknown as { __blits: Array<[number, number]> }).__blits;
    return blits.splice(0, blits.length);
  });
}

function offGrid(blits: Array<[number, number]>) {
  return blits.filter(([x, y]) => Math.abs(x - Math.round(x)) > 1e-6 || Math.abs(y - Math.round(y)) > 1e-6);
}

/** A digest of the static canvas pixels (and its size). */
async function canvasDigest(target: Target, selector = "canvas.excalidraw__canvas.static"): Promise<string> {
  return target.evaluate((sel) => {
    const canvas = document.querySelector<HTMLCanvasElement>(sel)!;
    const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    let h = 2166136261;
    for (let i = 0; i < data.length; i += 1) h = Math.imul(h ^ data[i]!, 16777619);
    return `${canvas.width}x${canvas.height}:${(h >>> 0).toString(16)}`;
  }, selector);
}

async function openInline(page: Page, body: string) {
  await routeGitHub(page.context(), {
    [BLOB]: { body: fixture("github/blob-excalidraw.html"), contentType: "text/html" },
    [RAW]: { body, contentType: "text/plain" },
  });
  await page.goto(BLOB);
  await page.locator('[data-xgp="actions"]').getByRole("button", { name: "Inline" }).click();
  const iframe = page.locator('[data-xgp="inline"] iframe');
  await iframe.scrollIntoViewIfNeeded();
  await expect(
    page.frameLocator('[data-xgp="inline"] iframe').locator(".excalidraw canvas").first(),
  ).toBeVisible();
  const frame = (await (await iframe.elementHandle())!.contentFrame())!;
  // Fonts loaded and the first fit applied.
  await frame.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  return { iframe, frame };
}

/** Theme there and back: Excalidraw re-renders every element's bitmap from scratch. */
async function fullRepaint(frame: Frame) {
  await frame.getByRole("button", { name: "Switch to dark theme" }).click();
  await frame.getByRole("button", { name: "Switch to light theme" }).click();
  await frame.waitForTimeout(400);
}

async function ctrlWheel(page: Page, x: number, y: number, deltaY: number, steps = 4) {
  await page.mouse.move(x, y);
  await page.keyboard.down("Control");
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, deltaY);
    await page.waitForTimeout(30);
  }
  await page.keyboard.up("Control");
}

for (const setup of [
  { name: "standard display", options: {} },
  { name: "Retina display with GPU canvas", options: { screenScale: 2, gpu: true } },
]) {
  test.describe(setup.name, () => {
    test.use(setup.options);

    test("inline preview draws on whole device pixels after load, zoom and Fit", async ({
      page,
      context,
    }) => {
      await recordBlits(context);
      const { iframe, frame } = await openInline(page, scaledSample(2.37));
      const afterLoad = await takeBlits(frame);
      expect(afterLoad.length).toBeGreaterThan(10);
      expect(offGrid(afterLoad)).toEqual([]);
      const fitted = await canvasDigest(frame);

      // Pinch / Ctrl+wheel zoom, then let Excalidraw re-render at the new zoom.
      const box = (await iframe.boundingBox())!;
      await ctrlWheel(page, box.x + box.width / 2, box.y + box.height / 2, -60);
      await page.waitForTimeout(700);
      expect(await canvasDigest(frame)).not.toBe(fitted);
      expect(offGrid(await takeBlits(frame))).toEqual([]);

      // "Fit to content" jumps straight back to the identical, sharp first view —
      // no animation through stretched bitmaps.
      await frame.getByRole("button", { name: "Fit to content" }).click();
      // (Excalidraw's animated fit took 500 ms through stretched bitmaps.)
      await expect.poll(() => canvasDigest(frame), { timeout: 350, intervals: [50] }).toBe(fitted);
      expect(offGrid(await takeBlits(frame))).toEqual([]);
      await page.waitForTimeout(600);
      expect(await canvasDigest(frame)).toBe(fitted);
      // Same pixels as a from-scratch repaint of the same view.
      await fullRepaint(frame);
      expect(await canvasDigest(frame)).toBe(fitted);
    });
  });
}

test("changing the page zoom repaints the inline preview at the new pixel density", async ({
  page,
  context,
  extensionId,
}) => {
  void extensionId;
  // At 100% the sample fits at the maximum zoom, so a page zoom does not change
  // Excalidraw's zoom — only the pixel density.
  const { frame } = await openInline(page, SAMPLE);
  const zoomTab = async (factor: number) => {
    const [worker] = context.serviceWorkers();
    await worker!.evaluate(async (z) => {
      const [tab] = await chrome.tabs.query({ url: "https://github.com/*" });
      await chrome.tabs.setZoom(tab!.id!, z);
    }, factor);
  };
  for (const factor of [1.25, 0.9]) {
    await zoomTab(factor);
    await expect.poll(() => frame.evaluate(() => devicePixelRatio)).toBeCloseTo(factor, 2);
    await page.waitForTimeout(600);
    const size = await frame.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>("canvas.excalidraw__canvas.static")!;
      return { backing: c.width, css: c.getBoundingClientRect().width * devicePixelRatio };
    });
    expect(Math.abs(size.backing - size.css)).toBeLessThanOrEqual(1);
    const shown = await canvasDigest(frame);
    await fullRepaint(frame);
    expect(await canvasDigest(frame), `page zoom ${factor}`).toBe(shown);
  }
});

test("diff viewer draws both panes on whole device pixels after fit, zoom and jumping to a change", async ({
  page,
  context,
}) => {
  const BASE = "e4413eeae42e4f3853ca8ad80372e995b022509b";
  const HEAD = "2fa800062b33136871c6cd109d770279c9f88b4a";
  const PATH = "samples/how-it-works.excalidraw";
  const PR = `${REPO}/pull/1/files`;
  await recordBlits(context);
  await routeGitHub(context, {
    [PR]: { body: fixture("github/pr-files-full.html"), contentType: "text/html" },
    [`${REPO}/raw/${BASE}/${PATH}`]: {
      body: fixture("github/how-it-works.base.excalidraw"),
      contentType: "text/plain",
    },
    [`${REPO}/raw/${HEAD}/${PATH}`]: {
      body: fixture("github/how-it-works.head.excalidraw"),
      contentType: "text/plain",
    },
  });
  await page.goto(PR);
  const [viewer] = await Promise.all([
    context.waitForEvent("page"),
    page.locator(`[data-xgp="diff-button"][data-xgp-path="${PATH}"]`).click(),
  ]);
  await expect(viewer.locator('[data-testid="xv-pane-head"] canvas.static')).toBeVisible();
  await viewer.evaluate(() => document.fonts.ready);
  await viewer.waitForTimeout(600);
  const pane = (side: string) => `[data-testid="xv-pane-${side}"] canvas.excalidraw__canvas.static`;
  const fitted = [await canvasDigest(viewer, pane("base")), await canvasDigest(viewer, pane("head"))];
  expect((await takeBlits(viewer)).length).toBeGreaterThan(10);

  const steps: Array<[string, () => Promise<unknown>]> = [
    ["zoom in", () => viewer.locator(".xv-zoom").getByRole("button", { name: "Zoom in" }).click()],
    ["zoom out", () => viewer.locator(".xv-zoom").getByRole("button", { name: "Zoom out" }).click()],
    ["jump to a change", () => viewer.locator(".xv-changes li button").first().click()],
    ["fit", () => viewer.getByRole("button", { name: "Fit to content" }).click()],
  ];
  for (const [name, step] of steps) {
    await step();
    await viewer.waitForTimeout(300);
    const blits = await takeBlits(viewer);
    expect(blits.length, name).toBeGreaterThan(0);
    expect(offGrid(blits), name).toEqual([]);
  }
  // Fit is the same view as the first one, pixel for pixel.
  expect([await canvasDigest(viewer, pane("base")), await canvasDigest(viewer, pane("head"))]).toEqual(
    fitted,
  );
});
