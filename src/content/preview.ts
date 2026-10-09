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
  private actions: HTMLElement | null = null;
  private inline: HTMLElement | null = null;
  private hidden: HTMLElement | null = null;
  private destroyed = false;

  constructor(readonly opts: FilePreviewOptions) {
    this.previewable = needsSniff(opts.kind) ? null : true;
  }

  /** Download the file once; failures can be retried. */
  load(): Promise<FetchResult> {
    if (!this.content) {
      const promise = (async (): Promise<FetchResult> => {
        const url = this.opts.rawUrl();
        const binary = isBinaryKind(this.opts.kind);
        const result = url ? await fetchContent(url, binary) : null;
        if (result?.ok) return result;
        const text = binary ? null : (this.opts.fallbackText?.() ?? null);
        if (text !== null)
          return { ok: true, content: { encoding: "text", data: text }, finalUrl: location.href };
        return result ?? { ok: false, status: 0, error: "No download link for this file" };
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
    const r = await this.load();
    // Text (SVG) or base64 (PNG); hasEmbeddedScene understands both.
    this.previewable = r.ok && hasEmbeddedScene(this.opts.kind, r.content.data);
    return this.previewable;
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
    const status = h("div", { class: "xgp-inline__status" }, t("loading"));
    const handle = h("div", {
      class: "xgp-inline__resize",
      role: "separator",
      "aria-orientation": "horizontal",
      "aria-label": t("resizePreview"),
      tabindex: "0",
    });
    const container = h(
      "div",
      {
        class: "xgp-inline",
        [MARK]: "inline",
        "data-xgp-key": this.opts.key,
        style: `height:${settings.inlineHeight}px;margin-top:${getComputedStyle(body).marginTop}`,
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
    const result = await this.load();
    if (!stillOpen()) return;
    if (!result.ok) {
      status.textContent = `${t("errorTitle")}: ${result.error}`;
      status.classList.add("xgp-inline__status--error");
      return;
    }
    const stored = await sendToBackground({ type: "xgp:store", payload: this.payload(result) });
    if (!stillOpen()) return;
    if (!stored.ok) {
      status.textContent = stored.error;
      status.classList.add("xgp-inline__status--error");
      return;
    }
    const frame = h("iframe", {
      class: "xgp-inline__frame",
      src: viewerUrl({ id: stored.id, embed: "1", theme: viewerTheme(this.opts.settings()) }),
      title: `${t("inlineFrameTitle")}: ${this.opts.fileName}`,
      allow: "clipboard-write; fullscreen",
    });
    frame.addEventListener("load", () => status.remove(), { once: true });
    container.prepend(frame);
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

/** Scroll requests from an embedded viewer (wheel events while it is not focused). */
export function handleEmbedMessage(e: MessageEvent) {
  if (e.origin !== extensionOrigin()) return;
  const data = e.data as Partial<EmbedScrollMessage> | null;
  if (data?.source !== "xgp-viewer" || data.type !== "scroll") return;
  window.scrollBy({ left: Number(data.dx) || 0, top: Number(data.dy) || 0, behavior: "instant" });
}
