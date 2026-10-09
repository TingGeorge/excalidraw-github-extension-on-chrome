/**
 * Repository file ("blob") pages: add Preview / Inline buttons next to
 * GitHub's Raw · Copy · Download buttons.
 */
import { detectKind, fileNameOf, needsSniff } from "../shared/files";
import { rawUrlFromBlobUrl, type BlobUrl } from "../shared/github";
import { DEFAULT_SETTINGS, type Settings } from "../shared/settings";
import { FilePreview } from "./preview";

let preview: FilePreview | null = null;
let autoInlineDone = false;
/** Latest settings; read at click time so handlers never see stale values. */
let settings: Settings = DEFAULT_SETTINGS;

const SELECTORS = {
  rawButton: 'a[data-testid="raw-button"]',
  moreButton: '[data-testid="more-file-actions-button"]',
  blobSection: 'section[aria-labelledby*="file-name-id"]',
  codeContents: ".react-code-file-contents",
};

function rawButton(): HTMLAnchorElement | null {
  return document.querySelector<HTMLAnchorElement>(SELECTORS.rawButton);
}

function rawUrl(): string | null {
  const href = rawButton()?.href;
  if (href && href.includes("/raw/")) return href;
  return rawUrlFromBlobUrl(location.href);
}

function blobSection(): HTMLElement | null {
  const section = document.querySelector<HTMLElement>(SELECTORS.blobSection);
  if (section) return section;
  return document.querySelector<HTMLElement>(SELECTORS.codeContents)?.closest("section") ?? null;
}

/** Text of the file as embedded in the initial page load (no network needed). */
function embeddedRawLines(page: BlobUrl): string | null {
  for (const script of document.querySelectorAll<HTMLScriptElement>(
    'script[type="application/json"][data-target="react-app.embeddedData"]',
  )) {
    try {
      const data = JSON.parse(script.textContent ?? "") as {
        payload?: {
          path?: string;
          codeViewBlobLayoutRoute?: { path?: string };
          "codeViewBlobLayoutRoute.StyledBlob"?: { rawLines?: string[] | null };
        };
      };
      const payload = data.payload;
      const path = payload?.codeViewBlobLayoutRoute?.path ?? payload?.path;
      const lines = payload?.["codeViewBlobLayoutRoute.StyledBlob"]?.rawLines;
      if (path && page.refAndPath.endsWith(path) && Array.isArray(lines)) return lines.join("\n");
    } catch {
      // not the payload we are looking for
    }
  }
  return null;
}

/** Split `<ref>/<path>` using the breadcrumb's repository link (`/owner/repo/tree/<ref>`). */
function splitRefAndPath(page: BlobUrl): { ref?: string; path: string } {
  const link = document.querySelector<HTMLAnchorElement>('a[data-testid="breadcrumbs-repo-link"]');
  const match = link ? /\/tree\/(.+)$/.exec(new URL(link.href, location.href).pathname) : null;
  if (match) {
    let ref = match[1]!;
    try {
      ref = decodeURIComponent(ref);
    } catch {
      // keep encoded
    }
    if (page.refAndPath.startsWith(`${ref}/`)) return { ref, path: page.refAndPath.slice(ref.length + 1) };
  }
  return { path: page.refAndPath };
}

function actionsAnchor(): Element | null {
  const raw = rawButton();
  return (
    raw?.closest('[data-component="ButtonGroup"]') ?? raw ?? document.querySelector(SELECTORS.moreButton)
  );
}

export function teardownBlob() {
  preview?.destroy();
  preview = null;
}

export function updateBlob(page: BlobUrl, next: Settings) {
  settings = next;
  const href = location.href.split("#")[0]!;
  if (preview?.opts.key !== href) {
    teardownBlob();
    const kind = detectKind(fileNameOf(page.refAndPath));
    if (!kind || (needsSniff(kind) && !settings.sniffImages)) return;
    autoInlineDone = false;
    preview = new FilePreview({
      key: href,
      kind,
      fileName: page.fileName,
      rawUrl,
      source: () => ({ htmlUrl: href, repo: `${page.owner}/${page.repo}`, ...splitRefAndPath(page) }),
      body: blobSection,
      fallbackText: () => embeddedRawLines(page),
      fallbackViewerUrl: href,
      settings: () => settings,
    });
  }
  const p = preview;
  if (!p) return;
  if (p.previewable === null) {
    void p.sniff().then((ok) => ok && preview === p && updateBlob(page, settings));
    return;
  }
  if (!p.previewable) return;

  const anchor = actionsAnchor();
  if (!anchor) return;
  p.mountActions(anchor);
  // React may re-render the file view and drop our inline container.
  p.maintainInline();

  if (settings.autoInline && !autoInlineDone && blobSection()) {
    autoInlineDone = true;
    if (!p.inlineOpen) void p.openInline();
  }
}
