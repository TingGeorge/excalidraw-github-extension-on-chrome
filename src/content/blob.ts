/**
 * File ("blob") pages: add Preview / Inline buttons next to GitHub's
 * Raw · Copy · Download buttons, and render the inline preview.
 */
import {
  detectKind,
  fileNameOf,
  hasEmbeddedScene,
  isBinaryKind,
  needsSniff,
  type FileKind,
} from "../shared/files";
import { rawUrlFromBlobUrl, type BlobUrl } from "../shared/github";
import { t } from "../shared/i18n";
import {
  sendToBackground,
  type EmbedScrollMessage,
  type FetchResult,
  type ViewPayload,
} from "../shared/protocol";
import {
  DEFAULT_SETTINGS,
  INLINE_HEIGHT_MAX,
  INLINE_HEIGHT_MIN,
  saveSettings,
  type Settings,
} from "../shared/settings";
import { extensionOrigin, h, icon, ICONS, MARK } from "./dom";
import { fetchContent } from "./fetch";
import { viewerTheme } from "./theme";
import { showToast } from "./toast";

interface BlobState {
  href: string;
  page: BlobUrl;
  kind: FileKind;
  /** null while we check whether a plain .svg/.png carries a scene. */
  previewable: boolean | null;
  content: Promise<FetchResult> | null;
  inlineOpen: boolean;
  autoInlineDone: boolean;
}

let state: BlobState | null = null;
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

function loadContent(s: BlobState): Promise<FetchResult> {
  s.content ??= (async () => {
    const url = rawUrl();
    const binary = isBinaryKind(s.kind);
    const result = url ? await fetchContent(url, binary) : null;
    if (result?.ok) return result;
    const embedded = binary ? null : embeddedRawLines(s.page);
    if (embedded !== null)
      return { ok: true, content: { encoding: "text", data: embedded }, finalUrl: location.href } as const;
    return result ?? ({ ok: false, status: 0, error: "No raw URL for this file" } as const);
  })();
  // Allow a retry after a failure.
  void s.content.then((r) => {
    if (!r.ok && state === s) s.content = null;
  });
  return s.content;
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

function buildPayload(s: BlobState, result: Extract<FetchResult, { ok: true }>): ViewPayload {
  return {
    mode: "view",
    source: {
      htmlUrl: location.href.split("#")[0],
      rawUrl: rawUrl() ?? undefined,
      repo: `${s.page.owner}/${s.page.repo}`,
      ...splitRefAndPath(s.page),
      fileName: s.page.fileName,
      kind: s.kind,
    },
    content: result.content,
    theme: viewerTheme(settings),
  };
}

function viewerUrlFor(params: Record<string, string>): string {
  return chrome.runtime.getURL(`viewer.html?${new URLSearchParams(params).toString()}`);
}

// --- Buttons -----------------------------------------------------------------

function button(label: string, title: string, iconPaths: string[], action: string): HTMLButtonElement {
  return h(
    "button",
    { type: "button", class: "xgp-btn", title, "data-xgp-action": action },
    icon(iconPaths),
    h("span", { class: "xgp-btn__label" }, label),
  );
}

function setBusy(btn: HTMLButtonElement, busy: boolean) {
  btn.toggleAttribute("aria-busy", busy);
  btn.disabled = busy;
}

function buildActions(s: BlobState): HTMLElement {
  const preview = button(t("preview"), t("previewTitle"), ICONS.external, "preview");
  const inline = button(t("inline"), t("inlineTitle"), ICONS.eye, "inline");
  inline.setAttribute("aria-pressed", String(s.inlineOpen));
  const group = h(
    "div",
    { class: "xgp-actions", [MARK]: "actions", "data-xgp-href": s.href },
    preview,
    inline,
  );

  const prefetch = () => void loadContent(s);
  group.addEventListener("pointerenter", prefetch, { once: true });
  group.addEventListener("focusin", prefetch, { once: true });

  preview.addEventListener("click", async () => {
    setBusy(preview, true);
    try {
      const result = await loadContent(s);
      if (!result.ok) {
        // Let the viewer try again through the service worker and explain the failure.
        window.open(viewerUrlFor({ url: location.href.split("#")[0]! }), "_blank");
        return;
      }
      const res = await sendToBackground({ type: "xgp:open", payload: buildPayload(s, result) });
      if (!res.ok) showToast(res.error, "error");
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setBusy(preview, false);
    }
  });

  inline.addEventListener("click", () => {
    if (s.inlineOpen) closeInline(s);
    else void openInline(s);
  });
  return group;
}

function syncInlineButton(s: BlobState) {
  const btn = document.querySelector<HTMLButtonElement>(`[${MARK}="actions"] [data-xgp-action="inline"]`);
  if (!btn) return;
  btn.setAttribute("aria-pressed", String(s.inlineOpen));
  btn.title = s.inlineOpen ? t("hideInlineTitle") : t("inlineTitle");
}

function injectButtons(s: BlobState): boolean {
  const existing = document.querySelector<HTMLElement>(`[${MARK}="actions"]`);
  if (existing?.dataset.xgpHref === s.href && existing.isConnected) return true;
  existing?.remove();

  const raw = rawButton();
  const group = raw?.closest<HTMLElement>('[data-component="ButtonGroup"]') ?? raw;
  const anchor = group ?? document.querySelector<HTMLElement>(SELECTORS.moreButton);
  if (!anchor?.parentElement) return false;
  anchor.parentElement.insertBefore(buildActions(s), anchor);
  return true;
}

// --- Inline preview ----------------------------------------------------------

async function openInline(s: BlobState) {
  const section = blobSection();
  if (!section) return;
  s.inlineOpen = true;
  syncInlineButton(s);

  const margin = getComputedStyle(section).marginTop;
  const status = h("div", { class: "xgp-inline__status" }, t("loading"));
  const container = h(
    "div",
    {
      class: "xgp-inline",
      [MARK]: "inline",
      "data-xgp-href": s.href,
      style: `height:${settings.inlineHeight}px;margin-top:${margin}`,
    },
    status,
  );
  const handle = h("div", {
    class: "xgp-inline__resize",
    role: "separator",
    "aria-orientation": "horizontal",
    "aria-label": "Resize preview",
    tabindex: "0",
  });
  container.append(handle);
  makeResizable(container, handle);
  section.before(container);
  section.setAttribute("data-xgp-hidden", "");

  const result = await loadContent(s);
  if (!s.inlineOpen || !container.isConnected) return;
  if (!result.ok) {
    status.textContent = `${t("errorTitle")}: ${result.error}`;
    status.classList.add("xgp-inline__status--error");
    return;
  }
  const stored = await sendToBackground({ type: "xgp:store", payload: buildPayload(s, result) });
  if (!s.inlineOpen || !container.isConnected) return;
  if (!stored.ok) {
    status.textContent = stored.error;
    return;
  }
  const frame = h("iframe", {
    class: "xgp-inline__frame",
    src: viewerUrlFor({ id: stored.id, embed: "1", theme: viewerTheme(settings) }),
    title: `Excalidraw preview: ${s.page.fileName}`,
    allow: "clipboard-write; fullscreen",
  });
  frame.addEventListener("load", () => status.remove(), { once: true });
  container.prepend(frame);
}

function closeInline(s: BlobState | null) {
  document.querySelectorAll(`[${MARK}="inline"]`).forEach((n) => n.remove());
  document.querySelectorAll("[data-xgp-hidden]").forEach((n) => n.removeAttribute("data-xgp-hidden"));
  if (s) {
    s.inlineOpen = false;
    syncInlineButton(s);
  }
}

function makeResizable(container: HTMLElement, handle: HTMLElement) {
  let startY = 0;
  let startH = 0;
  const clamp = (v: number) => Math.round(Math.min(INLINE_HEIGHT_MAX, Math.max(INLINE_HEIGHT_MIN, v)));
  const onMove = (e: PointerEvent) => {
    container.style.height = `${clamp(startH + e.clientY - startY)}px`;
  };
  const onUp = (e: PointerEvent) => {
    container.classList.remove("xgp-inline--resizing");
    handle.removeEventListener("pointermove", onMove);
    handle.removeEventListener("pointerup", onUp);
    handle.removeEventListener("pointercancel", onUp);
    if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
    void saveSettings({ inlineHeight: container.getBoundingClientRect().height });
  };
  handle.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    startY = e.clientY;
    startH = container.getBoundingClientRect().height;
    // Capture the pointer so moves over the iframe still reach us.
    handle.setPointerCapture(e.pointerId);
    container.classList.add("xgp-inline--resizing");
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  });
  handle.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const next = clamp(container.getBoundingClientRect().height + (e.key === "ArrowDown" ? 40 : -40));
    container.style.height = `${next}px`;
    void saveSettings({ inlineHeight: next });
  });
}

/** Scroll requests from the embedded viewer (wheel events while it is not focused). */
export function handleEmbedMessage(e: MessageEvent) {
  if (e.origin !== extensionOrigin()) return;
  const data = e.data as Partial<EmbedScrollMessage> | null;
  if (data?.source !== "xgp-viewer" || data.type !== "scroll") return;
  window.scrollBy({ left: Number(data.dx) || 0, top: Number(data.dy) || 0, behavior: "instant" });
}

// --- Lifecycle ---------------------------------------------------------------

export function teardownBlob() {
  closeInline(null);
  document.querySelectorAll(`[${MARK}="actions"]`).forEach((n) => n.remove());
  state = null;
}

export function updateBlob(page: BlobUrl, next: Settings) {
  settings = next;
  const href = location.href.split("#")[0]!;
  if (state?.href !== href) {
    teardownBlob();
    const kind = detectKind(fileNameOf(page.refAndPath));
    if (!kind || (needsSniff(kind) && !settings.sniffImages)) return;
    state = {
      href,
      page,
      kind,
      previewable: needsSniff(kind) ? null : true,
      content: null,
      inlineOpen: false,
      autoInlineDone: false,
    };
  }
  const s = state;
  if (!s) return;

  if (s.previewable === null) {
    s.previewable = false; // until the sniff finishes, don't start a second one
    void loadContent(s).then((r) => {
      if (state !== s) return;
      // Text (SVG) or base64 (PNG); hasEmbeddedScene understands both.
      if (r.ok) s.previewable = hasEmbeddedScene(s.kind, r.content.data);
      if (s.previewable) updateBlob(page, settings);
    });
    return;
  }
  if (!s.previewable) return;

  if (!injectButtons(s)) return;

  // React may re-render the file view and drop our inline container.
  if (s.inlineOpen && !document.querySelector(`[${MARK}="inline"]`)) {
    closeInline(s);
    void openInline(s);
  } else if (s.inlineOpen) {
    const section = blobSection();
    if (section && !section.hasAttribute("data-xgp-hidden")) section.setAttribute("data-xgp-hidden", "");
  }

  if (settings.autoInline && !s.autoInlineDone && blobSection()) {
    s.autoInlineDone = true;
    if (!s.inlineOpen) void openInline(s);
  }
}
