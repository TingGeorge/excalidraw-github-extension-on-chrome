/**
 * Pull request "Files changed", commit and compare pages: add a "Preview diff"
 * button to the header of every changed Excalidraw file. Works with both the
 * classic diff view (`div.file[data-tagsearch-path]`) and the React diff view
 * (`DiffFileHeader-module__diff-file-header`).
 */
import { detectKind, fileNameOf, isBinaryKind, needsSniff, type FileKind } from "../shared/files";
import { parseCompareRange, rawUrl, shortSha, blobUrl, type PageType, type RepoRef } from "../shared/github";
import { t } from "../shared/i18n";
import { sendToBackground, type DiffPayload, type DiffSide, type FileContent } from "../shared/protocol";
import type { Settings } from "../shared/settings";
import { h, icon, ICONS, MARK } from "./dom";
import { fetchContent } from "./fetch";
import { viewerTheme } from "./theme";
import { showToast } from "./toast";

type DiffPage = Extract<PageType, { type: "pull" | "commit" | "compare" }>;

export interface DiffFile {
  header: HTMLElement;
  /** Where the button goes. */
  slot: HTMLElement;
  /** Insert before this child of `slot` (null = append). */
  before: Element | null;
  path: string;
  oldPath: string;
  /** `/owner/repo/blob/<sha>/<path>` link from the file's menu, if present. */
  viewFileHref: string | null;
  deleted: boolean;
}

const LRM = /[‎‏‪-‮]/g;

function splitRename(text: string): { oldPath: string; path: string } {
  const clean = text.replace(LRM, "").trim();
  const parts = clean.split(/\s+→\s+/);
  const path = parts[parts.length - 1]!.trim();
  return { path, oldPath: (parts.length > 1 ? parts[0]! : path).trim() };
}

/** Classic diff view (PR "Files changed", compare). */
export function findClassicFiles(root: ParentNode = document): DiffFile[] {
  const files: DiffFile[] = [];
  for (const el of root.querySelectorAll<HTMLElement>(".file[data-tagsearch-path]")) {
    const header = el.querySelector<HTMLElement>(".file-header");
    if (!header) continue;
    const title = header.querySelector(".file-info a[title]")?.getAttribute("title") ?? "";
    const names = splitRename(
      title.includes("→") ? title : (el.dataset.tagsearchPath ?? header.dataset.path ?? ""),
    );
    const slot =
      header.querySelector<HTMLElement>(".file-actions > .d-flex") ??
      header.querySelector<HTMLElement>(".file-actions");
    if (!slot || !names.path) continue;
    files.push({
      header,
      slot,
      before: slot.firstElementChild,
      path: names.path,
      oldPath: names.oldPath,
      viewFileHref: header.querySelector<HTMLAnchorElement>('details-menu a[href*="/blob/"]')?.href ?? null,
      deleted: el.dataset.fileDeleted === "true" || header.dataset.fileDeleted === "true",
    });
  }
  return files;
}

/** React diff view (commit pages, new PR experience). */
export function findReactFiles(root: ParentNode = document): DiffFile[] {
  const files: DiffFile[] = [];
  for (const header of root.querySelectorAll<HTMLElement>(
    '[class*="DiffFileHeader-module__diff-file-header"]',
  )) {
    const heading = header.querySelector("h3");
    if (!heading) continue;
    const names = splitRename(heading.textContent ?? "");
    const slot = header.querySelector<HTMLElement>(":scope > .flex-justify-end, :scope > div:last-child");
    if (!slot || !names.path) continue;
    const more = slot.querySelector(':scope > button[aria-haspopup="true"]');
    files.push({
      header,
      slot,
      before: more,
      path: names.path,
      oldPath: names.oldPath,
      viewFileHref: header.querySelector<HTMLAnchorElement>('a[href*="/blob/"]')?.href ?? null,
      deleted: false,
    });
  }
  return files;
}

// --- Commit range resolution ---------------------------------------------------

export interface Range {
  repo: RepoRef;
  base: string;
  head: string;
  baseLabel: string;
  headLabel: string;
  /** Per-file overrides found in embedded data (exact blob versions, renames). */
  files?: Map<string, { oldPath?: string; oldOid?: string; newOid?: string }>;
  /** Repository the head commit lives in, when it differs (pull requests from forks). */
  headRepo?: RepoRef;
}

async function apiJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`https://api.github.com${path}`, {
      credentials: "omit",
      headers: { Accept: "application/vnd.github+json" },
    });
    return res.ok ? ((await res.json()) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

type ApiRef = { sha?: string; ref?: string; repo?: { full_name?: string } | null };

/**
 * Ask GitHub's public REST API for the commits a pull request or compare view
 * diffs. Only works for public repositories (no token), so it is a fallback.
 */
async function rangeFromApi(page: Extract<DiffPage, { type: "pull" | "compare" }>): Promise<Range | null> {
  const repo = { owner: page.owner, repo: page.repo };
  const base = `/repos/${encodeURIComponent(page.owner)}/${encodeURIComponent(page.repo)}`;
  let baseRef: string;
  let headRef: string;
  let headSha: string | undefined;
  let headRepo: RepoRef | undefined;
  if (page.type === "pull") {
    const pr = await apiJson(`${base}/pulls/${page.number}`);
    const prBase = pr?.base as ApiRef | undefined;
    const prHead = pr?.head as ApiRef | undefined;
    if (!prBase?.sha || !prHead?.sha) return null;
    baseRef = prBase.sha;
    headRef = prHead.sha;
    headSha = prHead.sha;
    const [owner, name] = (prHead.repo?.full_name ?? "").split("/");
    if (owner && name) headRepo = { owner, repo: name };
  } else {
    const range = parseCompareRange(page.range);
    if (!range) return null;
    [baseRef, headRef] = [range.base, range.head];
  }
  // The diff is against the merge base, not the tip of the base branch.
  const cmp = await apiJson(
    `${base}/compare/${encodeURIComponent(baseRef)}...${encodeURIComponent(headRef)}`,
  );
  const mergeBase = (cmp?.merge_base_commit as { sha?: string } | undefined)?.sha;
  const commits = cmp?.commits as Array<{ sha?: string }> | undefined;
  headSha ??=
    commits && commits.length > 0 && commits.length < 250 ? commits[commits.length - 1]?.sha : undefined;
  const baseSha = mergeBase ?? (page.type === "pull" ? baseRef : undefined);
  if (!baseSha) return null;
  const head = headSha ?? headRef;
  return { repo, base: baseSha, head, baseLabel: shortSha(baseSha), headLabel: shortSha(head), headRepo };
}

const SHA = "[0-9a-f]{40}";

/** Look for comparison SHAs in attribute values / raw HTML (classic diff view). */
export function shasFromText(text: string): { base: string; head: string } | null {
  const decoded = text.replace(/&amp;/g, "&");
  const patterns = [
    new RegExp(`[?&]sha1=(${SHA})[^"'\\s]*?[?&]sha2=(${SHA})`),
    new RegExp(`start_commit_oid=(${SHA})[\\s\\S]{0,200}?end_commit_oid=(${SHA})`),
    new RegExp(`end_commit_oid=(${SHA})[\\s\\S]{0,200}?start_commit_oid=(${SHA})`),
    new RegExp(`/diffs/(${SHA})\\.\\.(${SHA})`),
  ];
  for (const [i, re] of patterns.entries()) {
    const m = re.exec(decoded);
    if (m) return i === 2 ? { base: m[2]!, head: m[1]! } : { base: m[1]!, head: m[2]! };
  }
  return null;
}

function attributeText(doc: Document): string {
  const values: string[] = [];
  for (const el of doc.querySelectorAll(
    "[src*='sha2='], [data-url*='sha2='], [data-url*='end_commit_oid='], [data-url*='/diffs/']",
  )) {
    values.push(el.getAttribute("src") ?? "", el.getAttribute("data-url") ?? "");
  }
  return values.join("\n");
}

interface EmbeddedInfo {
  base?: string;
  head?: string;
  files: Map<string, { oldPath?: string; oldOid?: string; newOid?: string }>;
}

/** Walk React embedded JSON for commit SHAs and per-file diff entries. */
export function embeddedInfo(jsonTexts: string[]): EmbeddedInfo {
  const info: EmbeddedInfo = { files: new Map() };
  const visit = (node: unknown, depth: number) => {
    if (!node || typeof node !== "object" || depth > 12) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    const o = node as Record<string, unknown>;
    if (typeof o.sha1 === "string" && typeof o.sha2 === "string" && !info.base) {
      info.base = o.sha1;
      info.head = o.sha2;
    }
    for (const [b, hd] of [
      ["baseRefOid", "headRefOid"],
      ["baseOid", "headOid"],
      ["startOid", "endOid"],
    ] as const) {
      if (typeof o[b] === "string" && typeof o[hd] === "string" && !info.base) {
        info.base = o[b] as string;
        info.head = o[hd] as string;
      }
    }
    if (typeof o.path === "string" && (typeof o.oldOid === "string" || typeof o.newOid === "string")) {
      const oldTree = o.oldTreeEntry as { path?: string } | undefined;
      info.files.set(o.path, {
        oldPath: typeof oldTree?.path === "string" ? oldTree.path : undefined,
        oldOid: typeof o.oldOid === "string" ? o.oldOid : undefined,
        newOid: typeof o.newOid === "string" ? o.newOid : undefined,
      });
    }
    for (const value of Object.values(o)) visit(value, depth + 1);
  };
  for (const text of jsonTexts) {
    try {
      visit(JSON.parse(text), 0);
    } catch {
      // ignore malformed blocks
    }
  }
  return info;
}

function embeddedJson(doc: Document): string[] {
  return [
    ...doc.querySelectorAll<HTMLScriptElement>(
      'script[type="application/json"][data-target$=".embeddedData"]',
    ),
  ].map((s) => s.textContent ?? "");
}

/** `owner/repo:branch` from the PR header's base/head ref labels. */
function prRefs(doc: Document): { base?: string; head?: string; headRepo?: RepoRef } {
  const parse = (el: Element | null) => {
    const title = el?.getAttribute("title") ?? "";
    const m = /^([^/\s]+)\/([^:\s]+):(.+)$/.exec(title);
    return m ? { repo: { owner: m[1]!, repo: m[2]! }, ref: m[3]! } : null;
  };
  const base = parse(doc.querySelector(".commit-ref.base-ref"));
  const head = parse(doc.querySelector(".commit-ref.head-ref"));
  return { base: base?.ref, head: head?.ref, headRepo: head?.repo };
}

async function resolveRange(page: DiffPage): Promise<Range> {
  const repo = { owner: page.owner, repo: page.repo };
  if (page.type === "commit") {
    return {
      repo,
      base: `${page.sha}~1`,
      head: page.sha,
      baseLabel: `${shortSha(page.sha)}~1`,
      headLabel: shortSha(page.sha),
    };
  }

  const refs = prRefs(document);
  const label = (sha: string, ref?: string) => (ref ? `${ref} (${shortSha(sha)})` : shortSha(sha));
  const fromDoc = (doc: Document, text?: string): Range | null => {
    const embedded = embeddedInfo(embeddedJson(doc));
    const shas =
      shasFromText(text ?? attributeText(doc)) ??
      (embedded.base && embedded.head ? { base: embedded.base, head: embedded.head } : null);
    if (!shas && embedded.files.size === 0) return null;
    const base = shas?.base ?? "";
    const head = shas?.head ?? "";
    return {
      repo,
      base,
      head,
      baseLabel: base ? label(base, refs.base) : "",
      headLabel: head ? label(head, refs.head) : "",
      files: embedded.files,
    };
  };

  const direct = fromDoc(document);
  if (direct?.base && direct.head) return direct;

  // After client-side navigation the DOM may lack the data: ask GitHub for the page again.
  try {
    const res = await fetch(location.href, { credentials: "same-origin", headers: { Accept: "text/html" } });
    if (res.ok) {
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const fetched = fromDoc(doc, html);
      if (fetched?.base && fetched.head) return fetched;
    }
  } catch {
    // fall through to ref names
  }

  const fromApi = await rangeFromApi(page);
  if (fromApi) {
    if (refs.base) fromApi.baseLabel = label(fromApi.base, refs.base);
    if (refs.head) fromApi.headLabel = label(fromApi.head, refs.head);
    return fromApi;
  }

  if (page.type === "compare") {
    const range = parseCompareRange(page.range);
    if (range) {
      return { repo, base: range.base, head: range.head, baseLabel: range.base, headLabel: range.head };
    }
  }
  if (refs.base && refs.head) {
    // Branch tips rather than the exact merge base, but close enough to compare.
    return { repo, base: refs.base, head: refs.head, baseLabel: refs.base, headLabel: refs.head };
  }
  throw new Error("Could not find which commits this diff compares.");
}

// --- Fetching both versions -------------------------------------------------------

async function loadSide(
  repo: RepoRef,
  ref: string,
  path: string,
  kind: FileKind,
): Promise<FileContent | null> {
  if (!ref) return null;
  const result = await fetchContent(rawUrl(repo, ref, path), isBinaryKind(kind));
  if (result.ok) return result.content;
  if (result.status === 404) return null;
  throw new Error(result.error);
}

function headFromViewFile(href: string | null): { repo: RepoRef; sha: string } | null {
  if (!href) return null;
  const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([0-9a-f]{40})\//.exec(href);
  return m ? { repo: { owner: m[1]!, repo: m[2]! }, sha: m[3]! } : null;
}

function pageTitle(page: DiffPage): string {
  switch (page.type) {
    case "pull":
      return `PR #${page.number}`;
    case "commit":
      return `Commit ${shortSha(page.sha)}`;
    case "compare":
      return `Compare ${page.range}`;
  }
}

async function openDiff(page: DiffPage, file: DiffFile, settings: Settings) {
  const kind = detectKind(file.path)!;
  const range = await resolveRange(page);
  const entry = range.files?.get(file.path);
  const oldPath = entry?.oldPath ?? file.oldPath;
  const view = file.deleted ? null : headFromViewFile(file.viewFileHref);
  const headRepo = view?.repo ?? range.headRepo ?? range.repo;
  const headRef = view?.sha ?? entry?.newOid ?? range.head;
  const baseRef = entry?.oldOid ?? range.base;

  const [baseContent, headContent] = await Promise.all([
    loadSide(range.repo, baseRef, oldPath, kind),
    file.deleted ? Promise.resolve(null) : loadSide(headRepo, headRef, file.path, kind),
  ]);
  if (!baseContent && !headContent) throw new Error(t("diffLoadFailed"));

  const side = (
    repo: RepoRef,
    ref: string,
    path: string,
    content: FileContent | null,
    labelText: string,
  ): DiffSide => ({
    source: {
      htmlUrl: ref ? blobUrl(repo, ref, path) : undefined,
      rawUrl: ref ? rawUrl(repo, ref, path) : undefined,
      repo: `${repo.owner}/${repo.repo}`,
      ref,
      path,
      fileName: fileNameOf(path),
      kind,
    },
    content,
    label: labelText,
  });

  const payload: DiffPayload = {
    mode: "diff",
    title: pageTitle(page),
    pageUrl: location.href.split("#")[0]!,
    path: file.path,
    base: side(range.repo, baseRef, oldPath, baseContent, range.baseLabel || shortSha(baseRef)),
    head: side(headRepo, headRef, file.path, headContent, range.headLabel || shortSha(headRef)),
    theme: viewerTheme(settings),
  };
  const res = await sendToBackground({ type: "xgp:open", payload });
  if (!res.ok) throw new Error(res.error);
}

// --- Buttons ------------------------------------------------------------------------

function diffButton(page: DiffPage, file: DiffFile, settings: Settings): HTMLButtonElement {
  const btn = h(
    "button",
    {
      type: "button",
      class: "xgp-btn xgp-btn--diff",
      [MARK]: "diff-button",
      "data-xgp-path": file.path,
      title: t("previewDiffTitle"),
    },
    icon(ICONS.diagram),
    h("span", { class: "xgp-btn__label" }, t("previewDiff")),
  );
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    btn.setAttribute("aria-busy", "true");
    btn.disabled = true;
    try {
      await openDiff(page, file, settings);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      btn.removeAttribute("aria-busy");
      btn.disabled = false;
    }
  });
  return btn;
}

function pageKey(page: DiffPage): string {
  const id = page.type === "pull" ? page.number : page.type === "commit" ? page.sha : page.range;
  return `${page.type}:${page.owner}/${page.repo}:${id}`;
}

export function updateDiff(page: PageType, settings: Settings) {
  if (page.type !== "pull" && page.type !== "commit" && page.type !== "compare") return;
  const key = pageKey(page);
  for (const file of [...findClassicFiles(), ...findReactFiles()]) {
    const kind = detectKind(file.path);
    if (!kind || needsSniff(kind)) continue;
    const existing = file.slot.querySelector<HTMLElement>(`[${MARK}="diff-button"]`);
    if (existing?.dataset.xgpPath === file.path && existing.dataset.xgpPage === key) continue;
    existing?.remove();
    const btn = diffButton(page, file, settings);
    btn.dataset.xgpPage = key;
    file.slot.insertBefore(btn, file.before?.parentElement === file.slot ? file.before : null);
  }
}

export function teardownDiff() {
  document.querySelectorAll(`[${MARK}="diff-button"]`).forEach((n) => n.remove());
}
