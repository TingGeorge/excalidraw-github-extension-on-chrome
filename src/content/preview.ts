/**
 * One previewable file on a GitHub page: its Preview / Inline buttons, the
 * download of its content, and its inline preview. Used for repository file
 * pages (one file) and gists (several files per page).
 */
import { hasEmbeddedScene, isBinaryKind, needsSniff, type FileKind } from "../shared/files";
import { t } from "../shared/i18n";
import {
  sendToBackground,
  type EmbedScrollMessage,
  type FetchResult,
  type SourceInfo,
  type ViewPayload,
} from "../shared/protocol";
import { INLINE_HEIGHT_MAX, INLINE_HEIGHT_MIN, saveSettings, type Settings } from "../shared/settings";
import { extensionOrigin, h, icon, ICONS, MARK } from "./dom";
import { fetchContent } from "./fetch";
import { viewerTheme } from "./theme";
import { showToast } from "./toast";

export interface FilePreviewOptions {
  /** Identifies the file; buttons are rebuilt when it changes. */
  key: string;
  kind: FileKind;
  fileName: string;
  /** Raw download URL (read lazily: GitHub may re-render the link). */
  rawUrl: () => string | null;
  /** Repository/ref/path shown in the viewer header. */
  source: () => Omit<SourceInfo, "kind" | "fileName" | "rawUrl">;
  /** The element showing the file's code or image, hidden while the inline preview is open. */
  body: () => HTMLElement | null;
  /** Used when the download fails, e.g. text embedded in the page. */
  fallbackText?: () => string | null;
  /** Page to hand to the viewer when we could not download the file ourselves. */
  fallbackViewerUrl?: string;
  settings: () => Settings;
}

/** Height chosen by resizing in this tab; settings are saved with a delay. */
let sessionHeight: number | null = null;

/** Plain images are downloaded just to check for a scene; skip huge ones. */
const SNIFF_MAX_BYTES = 15 * 1024 * 1024;

function viewerUrl(params: Record<string, string>): string {
  return chrome.runtime.getURL(`viewer.html?${new URLSearchParams(params).toString()}`);
}

function actionButton(label: string, title: string, iconPaths: string[], action: string): HTMLButtonElement {
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

export class FilePreview {
  inlineOpen = false;
  /** null while a plain .svg/.png is being checked for an embedded scene. */
  previewable: boolean | null;
  private content: Promise<FetchResult> | null = null;
  /** Payload id in the service worker store for the current download, reused by re-opens. */
  private stored: { result: FetchResult; id: Promise<string> } | null = null;
  private actions: HTMLElement | null = null;
  private inline: HTMLElement | null = null;
  private hidden: HTMLElement | null = null;
  private destroyed = false;

  constructor(readonly opts: FilePreviewOptions) {
    this.previewable = needsSniff(opts.kind) ? null : true;
  }

  /** Download the file once; failures can be retried. */
  load(maxBytes?: number): Promise<FetchResult> {
    if (!this.content) {
      const promise = (async (): Promise<FetchResult> => {
        const url = this.opts.rawUrl();
        const binary = isBinaryKind(this.opts.kind);
        const result = url ? await fetchContent(url, binary, maxBytes) : null;
        if (result?.ok) return result;
        const text = binary ? null : (this.opts.fallbackText?.() ?? null);
        if (text !== null)
          return { ok: true, content: { encoding: "text", data: text }, finalUrl: location.href };
        return result ?? { ok: false, status: 0, error: t("noDownloadLink") };
      })();
      this.content = promise;
      void promise.then((r) => {
        if (!r.ok && this.content === promise) this.content = null;
      });
    }
    return this.content;
  }

  /** For plain .svg/.png: resolves whether the file carries an Excalidraw scene. */
  async sniff(): Promise<boolean> {
    if (this.previewable !== null) return this.previewable;
    this.previewable = false; // don't start a second check meanwhile
    const r = await this.load(SNIFF_MAX_BYTES);
    // Text (SVG) or base64 (PNG); hasEmbeddedScene understands both.
    this.previewable = r.ok && hasEmbeddedScene(this.opts.kind, r.content.data);
    return this.previewable;
  }

  /** Store the payload once per download (re-opening the inline preview reuses it). */
  private storeId(result: Extract<FetchResult, { ok: true }>): Promise<string> {
    if (this.stored?.result !== result) {
      const id = sendToBackground({ type: "xgp:store", payload: this.payload(result) }).then((res) => {
        if (!res.ok) throw new Error(res.error);
        return res.id;
      });
      this.stored = { result, id };
      id.catch(() => {
        if (this.stored?.id === id) this.stored = null;
      });
    }
    return this.stored.id;
  }

  private payload(result: Extract<FetchResult, { ok: true }>): ViewPayload {
    return {
      mode: "view",
      source: {
        ...this.opts.source(),
        rawUrl: this.opts.rawUrl() ?? undefined,
        fileName: this.opts.fileName,
        kind: this.opts.kind,
      },
      content: result.content,
      theme: viewerTheme(this.opts.settings()),
    };
  }

  // --- Buttons -----------------------------------------------------------------

  /** Insert the button group before `anchor` unless it is already there. */
  mountActions(anchor: Element): void {
    if (this.actions?.isConnected && this.actions.nextElementSibling === anchor) return;
    this.actions?.remove();
    this.actions = this.buildActions();
    anchor.before(this.actions);
  }

  hasActions(): boolean {
    return Boolean(this.actions?.isConnected);
  }

  private buildActions(): HTMLElement {
    const preview = actionButton(t("preview"), t("previewTitle"), ICONS.external, "preview");
    const inline = actionButton(t("inline"), t("inlineTitle"), ICONS.eye, "inline");
    const group = h(
      "div",
      { class: "xgp-actions", [MARK]: "actions", "data-xgp-key": this.opts.key },
      preview,
      inline,
    );
    const prefetch = () => void this.load();
    group.addEventListener("pointerenter", prefetch, { once: true });
    group.addEventListener("focusin", prefetch, { once: true });
    preview.addEventListener("click", () => void this.openTab(preview));
    inline.addEventListener("click", () => (this.inlineOpen ? this.closeInline() : void this.openInline()));
    this.syncInlineButton(inline);
    return group;
  }

  private syncInlineButton(
    btn = this.actions?.querySelector<HTMLButtonElement>('[data-xgp-action="inline"]'),
  ) {
    if (!btn) return;
    btn.setAttribute("aria-pressed", String(this.inlineOpen));
    btn.title = this.inlineOpen ? t("hideInlineTitle") : t("inlineTitle");
  }

  async openTab(button?: HTMLButtonElement): Promise<void> {
    if (button) setBusy(button, true);
    try {
      const result = await this.load();
      if (!result.ok) {
        // Let the viewer retry through the service worker and explain what went wrong.
        if (this.opts.fallbackViewerUrl)
          window.open(viewerUrl({ url: this.opts.fallbackViewerUrl }), "_blank");
        else showToast(`${t("errorTitle")}: ${result.error}`, "error");
        return;
      }
      const res = await sendToBackground({ type: "xgp:open", payload: this.payload(result) });
      if (!res.ok) showToast(res.error, "error");
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      if (button) setBusy(button, false);
    }
  }

  // --- Inline preview ------------------------------------------------------------

  async openInline(): Promise<void> {
    const body = this.opts.body();
    if (!body || this.destroyed) return;
    this.closeInline();
    this.inlineOpen = true;
    this.syncInlineButton();

    const settings = this.opts.settings();
    const height = sessionHeight ?? settings.inlineHeight;
    const status = h("div", { class: "xgp-inline__status" }, t("loading"));
    const handle = h("div", {
      class: "xgp-inline__resize",
      role: "separator",
      "aria-orientation": "horizontal",
      "aria-label": t("resizePreview"),
      "aria-valuemin": String(INLINE_HEIGHT_MIN),
      "aria-valuemax": String(INLINE_HEIGHT_MAX),
      "aria-valuenow": String(height),
      tabindex: "0",
    });
    const container = h(
      "div",
      {
        class: "xgp-inline",
        [MARK]: "inline",
        "data-xgp-key": this.opts.key,
        style: `height:${height}px;margin-top:${getComputedStyle(body).marginTop}`,
      },
      status,
      handle,
    );
    makeResizable(container, handle);
    body.before(container);
    body.setAttribute("data-xgp-hidden", "");
    this.inline = container;
    this.hidden = body;

    const stillOpen = () => this.inlineOpen && this.inline === container && container.isConnected;
    const fail = (message: string) => {
      status.textContent = `${t("errorTitle")}: ${message}`;
      status.classList.add("xgp-inline__status--error");
    };
    try {
      const result = await this.load();
      if (!stillOpen()) return;
      if (!result.ok) return fail(result.error);
      const id = await this.storeId(result);
      if (!stillOpen()) return;
      const reload = this.opts.fallbackViewerUrl ?? this.opts.rawUrl();
      const frame = h("iframe", {
        class: "xgp-inline__frame",
        src: viewerUrl({
          id,
          embed: "1",
          theme: viewerTheme(this.opts.settings()),
          ...(reload ? { url: reload } : {}),
        }),
        title: `${t("inlineFrameTitle")}: ${this.opts.fileName}`,
        allow: "clipboard-write; fullscreen",
      });
      frame.addEventListener("load", () => status.remove(), { once: true });
      container.prepend(frame);
    } catch (err) {
      // e.g. "Extension context invalidated" after the extension was updated.
      if (stillOpen()) fail(err instanceof Error ? err.message : String(err));
    }
  }

  closeInline(): void {
    this.inline?.remove();
    this.hidden?.removeAttribute("data-xgp-hidden");
    this.inline = null;
    this.hidden = null;
    if (this.inlineOpen) {
      this.inlineOpen = false;
      this.syncInlineButton();
    }
  }

  /** Re-attach after GitHub re-renders the file view and drops our nodes. */
  maintainInline(): void {
    if (!this.inlineOpen) return;
    const body = this.opts.body();
    if (!this.inline?.isConnected || (body && body !== this.hidden)) {
      void this.openInline();
    } else if (body && !body.hasAttribute("data-xgp-hidden")) {
      body.setAttribute("data-xgp-hidden", "");
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.closeInline();
    this.actions?.remove();
    this.actions = null;
  }
}

function makeResizable(container: HTMLElement, handle: HTMLElement) {
  let startY = 0;
  let startH = 0;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  const clamp = (v: number) => Math.round(Math.min(INLINE_HEIGHT_MAX, Math.max(INLINE_HEIGHT_MIN, v)));
  const setHeight = (px: number) => {
    sessionHeight = px;
    container.style.height = `${px}px`;
    handle.setAttribute("aria-valuenow", String(px));
  };
  // storage.sync allows ~120 writes a minute: save once the user stops resizing.
  const save = (px: number) => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void saveSettings({ inlineHeight: px }).catch(() => undefined), 400);
  };
  const onMove = (e: PointerEvent) => setHeight(clamp(startH + e.clientY - startY));
  const onUp = (e: PointerEvent) => {
    container.classList.remove("xgp-inline--resizing");
    handle.removeEventListener("pointermove", onMove);
    handle.removeEventListener("pointerup", onUp);
    handle.removeEventListener("pointercancel", onUp);
    if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
    const px = clamp(container.getBoundingClientRect().height);
    sessionHeight = px;
    save(px);
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
    setHeight(next);
    save(next);
  });
}

/** Scroll requests from an embedded viewer (wheel events while it is not focused). */
export function handleEmbedMessage(e: MessageEvent) {
  if (e.origin !== extensionOrigin()) return;
  const data = e.data as Partial<EmbedScrollMessage> | null;
  if (data?.source !== "xgp-viewer" || data.type !== "scroll") return;
  window.scrollBy({ left: Number(data.dx) || 0, top: Number(data.dy) || 0, behavior: "instant" });
}
