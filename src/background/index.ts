import { detectKind } from "../shared/files";
import { fetchFileContent, isAllowedFetchUrl } from "../shared/fetch";
import type { BackgroundRequest, Payload } from "../shared/protocol";
import { getPayload, putPayload } from "./store";

const MENU_ID = "xgp-preview-link";
const LINK_PATTERNS = [
  ".excalidraw",
  ".excalidraw.json",
  ".excalidraw.svg",
  ".excalidraw.png",
  ".excalidraw.md",
  ".excalidrawlib",
].flatMap((ext) =>
  [
    "https://github.com",
    "https://gist.github.com",
    "https://raw.githubusercontent.com",
    "https://gist.githubusercontent.com",
  ].flatMap((origin) => [`${origin}/*${ext}`, `${origin}/*${ext}?*`]),
);

function viewerUrl(params: Record<string, string>): string {
  return chrome.runtime.getURL(`viewer.html?${new URLSearchParams(params).toString()}`);
}

async function openViewerTab(params: Record<string, string>, sender?: chrome.tabs.Tab): Promise<void> {
  await chrome.tabs.create({
    url: viewerUrl(params),
    ...(sender?.index !== undefined ? { index: sender.index + 1 } : {}),
    ...(sender?.id !== undefined ? { openerTabId: sender.id } : {}),
    ...(sender?.windowId !== undefined ? { windowId: sender.windowId } : {}),
  });
}

function isValidPayload(value: unknown): value is Payload {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<Payload>;
  return p.mode === "view" || p.mode === "diff";
}

async function handle(msg: BackgroundRequest, sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (msg.type) {
    case "xgp:store": {
      if (!isValidPayload(msg.payload)) return { ok: false, error: "Invalid payload" };
      return { ok: true, id: await putPayload(msg.payload) };
    }
    case "xgp:open": {
      if (!isValidPayload(msg.payload)) return { ok: false, error: "Invalid payload" };
      const id = await putPayload(msg.payload);
      await openViewerTab({ id }, sender.tab);
      return { ok: true, id };
    }
    case "xgp:get": {
      const payload = await getPayload(String(msg.id));
      return payload ? { ok: true, payload } : { ok: false, error: "This preview has expired." };
    }
    case "xgp:fetch": {
      if (!isAllowedFetchUrl(msg.url)) return { ok: false, status: 0, error: "URL not allowed" };
      return fetchFileContent(msg.url, Boolean(msg.binary), "include");
    }
    case "xgp:open-options": {
      await chrome.runtime.openOptionsPage();
      return { ok: true };
    }
    default:
      return { ok: false, error: "Unknown message" };
  }
}

chrome.runtime.onMessage.addListener((msg: BackgroundRequest, sender, sendResponse) => {
  if (
    sender.id !== chrome.runtime.id ||
    !msg ||
    typeof msg.type !== "string" ||
    !msg.type.startsWith("xgp:")
  ) {
    return false;
  }
  handle(msg, sender).then(sendResponse, (err: unknown) =>
    sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }),
  );
  return true; // keep the channel open for the async response
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: chrome.i18n.getMessage("contextMenuPreview") || "Preview Excalidraw diagram",
      contexts: ["link"],
      targetUrlPatterns: LINK_PATTERNS,
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !info.linkUrl) return;
  if (!detectKind(new URL(info.linkUrl).pathname)) return;
  void openViewerTab({ url: info.linkUrl }, tab);
});
