import { chromium, test as base, type BrowserContext, type Page, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const ROOT = join(import.meta.dirname, "../..");
/** Built extension; XGP_DIST points the tests at another build. */
export const DIST = resolve(ROOT, process.env.XGP_DIST ?? "dist");
export const FIXTURES = join(ROOT, "test/fixtures");

export function fixture(...parts: string[]): string {
  return readFileSync(join(FIXTURES, ...parts), "utf8");
}

export function fixtureBytes(...parts: string[]): Buffer {
  return readFileSync(join(FIXTURES, ...parts));
}

interface Fixtures {
  context: BrowserContext;
  extensionId: string;
  page: Page;
}

interface Options {
  /**
   * Real device pixel ratio for every frame. Unlike Playwright's emulated
   * `deviceScaleFactor`, it also applies to the out-of-process extension iframe.
   */
  screenScale: number | undefined;
  /** Hardware-accelerated canvas and compositing (via SwiftShader), as in desktop Chrome. */
  gpu: boolean;
}

export const test = base.extend<Fixtures & Options>({
  screenScale: [undefined, { option: true }],
  gpu: [false, { option: true }],
  context: async ({ locale, colorScheme, deviceScaleFactor, screenScale, gpu }, use) => {
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless: !process.env.HEADED,
      viewport: { width: 1280, height: 860 },
      locale: locale ?? "en-US",
      colorScheme: colorScheme ?? "light",
      deviceScaleFactor: deviceScaleFactor ?? 1,
      args: [
        `--disable-extensions-except=${DIST}`,
        `--load-extension=${DIST}`,
        `--lang=${locale ?? "en-US"}`,
        ...(screenScale ? [`--force-device-scale-factor=${screenScale}`] : []),
        ...(gpu
          ? [
              "--use-angle=swiftshader",
              "--enable-unsafe-swiftshader",
              "--ignore-gpu-blocklist",
              "--enable-gpu-rasterization",
            ]
          : []),
      ],
    });
    // Never talk to the real GitHub from tests; unrouted requests fail fast.
    await context.route(
      /^https:\/\/(github\.com|[a-z.]*githubusercontent\.com|github\.githubassets\.com)\//,
      (route) => route.abort("blockedbyclient"),
    );
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    worker ??= await context.waitForEvent("serviceworker", { timeout: 10_000 }).catch(() => {
      throw new Error(
        `The extension in ${DIST} did not load — check manifest.json (e.g. a CSP Chrome rejects).`,
      );
    });
    await use(new URL(worker.url()).host);
  },
  page: async ({ context }, use) => {
    const page = context.pages()[0] ?? (await context.newPage());
    await use(page);
  },
});

export const expect = test.expect;

/** Serve a fake github.com page (and the file's raw URL) from fixtures. */
export async function routeGitHub(
  context: BrowserContext,
  routes: Record<string, { body: string | Buffer; contentType: string; status?: number }>,
) {
  await context.route(
    /^https:\/\/(github\.com|gist\.github\.com|[a-z]+\.githubusercontent\.com)\//,
    async (route: Route) => {
      const url = new URL(route.request().url());
      const key = `${url.origin}${url.pathname}`;
      const hit = routes[key];
      // GitHub answers a missing raw file with its HTML 404 page.
      if (!hit)
        return route.fulfill({
          status: 404,
          contentType: "text/html; charset=utf-8",
          body: "<html>Not Found</html>",
        });
      return route.fulfill({ status: hit.status ?? 200, contentType: hit.contentType, body: hit.body });
    },
  );
}
