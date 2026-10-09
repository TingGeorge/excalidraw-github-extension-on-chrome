/** Helpers for understanding github.com URLs. Pure functions, no DOM. */

export interface RepoRef {
  owner: string;
  repo: string;
}

export interface BlobUrl extends RepoRef {
  /** Everything after `/blob/`: the ref followed by the file path (refs may contain `/`). */
  refAndPath: string;
  fileName: string;
}

export type PageType =
  | ({ type: "blob" } & BlobUrl)
  | ({ type: "pull"; number: number } & RepoRef)
  | ({ type: "commit"; sha: string } & RepoRef)
  | ({ type: "compare"; range: string } & RepoRef)
  | { type: "other" };

const GITHUB_ORIGIN = "https://github.com";

function splitPath(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function parsePage(href: string): PageType {
  let url: URL;
  try {
    url = new URL(href, GITHUB_ORIGIN);
  } catch {
    return { type: "other" };
  }
  const parts = splitPath(url.pathname);
  if (parts.length < 3) return { type: "other" };
  const [owner, repo, section, ...rest] = parts as [string, string, string, ...string[]];
  const base = { owner, repo };
  if (section === "blob" && rest.length >= 2) {
    return {
      type: "blob",
      ...base,
      refAndPath: rest.map(safeDecode).join("/"),
      fileName: safeDecode(rest[rest.length - 1]!),
    };
  }
  if (section === "pull" && rest[0] && /^\d+$/.test(rest[0])) {
    return { type: "pull", ...base, number: Number(rest[0]) };
  }
  if (section === "commit" && rest[0] && /^[0-9a-f]{7,64}$/i.test(rest[0])) {
    return { type: "commit", ...base, sha: rest[0] };
  }
  if (section === "compare" && rest.length > 0) {
    return { type: "compare", ...base, range: rest.map(safeDecode).join("/") };
  }
  return { type: "other" };
}

export function encodePath(path: string): string {
  return path
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
}

/** `https://github.com/o/r/blob/<ref>/<path>` → `https://github.com/o/r/raw/<ref>/<path>` */
export function rawUrlFromBlobUrl(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href, GITHUB_ORIGIN);
  } catch {
    return null;
  }
  const parts = url.pathname.split("/");
  // ["", owner, repo, "blob", ...]
  if (parts[3] !== "blob" || parts.length < 6) return null;
  parts[3] = "raw";
  return `${url.origin}${parts.join("/")}`;
}

export function rawUrl(repo: RepoRef, ref: string, path: string): string {
  return `${GITHUB_ORIGIN}/${repo.owner}/${repo.repo}/raw/${encodePath(ref)}/${encodePath(path)}`;
}

export function blobUrl(repo: RepoRef, ref: string, path: string): string {
  return `${GITHUB_ORIGIN}/${repo.owner}/${repo.repo}/blob/${encodePath(ref)}/${encodePath(path)}`;
}

/** Parse a `.../blob/<sha>/<path>` link whose ref is a commit SHA (as diff "View file" links are). */
export function parseShaBlobLink(
  href: string,
): { owner: string; repo: string; sha: string; path: string } | null {
  let url: URL;
  try {
    url = new URL(href, GITHUB_ORIGIN);
  } catch {
    return null;
  }
  const parts = splitPath(url.pathname);
  if (parts.length < 5 || parts[2] !== "blob") return null;
  const sha = parts[3]!;
  if (!/^[0-9a-f]{40}$|^[0-9a-f]{64}$/i.test(sha)) return null;
  return {
    owner: parts[0]!,
    repo: parts[1]!,
    sha,
    path: parts.slice(4).map(safeDecode).join("/"),
  };
}

/** Split a compare range like `main...feature` or `a1b2c3..d4e5f6`. Both sides must be non-empty. */
export function parseCompareRange(range: string): { base: string; head: string } | null {
  for (const sep of ["...", ".."]) {
    const i = range.indexOf(sep);
    if (i <= 0) continue;
    const head = range.slice(i + sep.length);
    if (head && !head.startsWith(".")) return { base: range.slice(0, i), head };
  }
  return null;
}

export function shortSha(ref: string): string {
  return /^[0-9a-f]{40}$|^[0-9a-f]{64}$/i.test(ref) ? ref.slice(0, 7) : ref;
}
