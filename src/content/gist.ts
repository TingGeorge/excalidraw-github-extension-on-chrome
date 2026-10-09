/**
 * gist.github.com: every Excalidraw file of a gist gets Preview / Inline
 * buttons next to its Raw button.
 */
import { detectKind, needsSniff } from "../shared/files";
import { shortSha } from "../shared/github";
import type { Settings } from "../shared/settings";
import { FilePreview } from "./preview";

const previews = new Map<string, FilePreview>();
let settings: Settings;

interface GistFile {
  key: string;
  file: HTMLElement;
  rawLink: HTMLAnchorElement;
  name: string;
}

function gistFiles(root: ParentNode = document): GistFile[] {
  const files: GistFile[] = [];
  for (const file of root.querySelectorAll<HTMLElement>(".file[id^='file-']")) {
    const rawLink = file.querySelector<HTMLAnchorElement>(".file-header .file-actions a[href*='/raw/']");
    const name = file.querySelector(".gist-blob-name")?.textContent?.trim();
    if (!rawLink || !name) continue;
    files.push({
      key: `${location.pathname}#${file.id}:${rawLink.getAttribute("href")}`,
      file,
      rawLink,
      name,
    });
  }
  return files;
}

/** `/user/<id>/raw/<revision>/<file>` → user and revision. */
function rawInfo(href: string): { user: string; revision?: string } {
  const parts = new URL(href, location.href).pathname.split("/").filter(Boolean);
  const raw = parts.indexOf("raw");
  return { user: parts[0] ?? "", revision: raw >= 0 ? parts[raw + 1] : undefined };
}

export function updateGist(next: Settings) {
  settings = next;
  const seen = new Set<string>();
  for (const { key, file, rawLink, name } of gistFiles()) {
    const kind = detectKind(name);
    if (!kind || (needsSniff(kind) && !settings.sniffImages)) continue;
    seen.add(key);
    let preview = previews.get(key);
    if (!preview) {
      const fileId = file.id;
      preview = new FilePreview({
        key,
        kind,
        fileName: name,
        rawUrl: () =>
          document.getElementById(fileId)?.querySelector<HTMLAnchorElement>("a[href*='/raw/']")?.href ?? null,
        source: () => {
          const { user, revision } = rawInfo(rawLink.href);
          return {
            htmlUrl: `${location.origin}${location.pathname}#${fileId}`,
            repo: `gist.github.com/${user}`,
            ref: revision ? shortSha(revision) : undefined,
            path: name,
          };
        },
        body: () =>
          document.getElementById(fileId)?.querySelector<HTMLElement>(".blob-wrapper, .Box-body") ?? null,
        settings: () => settings,
      });
      previews.set(key, preview);
    }
    const p = preview;
    if (p.previewable === null) {
      void p.sniff().then((ok) => ok && updateGist(settings));
      continue;
    }
    if (!p.previewable) continue;
    p.mountActions(rawLink);
    p.maintainInline();
    if (settings.autoInline && !p.inlineOpen && !file.dataset.xgpAutoInline) {
      file.dataset.xgpAutoInline = "1";
      void p.openInline();
    }
  }
  for (const [key, preview] of previews) {
    if (!seen.has(key)) {
      preview.destroy();
      previews.delete(key);
    }
  }
}

export function teardownGist() {
  for (const preview of previews.values()) preview.destroy();
  previews.clear();
}
