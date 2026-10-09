import type { FileKind } from "./files";

export type Theme = "light" | "dark";

/** Where a previewed file came from. */
export interface SourceInfo {
  /** github.com page for the file (blob URL), if any. */
  htmlUrl?: string;
  /** URL the content was downloaded from, used to re-fetch if the payload expired. */
  rawUrl?: string;
  /** e.g. `owner/repo` */
  repo?: string;
  /** Branch, tag or commit shown to the user. */
  ref?: string;
  /** Repository path or file name shown to the user. */
  path: string;
  fileName: string;
  kind: FileKind;
}

export interface FileContent {
  encoding: "text" | "base64";
  data: string;
}

export interface ViewPayload {
  mode: "view";
  source: SourceInfo;
  content: FileContent;
  theme?: Theme;
}

export interface DiffSide {
  source: SourceInfo;
  /** `null` when the file does not exist on this side (added / deleted). */
  content: FileContent | null;
  /** Short label, e.g. `main` or `a1b2c3d`. */
  label: string;
}

export interface DiffPayload {
  mode: "diff";
  /** e.g. `Pull request #12` */
  title: string;
  /** Page the diff was opened from. */
  pageUrl: string;
  path: string;
  base: DiffSide;
  head: DiffSide;
  theme?: Theme;
}

export type Payload = ViewPayload | DiffPayload;

export type FetchResult =
  { ok: true; content: FileContent; finalUrl: string } | { ok: false; status: number; error: string };

/** Messages handled by the background service worker. */
export type BackgroundRequest =
  | { type: "xgp:store"; payload: Payload }
  | { type: "xgp:open"; payload: Payload }
  | { type: "xgp:get"; id: string }
  | { type: "xgp:fetch"; url: string; binary: boolean }
  | { type: "xgp:open-options" };

export type BackgroundResponse<T extends BackgroundRequest["type"]> = T extends "xgp:store"
  ? { ok: true; id: string } | { ok: false; error: string }
  : T extends "xgp:open"
    ? { ok: true; id: string } | { ok: false; error: string }
    : T extends "xgp:get"
      ? { ok: true; payload: Payload } | { ok: false; error: string }
      : T extends "xgp:fetch"
        ? FetchResult
        : { ok: boolean };

export async function sendToBackground<T extends BackgroundRequest>(
  message: T,
): Promise<BackgroundResponse<T["type"]>> {
  return (await chrome.runtime.sendMessage(message)) as BackgroundResponse<T["type"]>;
}

/** Messages the embedded (inline) viewer sends to its parent page. */
export interface EmbedScrollMessage {
  source: "xgp-viewer";
  type: "scroll";
  dx: number;
  dy: number;
}
