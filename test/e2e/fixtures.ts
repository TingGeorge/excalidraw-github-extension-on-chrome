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

export const test = base.extend<Fixtures>({
  context: async ({ locale, colorScheme, deviceScaleFactor }, use) => {
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
    worker ??= await context.waitForEvent("serviceworker");
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
  await context.route(/^https:\/\/(github\.com|raw\.githubusercontent\.com)\//, async (route: Route) => {
    const url = new URL(route.request().url());
    const key = `${url.origin}${url.pathname}`;
    const hit = routes[key];
    if (!hit) return route.fulfill({ status: 404, contentType: "text/plain", body: "Not Found" });
    return route.fulfill({ status: hit.status ?? 200, contentType: hit.contentType, body: hit.body });
  });
}
