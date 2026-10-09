// "Preview diff" on pull request, commit and compare pages, and the side-by-side
// diff viewer it opens.
//
// Fixtures (see `node scripts/capture-fixtures.mjs --derive`):
//   pr-files-full.html   classic PR "Files changed" page of PR #1 with the lazily
//                        loaded files spliced in (incl. samples/how-it-works.excalidraw)
//   pr-files-diffs.html  the lazily loaded part on its own (the /diffs fragment)
//   commit-full.html     React commit page of 2fa8000 with the sample's diff added
//   how-it-works.{base,head}.excalidraw  the sample at e4413ee (v1) and 2fa8000 (v2)
import type { BrowserContext, Locator, Page } from "@playwright/test";
import { expect, fixture, routeGitHub, test } from "./fixtures";

const REPO = "https://github.com/TingGeorge/excalidraw-github-extension-on-chrome";
const BASE = "e4413eeae42e4f3853ca8ad80372e995b022509b";
const HEAD = "2fa800062b33136871c6cd109d770279c9f88b4a";
const PATH = "samples/how-it-works.excalidraw";
const PR = `${REPO}/pull/1/files`;
const COMMIT = `${REPO}/commit/${HEAD}`;
const raw = (ref: string) => `${REPO}/raw/${ref}/${PATH}`;
const v1 = fixture("github/how-it-works.base.excalidraw");
const v2 = fixture("github/how-it-works.head.excalidraw");
const html = (body: string) => ({ body, contentType: "text/html; charset=utf-8" });
const text = (body: string) => ({ body, contentType: "text/plain; charset=utf-8" });

const BUTTON = '[data-xgp="diff-button"]';
const NON_EXCALIDRAW_PR_FILES = [".gitignore", "playwright.config.ts", "static/icons/icon.svg"];

// Colours drawn on the canvas (light theme). Highlights (src/viewer/highlights.ts) are
// translucent fills behind the changed element, visible in the 10px padding around it:
// #2da44e26, #d4a72c2e, #cf222e1f blended over the white background.
type RGB = [number, number, number];
const ADDED_FILL: RGB = [224, 241, 229];
const MODIFIED_FILL: RGB = [247, 239, 217];
const REMOVED_FILL: RGB = [249, 228, 230];
const GITHUB_BOX: RGB = [0xa5, 0xd8, 0xff]; // "GitHub .excalidraw file", unchanged in v1 → v2
const PR_DIFF_BOX: RGB = [0xff, 0xc9, 0xc9]; // "PR diff (side by side)", added in v2
const VIEWER_BOX: Record<"base" | "head", RGB> = { base: [0xff, 0xec, 0x99], head: [0xff, 0xd8, 0xa8] }; // recoloured

// --- Expected diff, computed straight from the two versions of the sample -----------

interface El {
  id: string;
  type: string;
  isDeleted?: boolean;
  containerId?: string | null;
  text?: string;
  startBinding?: { elementId: string } | null;
  endBinding?: { elementId: string } | null;
  [key: string]: unknown;
}
const BOOKKEEPING = new Set(["version", "versionNonce", "updated", "seed", "index", "boundElements"]);

function expectedDiff() {
  const live = (json: string) =>
    new Map(
      (JSON.parse(json) as { elements: El[] }).elements.filter((e) => !e.isDeleted).map((e) => [e.id, e]),
    );
  const before = live(v1);
  const after = live(v2);
  const visual = (e: El | undefined) =>
    e &&
    JSON.stringify(
      Object.entries(e)
        .filter(([k]) => !BOOKKEEPING.has(k))
        .sort(([a], [b]) => a.localeCompare(b)),
    );
  const boundText = (all: Map<string, El>, id: string) =>
    [...all.values()].find((t) => t.type === "text" && t.containerId === id);
  const ownText = (e: El | undefined, all: Map<string, El>) =>
    e ? (e.text ?? boundText(all, e.id)?.text ?? "") : "";
  const labelOf = (e: El, all: Map<string, El>) => {
    let words = ownText(e, all).replace(/\s+/g, " ").trim();
    // Unlabelled arrows are described by what they connect (first line of each end's text).
    if (!words && e.type === "arrow") {
      const end = (id?: string) => {
        const target = id ? all.get(id) : undefined;
        return target ? ownText(target, all).trim().split("\n")[0]!.trim() || target.type : "…";
      };
      words = `${end(e.startBinding?.elementId)} → ${end(e.endBinding?.elementId)}`;
    }
    return words ? `${e.type} “${words}”` : e.type;
  };
  // Text bound to a container is reported through its container.
  const top = (all: Map<string, El>) =>
    [...all.values()].filter((e) => !(e.type === "text" && e.containerId));

  const added = top(after).filter((e) => !before.has(e.id));
  const removed = top(before).filter((e) => !after.has(e.id));
  const modified = top(after).filter(
    (e) =>
      before.has(e.id) &&
      (visual(e) !== visual(before.get(e.id)) ||
        visual(boundText(after, e.id)) !== visual(boundText(before, e.id))),
  );
  return {
    added: added.length,
    modified: modified.length,
    removed: removed.length,
    entries: [
      ...added.map((e) => [labelOf(e, after), "added"]),
      ...modified.map((e) => [labelOf(e, after), "modified"]),
      ...removed.map((e) => [labelOf(e, before), "removed"]),
    ],
  };
}

// --- Helpers -------------------------------------------------------------------------------

/** Serve a GitHub page plus the raw sample at the given refs; returns the raw URLs fetched. */
async function routeDiff(
  context: BrowserContext,
  page: { url: string; body: string },
  refs: Record<string, string>,
) {
  const routes: Parameters<typeof routeGitHub>[1] = { [page.url]: html(page.body) };
  for (const [ref, body] of Object.entries(refs)) routes[raw(ref)] = text(body);
  await routeGitHub(context, routes);
  const requested: string[] = [];
  context.on("request", (r) => {
    if (r.url().includes("/raw/")) requested.push(r.url());
  });
  return requested;
}

const errorsOf = new WeakMap<Page, string[]>();
const pageErrors = (viewer: Page) => errorsOf.get(viewer) ?? [];

/** Click a Preview diff button and return the viewer tab once its canvases are up. */
async function openViewer(
  context: BrowserContext,
  button: Locator,
  panes: Array<"base" | "head"> = ["base", "head"],
) {
  const [viewer] = await Promise.all([context.waitForEvent("page"), button.click()]);
  const errors: string[] = [];
  errorsOf.set(viewer, errors);
  viewer.on("pageerror", (e) => errors.push(e.message));
  await viewer.waitForLoadState();
  for (const side of panes) {
    await expect(viewer.locator(`[data-testid="xv-pane-${side}"] canvas.static`)).toBeVisible();
  }
  return viewer;
}

/** Pixels of one colour on a pane's canvas: count and bounding box (canvas pixels). */
async function colourStats(viewer: Page, side: "base" | "head", rgb: RGB, tolerance = 3) {
  return viewer.locator(`[data-testid="xv-pane-${side}"] canvas.static`).evaluate(
    (canvas: HTMLCanvasElement, [rgb, tol]) => {
      const { data, width } = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
      let n = 0;
      let [x1, y1, x2, y2] = [Infinity, Infinity, -Infinity, -Infinity];
      for (let i = 0; i < data.length; i += 4) {
        if (
          Math.abs(data[i]! - rgb[0]) <= tol &&
          Math.abs(data[i + 1]! - rgb[1]) <= tol &&
          Math.abs(data[i + 2]! - rgb[2]) <= tol &&
          data[i + 3]! > 200
        ) {
          const x = (i / 4) % width;
          const y = Math.floor(i / 4 / width);
          n++;
          [x1, y1, x2, y2] = [Math.min(x1, x), Math.min(y1, y), Math.max(x2, x), Math.max(y2, y)];
        }
      }
      return n
        ? { n, x: (x1 + x2) / 2, y: (y1 + y2) / 2, w: x2 - x1, h: y2 - y1 }
        : { n, x: 0, y: 0, w: 0, h: 0 };
    },
    [rgb, tolerance] as const,
  );
}

/** Where (and how big) the unchanged "GitHub" box is drawn in a pane. */
const githubBox = (viewer: Page, side: "base" | "head") => colourStats(viewer, side, GITHUB_BOX);

/** Both panes show the same viewport: a reference element sits at the same place in each. */
async function expectPanesAligned(
  viewer: Page,
  colours: Record<"base" | "head", RGB> = { base: GITHUB_BOX, head: GITHUB_BOX },
) {
  await expect
    .poll(async () => {
      const [b, h] = await Promise.all([
        colourStats(viewer, "base", colours.base),
        colourStats(viewer, "head", colours.head),
      ]);
      return b.n > 0 && Math.abs(b.x - h.x) <= 1 && Math.abs(b.y - h.y) <= 1 && Math.abs(b.w - h.w) <= 1;
    })
    .toBe(true);
}

async function screenshot(viewer: Page, name: string) {
  await viewer.waitForTimeout(400); // let Excalidraw finish its throttled render
  await viewer.screenshot({ path: `${test.info().project.outputDir}/${name}.png` });
}

async function checkViewer(viewer: Page, context: string) {
  const expected = expectedDiff();
  // The sample: v2 adds the "Inline preview" and "PR diff" boxes and arrows a3/a4 and
  // recolours "Viewer tab"; nothing is removed.
  expect([expected.added, expected.modified, expected.removed]).toEqual([4, 1, 0]);

  await expect(viewer.locator(".xv-title__name")).toHaveText("how-it-works.excalidraw");
  await expect(viewer.locator(".xv-title__context")).toContainText(context);
  await expect(viewer.locator(".xv-diffstat__added")).toHaveText(`+${expected.added}`);
  await expect(viewer.locator(".xv-diffstat__modified")).toHaveText(`~${expected.modified}`);
  await expect(viewer.locator(".xv-diffstat__removed")).toHaveText(`−${expected.removed}`);
  await expect(viewer.locator('[data-testid="xv-pane-base"] .xv-pane__label strong')).toHaveText("Before");
  await expect(viewer.locator('[data-testid="xv-pane-head"] .xv-pane__label strong')).toHaveText("After");

  const changes = viewer.locator(".xv-changes li");
  await expect(changes).toHaveCount(expected.entries.length);
  const shown = await changes.evaluateAll((items) =>
    items.map((li) => [
      li.querySelector("button")?.getAttribute("title") ?? "",
      (li.querySelector(".xv-changes__meta")?.textContent ?? "").split("·").pop()!.trim(),
    ]),
  );
  expect(shown).toEqual(expected.entries);
  expect(pageErrors(viewer)).toEqual([]);
}

// --- Classic PR "Files changed" page ---------------------------------------------------

test.describe("pull request files page (classic diff view)", () => {
  test("adds one Preview diff button, only on the Excalidraw file", async ({ page, context }) => {
    await routeDiff(context, { url: PR, body: fixture("github/pr-files-full.html") }, {});
    await page.goto(PR);
    const file = page.locator(`.file[data-tagsearch-path="${PATH}"]`);
    await expect(file.locator(BUTTON)).toHaveCount(1);
    await expect(page.locator(BUTTON)).toHaveCount(1);
    for (const other of NON_EXCALIDRAW_PR_FILES) {
      await expect(page.locator(`.file[data-tagsearch-path="${other}"]`)).toHaveCount(1);
      await expect(page.locator(`.file[data-tagsearch-path="${other}"] ${BUTTON}`)).toHaveCount(0);
    }
    // In the header's action group, before GitHub's "…" menu.
    const placement = await file.locator(BUTTON).evaluate((btn) => ({
      inActions: btn.parentElement?.matches(".file-actions > .d-flex") ?? false,
      next: btn.nextElementSibling?.matches("details.js-file-header-dropdown") ?? false,
    }));
    expect(placement).toEqual({ inActions: true, next: true });
    await expect(file.locator(BUTTON)).toHaveText("Preview diff");
    await file
      .locator(".file-header")
      .screenshot({ path: `${test.info().project.outputDir}/pr-file-header.png` });
  });

  test("opens both versions side by side with diffstat, change list and highlights", async ({
    page,
    context,
  }) => {
    const requested = await routeDiff(
      context,
      { url: PR, body: fixture("github/pr-files-full.html") },
      { [BASE]: v1, [HEAD]: v2 },
    );
    await page.goto(PR);
    const viewer = await openViewer(context, page.locator(BUTTON));
    expect(new URL(viewer.url()).pathname).toBe("/viewer.html");
    expect(requested).toEqual(expect.arrayContaining([raw(BASE), raw(HEAD)]));
    await checkViewer(viewer, "PR #1 · main (e4413ee) → claude/eloquent-babbage-6mkmev (2fa8000)");
    await expect(viewer).toHaveTitle("how-it-works.excalidraw (PR #1) · Excalidraw Preview");

    // Highlights: green (added) boxes only in the new version, amber (modified) in both.
    const highlight = viewer.getByRole("button", { name: "Highlight changes" });
    const marks = async (side: "base" | "head") => ({
      added: (await colourStats(viewer, side, ADDED_FILL)).n,
      modified: (await colourStats(viewer, side, MODIFIED_FILL)).n,
      removed: (await colourStats(viewer, side, REMOVED_FILL)).n,
    });
    await expect(highlight).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => (await marks("head")).added).toBeGreaterThan(1000);
    expect((await marks("head")).modified).toBeGreaterThan(400);
    expect(await marks("base")).toEqual({ added: 0, modified: expect.any(Number), removed: 0 });
    expect((await marks("base")).modified).toBeGreaterThan(400);
    await screenshot(viewer, "diff-viewer-light");

    await highlight.click();
    await expect(highlight).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => marks("head")).toEqual({ added: 0, modified: 0, removed: 0 });
    await expect.poll(() => marks("base")).toEqual({ added: 0, modified: 0, removed: 0 });
    await screenshot(viewer, "diff-viewer-no-highlights");
    await highlight.click();
    await expect(highlight).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => (await marks("head")).added).toBeGreaterThan(1000);

    // Change list toggles.
    const list = viewer.getByRole("button", { name: "Changes", exact: true });
    await expect(list).toHaveAttribute("aria-pressed", "true");
    await list.click();
    await expect(viewer.locator(".xv-changes")).toHaveCount(0);
    await list.click();
    await expect(viewer.locator(".xv-changes")).toBeVisible();

    // Dark theme.
    await viewer.getByRole("button", { name: "Switch to dark theme" }).click();
    await expect(viewer.locator('[data-testid="xv-pane-head"] .excalidraw.theme--dark')).toBeVisible();
    await expect(viewer.getByRole("button", { name: "Switch to light theme" })).toBeVisible();
    await screenshot(viewer, "diff-viewer-dark");
    expect(pageErrors(viewer)).toEqual([]);
  });

  test("files loaded later through the progressive include-fragment get a button", async ({
    page,
    context,
  }) => {
    // The captured page as GitHub serves it: only .gitignore, the rest behind
    // <include-fragment src="/…/diffs?…">. Serve that fragment and load it the way
    // GitHub's include-fragment element does (its JS is not part of the fixture).
    const prPage = fixture("github/pr-files.html");
    const loader = /<include-fragment[^>]*diff-progressive-loader[^>]*>/.exec(prPage)![0];
    const fragmentUrl = new URL(/src="([^"]+)"/.exec(loader)![1]!.replace(/&amp;/g, "&"), REPO).toString();
    await routeDiff(context, { url: PR, body: prPage }, { [BASE]: v1, [HEAD]: v2 });
    await context.route(
      (url) => url.toString() === fragmentUrl,
      (route) => route.fulfill(html(fixture("github/pr-files-diffs.html"))),
    );
    await page.goto(PR);
    await expect(page.locator(".file[data-tagsearch-path]")).toHaveCount(1);
    await page.waitForTimeout(300);
    await expect(page.locator(BUTTON)).toHaveCount(0);

    await page.evaluate(async () => {
      const el = document.querySelector<HTMLElement>("include-fragment.diff-progressive-loader")!;
      const res = await fetch(el.getAttribute("src")!);
      el.parentElement!.outerHTML = await res.text();
    });
    await expect(page.locator(".file[data-tagsearch-path]")).toHaveCount(4);
    await expect(page.locator(`.file[data-tagsearch-path="${PATH}"] ${BUTTON}`)).toHaveCount(1);
    await expect(page.locator(BUTTON)).toHaveCount(1);
    // The SHAs were also in the include-fragment, which is gone now: the range must still resolve.
    const viewer = await openViewer(context, page.locator(BUTTON));
    await checkViewer(viewer, "main (e4413ee) → claude/eloquent-babbage-6mkmev (2fa8000)");
  });

  test("is not duplicated by DOM mutations and comes back after GitHub re-renders", async ({
    page,
    context,
  }) => {
    await routeDiff(context, { url: PR, body: fixture("github/pr-files-full.html") }, {});
    await page.goto(PR);
    const buttons = page.locator(BUTTON);
    await expect(buttons).toHaveCount(1);

    // Unrelated mutations all over the page re-run the content script.
    await page.evaluate(async () => {
      for (let i = 0; i < 20; i++) {
        document.body.append(Object.assign(document.createElement("div"), { textContent: `noise ${i}` }));
        for (const header of document.querySelectorAll(".file-header")) {
          header.append(document.createElement("span"));
        }
        await new Promise(requestAnimationFrame);
      }
    });
    await page.waitForTimeout(200);
    await expect(buttons).toHaveCount(1);

    // GitHub re-renders the header's actions: our button is dropped and must be re-added once.
    await page.evaluate((path) => {
      const actions = document.querySelector(`.file[data-tagsearch-path="${path}"] .file-actions`)!;
      const fresh = actions.cloneNode(true) as HTMLElement;
      fresh.querySelector('[data-xgp="diff-button"]')?.remove();
      actions.replaceWith(fresh);
    }, PATH);
    await expect(page.locator(`.file[data-tagsearch-path="${PATH}"] .file-actions ${BUTTON}`)).toHaveCount(1);
    await page.waitForTimeout(200);
    await expect(buttons).toHaveCount(1);

    // The same file container inserted again (e.g. the progressive loader retried).
    await page.evaluate((path) => {
      const file = document.querySelector(`.file[data-tagsearch-path="${path}"]`)!;
      const copy = file.cloneNode(true) as HTMLElement;
      copy.querySelector('[data-xgp="diff-button"]')?.remove();
      file.replaceWith(copy);
    }, PATH);
    await page.waitForTimeout(200);
    await expect(buttons).toHaveCount(1);
  });

  test("added file: base is missing, shows “File added” and no crash", async ({ page, context }) => {
    // Only the head version exists; the base raw URL answers 404.
    await routeDiff(context, { url: PR, body: fixture("github/pr-files-full.html") }, { [HEAD]: v2 });
    await page.goto(PR);
    const viewer = await openViewer(context, page.locator(BUTTON), ["head"]);
    const base = viewer.locator('[data-testid="xv-pane-base"]');
    await expect(base.locator(".xv-chip")).toHaveText("File added in this change");
    await expect(base).toContainText("This file does not exist in this version.");
    await expect(base.locator(".excalidraw")).toHaveCount(0);
    await expect(viewer.locator('[data-testid="xv-pane-head"] .xv-chip')).toHaveCount(0);
    await expect(viewer.getByRole("button", { name: "Highlight changes" })).toBeDisabled();
    // Everything in the new file counts as added, and the change list lets you jump around it.
    await expect(viewer.locator(".xv-diffstat__added")).toHaveText(new RegExp(`^\\+\\d+$`));
    await expect(viewer.locator(".xv-diffstat__modified")).toHaveText("~0");
    await expect(viewer.locator(".xv-diffstat__removed")).toHaveText("−0");
    await expect(viewer.locator(".xv-changes__meta").first()).toContainText("added");
    await expect.poll(async () => (await githubBox(viewer, "head")).n).toBeGreaterThan(500);
    await screenshot(viewer, "diff-viewer-added");
    expect(pageErrors(viewer)).toEqual([]);
  });

  test("deleted file: head is not fetched, shows “File deleted”", async ({ page, context }) => {
    const body = fixture("github/pr-files-full.html").replace(
      new RegExp(`(data-file-deleted=")false("\\s+data-tagsearch-path="${PATH}")`),
      "$1true$2",
    );
    expect(body).toContain(`data-file-deleted="true"`);
    const requested = await routeDiff(context, { url: PR, body }, { [BASE]: v1 });
    await page.goto(PR);
    const viewer = await openViewer(context, page.locator(BUTTON), ["base"]);
    await expect(viewer.locator('[data-testid="xv-pane-head"] .xv-chip')).toHaveText(
      "File deleted in this change",
    );
    expect(requested.filter((u) => u.includes(HEAD))).toEqual([]);
    expect(pageErrors(viewer)).toEqual([]);
  });
});

// --- React commit page ----------------------------------------------------------------------

test("commit page (React diff view): compares the commit with its parent (~1)", async ({ page, context }) => {
  const requested = await routeDiff(
    context,
    { url: COMMIT, body: fixture("github/commit-full.html") },
    { [`${HEAD}~1`]: v1, [HEAD]: v2 },
  );
  await page.goto(COMMIT);
  const headers = page.locator('[class*="DiffFileHeader-module__diff-file-header"]');
  await expect(headers).toHaveCount(2);
  const sample = headers.filter({ has: page.locator("h3", { hasText: PATH }) });
  const gitignore = headers.filter({ has: page.locator("h3", { hasText: ".gitignore" }) });
  await expect(sample.locator(BUTTON)).toHaveCount(1);
  await expect(gitignore.locator(BUTTON)).toHaveCount(0);
  await expect(page.locator(BUTTON)).toHaveCount(1);
  // Before GitHub's "More options" button.
  expect(
    await sample.locator(BUTTON).evaluate((btn) => btn.nextElementSibling?.getAttribute("aria-label")),
  ).toBe("More options");
  await sample.screenshot({ path: `${test.info().project.outputDir}/commit-file-header.png` });

  const viewer = await openViewer(context, sample.locator(BUTTON));
  // `~` is not percent-encoded in the raw URL.
  expect(requested).toEqual(expect.arrayContaining([raw(`${HEAD}~1`), raw(HEAD)]));
  await checkViewer(viewer, "Commit 2fa8000 · 2fa8000~1 → 2fa8000");
  await screenshot(viewer, "diff-viewer-commit");
});

// --- Sync views -------------------------------------------------------------------------------

test("Sync views: panning and zooming one pane moves the other", async ({ page, context }) => {
  await routeDiff(
    context,
    { url: PR, body: fixture("github/pr-files-full.html") },
    { [BASE]: v1, [HEAD]: v2 },
  );
  await page.goto(PR);
  const viewer = await openViewer(context, page.locator(BUTTON));
  await expectPanesAligned(viewer);

  const centre = async (side: "base" | "head") => {
    const box = (await viewer.locator(`[data-testid="xv-pane-${side}"] .xv-pane__canvas`).boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const moved = async (side: "base" | "head", from: { x: number; y: number; h: number }) => {
    const now = await githubBox(viewer, side);
    return Math.abs(now.x - from.x) > 20 || Math.abs(now.y - from.y) > 20 || Math.abs(now.h - from.h) > 5;
  };

  // Pan the left pane with the wheel: the right pane follows.
  const start = await githubBox(viewer, "head");
  const bc = await centre("base");
  await viewer.mouse.move(bc.x, bc.y);
  await viewer.mouse.wheel(0, 120);
  await expect.poll(() => moved("base", start)).toBe(true);
  await expectPanesAligned(viewer);
  expect(await moved("head", start)).toBe(true);

  // Zoom the right pane out (ctrl + wheel): the left pane follows.
  const beforeZoom = await githubBox(viewer, "base");
  const hc = await centre("head");
  await viewer.mouse.move(hc.x, hc.y);
  await viewer.keyboard.down("Control");
  await viewer.mouse.wheel(0, 200);
  await viewer.keyboard.up("Control");
  await expect.poll(async () => (await githubBox(viewer, "head")).h).toBeLessThan(beforeZoom.h - 5);
  await expectPanesAligned(viewer);

  // Sync off: panning one pane leaves the other alone.
  const syncButton = viewer.getByRole("button", { name: "Sync views" });
  await syncButton.click();
  await expect(syncButton).toHaveAttribute("aria-pressed", "false");
  const frozen = await githubBox(viewer, "head");
  await viewer.mouse.move(bc.x, bc.y);
  await viewer.mouse.wheel(0, -150);
  await expect.poll(async () => moved("base", frozen)).toBe(true);
  await viewer.waitForTimeout(300);
  expect(await githubBox(viewer, "head"), JSON.stringify(frozen)).toEqual(
    expect.objectContaining({ x: frozen.x, y: frozen.y, h: frozen.h }),
  );

  // "Fit to content" brings both panes back in line.
  await viewer.getByRole("button", { name: "Fit to content" }).click();
  await expectPanesAligned(viewer);

  // Sync on again; clicking a change zooms to it, and the other pane follows.
  await syncButton.click();
  await expect(syncButton).toHaveAttribute("aria-pressed", "true");
  await viewer
    .locator(".xv-changes li")
    .filter({ has: viewer.locator(".xv-changes__label", { hasText: /^PR diff/ }) })
    .getByRole("button")
    .click();
  await expect
    .poll(async () => {
      const box = await colourStats(viewer, "head", PR_DIFF_BOX);
      const canvas = (await viewer.locator('[data-testid="xv-pane-head"] canvas.static').boundingBox())!;
      return box.n > 0 && Math.abs(box.x - canvas.width / 2) < 40 && box.w > 150;
    })
    .toBe(true);
  // The "GitHub" box is off screen now; "Viewer tab" (recoloured in v2) is in view in both.
  await expectPanesAligned(viewer, VIEWER_BOX);
  await screenshot(viewer, "diff-viewer-focused-change");
  expect(pageErrors(viewer)).toEqual([]);
});

// --- Layout at a narrower window --------------------------------------------------------------

test("diffstat stays visible in the header at a narrower window", async ({ page, context }) => {
  await routeDiff(
    context,
    { url: PR, body: fixture("github/pr-files-full.html") },
    { [BASE]: v1, [HEAD]: v2 },
  );
  await page.goto(PR);
  const viewer = await openViewer(context, page.locator(BUTTON));
  await viewer.setViewportSize({ width: 1000, height: 700 });
  await expectPanesAligned(viewer);
  await screenshot(viewer, "diff-viewer-1000px");
  // The diffstat is the most useful bit of the header: it must not be cut off.
  const clipped = await viewer.locator(".xv-diffstat").evaluate((el) => {
    const box = el.getBoundingClientRect();
    let node = el.parentElement;
    while (node && node !== document.body) {
      const style = getComputedStyle(node);
      if (style.overflow !== "visible" && box.right > node.getBoundingClientRect().right + 1) {
        return `${node.className}: diffstat ends at ${box.right}, clipped at ${node.getBoundingClientRect().right}`;
      }
      node = node.parentElement;
    }
    return null;
  });
  expect(clipped).toBeNull();
});
