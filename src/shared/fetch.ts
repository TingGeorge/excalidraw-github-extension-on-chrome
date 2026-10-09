import { bytesToBase64 } from "./files";
import { t } from "./i18n";
import type { FetchResult } from "./protocol";

/**
 * URLs the extension may download diagrams from: GitHub "raw" endpoints and
 * GitHub's user-content hosts (raw files, LFS media, gists). Nothing else, so
 * the service worker's fetch can't be used as a general proxy.
 */
export function isAllowedFetchUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return false;
  if (u.hostname === "github.com" || u.hostname === "gist.github.com") {
    return /^\/[^/]+\/[^/]+\/raw\//.test(u.pathname);
  }
  return u.hostname.endsWith(".githubusercontent.com");
}

/**
 * Larger files are not something to render in a tab — and base64 of a bigger
 * PNG would exceed Chrome's 64 MiB extension message limit.
 */
export const MAX_FILE_BYTES = 40 * 1024 * 1024;

export async function fetchFileContent(
  url: string,
  binary: boolean,
  credentials: RequestCredentials = "same-origin",
  maxBytes = MAX_FILE_BYTES,
): Promise<FetchResult> {
  if (!isAllowedFetchUrl(url)) {
    return { ok: false, status: 0, error: `Refusing to fetch ${url}` };
  }
  let res: Response;
  try {
    res = await fetch(url, { credentials, redirect: "follow", cache: "no-cache" });
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) };
  }
  // Redirected to a login page (or anywhere but a file): the session cannot read it.
  const finalUrl = res.url || url;
  const type = res.headers.get("content-type") ?? "";
  if (
    !isAllowedFetchUrl(finalUrl) ||
    (type.startsWith("text/html") && new URL(finalUrl).hostname === "github.com")
  ) {
    return { ok: false, status: 401, error: t("signedOut") };
  }
  if (!res.ok) {
    return { ok: false, status: res.status, error: `HTTP ${res.status} ${res.statusText}`.trim() };
  }
  const tooLarge = (n: number) => n > maxBytes;
  if (tooLarge(Number(res.headers.get("content-length") ?? 0))) {
    return { ok: false, status: 413, error: t("fileTooLarge") };
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (tooLarge(bytes.length)) return { ok: false, status: 413, error: t("fileTooLarge") };
  if (binary) {
    return { ok: true, content: { encoding: "base64", data: bytesToBase64(bytes) }, finalUrl };
  }
  return { ok: true, content: { encoding: "text", data: new TextDecoder().decode(bytes) }, finalUrl };
}
