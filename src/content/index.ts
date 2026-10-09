import { parsePage } from "../shared/github";
import { loadSettings, onSettingsChanged, type Settings } from "../shared/settings";
import { teardownBlob, updateBlob } from "./blob";
import { MARK, rafThrottle } from "./dom";
import { teardownDiff, updateDiff } from "./diff";
import { teardownGist, updateGist } from "./gist";
import { handleEmbedMessage, syncInlineHeight } from "./preview";

let settings: Settings | null = null;

function update() {
  if (!settings) return;
  if (location.hostname === "gist.github.com") {
    updateGist(settings);
    return;
  }
  const page = parsePage(location.href);
  if (page.type === "blob") updateBlob(page, settings);
  else teardownBlob();

  if (settings.diffButtons && (page.type === "pull" || page.type === "commit" || page.type === "compare")) {
    updateDiff(page, settings, scheduleUpdate);
  } else {
    teardownDiff();
  }
}

const scheduleUpdate = rafThrottle(update);

async function main() {
  settings = await loadSettings();
  onSettingsChanged((next) => {
    const prev = settings;
    settings = next;
    if (prev?.inlineHeight !== next.inlineHeight) syncInlineHeight(next.inlineHeight);
    // The inline height is saved while resizing the open preview: keep it open.
    const relevant = (s: Settings | null) => s && { ...s, inlineHeight: 0 };
    if (JSON.stringify(relevant(prev)) === JSON.stringify(relevant(next))) return;
    // Re-create our UI with the new settings.
    teardownBlob();
    teardownDiff();
    teardownGist();
    scheduleUpdate();
  });

  // GitHub navigates with Turbo and React Router without full page loads, and
  // re-renders parts of the page at any time: re-check on DOM changes, except
  // the ones happening inside our own UI.
  const ours = (node: Node) => (node instanceof Element ? node : node.parentElement)?.closest(`[${MARK}]`);
  new MutationObserver((records) => {
    if (records.some((r) => !ours(r.target))) scheduleUpdate();
  }).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", scheduleUpdate);
  document.addEventListener("turbo:load", scheduleUpdate);
  document.addEventListener("turbo:render", scheduleUpdate);
  window.addEventListener("message", handleEmbedMessage);
  // Turbo snapshots the page for back/forward navigation; a restored snapshot
  // would contain copies of our UI without their event listeners.
  document.addEventListener("turbo:before-cache", () => {
    teardownBlob();
    teardownDiff();
    teardownGist();
    document.querySelectorAll(`[${MARK}]`).forEach((n) => n.remove());
    document.querySelectorAll("[data-xgp-hidden]").forEach((n) => n.removeAttribute("data-xgp-hidden"));
  });
  update();
}

void main();
