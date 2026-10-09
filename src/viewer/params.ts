import type { Theme } from "../shared/protocol";

export interface ViewerParams {
  /** Payload id in the background store. */
  id: string | null;
  /** A GitHub blob/raw URL to download directly (context menu, expired payloads). */
  url: string | null;
  /** Rendered inside an iframe on a GitHub page. */
  embed: boolean;
  theme: Theme | null;
}

export function readParams(search = location.search): ViewerParams {
  const q = new URLSearchParams(search);
  const theme = q.get("theme");
  return {
    id: q.get("id"),
    url: q.get("url"),
    embed: q.get("embed") === "1",
    theme: theme === "light" || theme === "dark" ? theme : null,
  };
}
