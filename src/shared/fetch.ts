import { bytesToBase64 } from "./files";
import type { FetchResult } from "./protocol";

/** Hosts the extension is allowed to download diagrams from. */
export function isAllowedFetchUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return (
      u.hostname === "github.com" ||
      u.hostname === "gist.github.com" ||
      u.hostname === "raw.githubusercontent.com" ||
      u.hostname.endsWith(".githubusercontent.com")
    );
  } catch {
    return false;
  }
}

/** Larger files are almost certainly not something we want to render in a tab. */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export async function fetchFileContent(
  url: string,
  binary: boolean,
  credentials: RequestCredentials = "same-origin",
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
  if (!res.ok) {
    return { ok: false, status: res.status, error: `HTTP ${res.status} ${res.statusText}`.trim() };
  }
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > MAX_FILE_BYTES) {
    return { ok: false, status: res.status, error: "File is too large to preview" };
  }
  // A GitHub login page instead of the file means the session cannot read it.
  const type = res.headers.get("content-type") ?? "";
  if (type.startsWith("text/html") && new URL(res.url).hostname === "github.com") {
    return { ok: false, status: 401, error: "GitHub returned a web page instead of the file (signed out?)" };
  }
  if (binary) {
    const bytes = new Uint8Array(await res.arrayBuffer());
    return { ok: true, content: { encoding: "base64", data: bytesToBase64(bytes) }, finalUrl: res.url };
  }
  return { ok: true, content: { encoding: "text", data: await res.text() }, finalUrl: res.url };
}
