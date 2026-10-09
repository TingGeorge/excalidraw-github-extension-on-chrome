import type { Theme } from "../shared/protocol";

export interface ViewerParams {
  /** Payload id in the background store. */
  id: string | null;
  /** A GitHub blob/raw URL to download directly (context menu, expired payloads). */
  url: string | null;
  /** Rendered inside an iframe on a GitHub page. */
  embed: boolean;
  theme: Theme | null;
  /** GitHub page to return to when a preview can't be shown (expired diffs). */
  back: string | null;
}

export function readParams(search = location.search): ViewerParams {
  const q = new URLSearchParams(search);
  const theme = q.get("theme");
  return {
    id: q.get("id"),
    url: q.get("url"),
    embed: q.get("embed") === "1",
    theme: theme === "light" || theme === "dark" ? theme : null,
    back: isGitHubPage(q.get("back")) ? q.get("back") : null,
  };
}

function isGitHubPage(url: string | null): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "github.com" || u.hostname === "gist.github.com");
  } catch {
    return false;
  }
}
