import { fetchFileContent } from "../shared/fetch";
import { sendToBackground, type FetchResult } from "../shared/protocol";

/**
 * Download a file the way the signed-in user sees it. The content script's own
 * fetch runs with github.com's origin and cookies, so private repositories
 * work; if that fails (e.g. CORS on an unusual redirect) the service worker
 * tries with its host permissions.
 */
export async function fetchContent(url: string, binary: boolean): Promise<FetchResult> {
  const direct = await fetchFileContent(url, binary, "same-origin");
  if (direct.ok || direct.status === 404) return direct;
  try {
    const viaBackground = await sendToBackground({ type: "xgp:fetch", url, binary });
    return viaBackground.ok ? viaBackground : direct;
  } catch {
    return direct;
  }
}
