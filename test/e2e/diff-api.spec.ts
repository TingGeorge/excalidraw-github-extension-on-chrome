/**
 * When a pull request page carries no commit SHAs in its markup (e.g. GitHub's
 * React "Files changed" view after client-side navigation), the diff range comes
 * from GitHub's public REST API instead.
 */
import { expect, fixture, routeGitHub, test } from "./fixtures";

const REPO = "https://github.com/TingGeorge/excalidraw-github-extension-on-chrome";
const PR = `${REPO}/pull/1/files`;
const PATH = "samples/how-it-works.excalidraw";
const MERGE_BASE = "e4413eeae42e4f3853ca8ad80372e995b022509b";
const BASE_TIP = "1111111111111111111111111111111111111111";
const HEAD = "2fa800062b33136871c6cd109d770279c9f88b4a";
const API = "https://api.github.com/repos/TingGeorge/excalidraw-github-extension-on-chrome";

test("PR page without SHAs in the DOM resolves the range through the REST API", async ({ page, context }) => {
  // React diff view markup with every hint about the compared commits removed.
  const html = fixture("github/commit-full.html").replace(
    /<script type="application\/json" data-target="react-app\.embeddedData">[\s\S]*?<\/script>/g,
    "",
  );
  expect(html).not.toContain("sha1=");

  await routeGitHub(context, {
    [PR]: { body: html, contentType: "text/html" },
    [`${REPO}/raw/${MERGE_BASE}/${PATH}`]: {
      body: fixture("github/how-it-works.base.excalidraw"),
      contentType: "text/plain",
    },
    [`${REPO}/raw/${HEAD}/${PATH}`]: {
      body: fixture("github/how-it-works.head.excalidraw"),
      contentType: "text/plain",
    },
  });
  const apiCalls: string[] = [];
  await context.route("https://api.github.com/**", (route) => {
    const url = route.request().url();
    apiCalls.push(url);
    if (url === `${API}/pulls/1`) {
      return route.fulfill({
        json: {
          base: { sha: BASE_TIP, ref: "main" },
          head: {
            sha: HEAD,
            ref: "feature",
            repo: { full_name: "TingGeorge/excalidraw-github-extension-on-chrome" },
          },
        },
      });
    }
    if (url === `${API}/compare/${BASE_TIP}...${HEAD}`) {
      return route.fulfill({ json: { merge_base_commit: { sha: MERGE_BASE }, commits: [{ sha: HEAD }] } });
    }
    return route.fulfill({ status: 404, json: {} });
  });

  await page.goto(PR);
  const button = page.locator('[data-xgp="diff-button"][data-xgp-path="samples/how-it-works.excalidraw"]');
  await expect(button).toBeVisible();
  const [viewer] = await Promise.all([context.waitForEvent("page"), button.click()]);
  // The merge base (not the base branch tip) is the "before" side.
  await expect(viewer.locator('[data-testid="xv-pane-base"] .xv-pane__label')).toContainText(
    MERGE_BASE.slice(0, 7),
  );
  await expect(viewer.locator('[data-testid="xv-pane-head"] .xv-pane__label')).toContainText(
    HEAD.slice(0, 7),
  );
  await expect(viewer.locator(".xv-diffstat__added")).toHaveText("+4");
  expect(apiCalls).toEqual([`${API}/pulls/1`, `${API}/compare/${BASE_TIP}...${HEAD}`]);
});

test("when no commits can be found, branch tips are compared and the viewer says so", async ({
  page,
  context,
}) => {
  // Classic PR page with every commit SHA scrubbed: only the base/head branch names remain.
  const html = fixture("github/pr-files-full.html").replace(/[0-9a-f]{40}/g, "");
  await routeGitHub(context, {
    [PR]: { body: html, contentType: "text/html" },
    [`${REPO}/raw/main/${PATH}`]: {
      body: fixture("github/how-it-works.base.excalidraw"),
      contentType: "text/plain",
    },
    [`${REPO}/raw/claude/eloquent-babbage-6mkmev/${PATH}`]: {
      body: fixture("github/how-it-works.head.excalidraw"),
      contentType: "text/plain",
    },
  });
  await context.route("https://api.github.com/**", (route) => route.fulfill({ status: 404, json: {} }));
  await page.goto(PR);
  const button = page.locator(`[data-xgp="diff-button"][data-xgp-path="${PATH}"]`);
  const [viewer] = await Promise.all([context.waitForEvent("page"), button.click()]);
  await expect(viewer.locator(".xv-banner")).toContainText("latest versions of the branches");
  await expect(viewer.locator(".xv-diffstat__added")).toHaveText("+4");
});
