import { bytesToBase64, detectKind, fileNameOf, isBinaryKind } from "../shared/files";
import { parsePage, rawUrlFromBlobUrl } from "../shared/github";
import { t } from "../shared/i18n";
import { sendToBackground, type FileContent, type Payload } from "../shared/protocol";
import type { ViewerParams } from "./params";

export class ViewerError extends Error {}

/** Resolve what this viewer tab should show. `null` means "let the user pick a local file". */
export async function resolvePayload(params: ViewerParams): Promise<Payload | null> {
  if (params.id) {
    const res = await sendToBackground({ type: "xgp:get", id: params.id });
    if (res.ok) return res.payload;
    if (!params.url) throw new ViewerError(t("expired"));
  }
  if (params.url) return payloadFromUrl(params.url);
  return null;
}

export async function payloadFromUrl(url: string): Promise<Payload> {
  const parsed = new URL(url);
  const kind = detectKind(parsed.pathname);
  if (!kind) throw new ViewerError(t("unsupportedFile"));
  const page = parsePage(url);
  const rawUrl = page.type === "blob" ? (rawUrlFromBlobUrl(url) ?? url) : url;
  const res = await sendToBackground({ type: "xgp:fetch", url: rawUrl, binary: isBinaryKind(kind) });
  if (!res.ok) {
    throw new ViewerError(res.status === 401 || res.status === 404 ? t("signedOut") : res.error);
  }
  return {
    mode: "view",
    source: {
      htmlUrl: page.type === "blob" ? url : undefined,
      rawUrl,
      repo: page.type === "blob" ? `${page.owner}/${page.repo}` : undefined,
      path: page.type === "blob" ? page.refAndPath : fileNameOf(parsed.pathname),
      fileName: fileNameOf(parsed.pathname),
      kind,
    },
    content: res.content,
  };
}

export async function payloadFromFile(file: File): Promise<Payload> {
  const kind = detectKind(file.name);
  if (!kind) throw new ViewerError(t("unsupportedFile"));
  let content: FileContent;
  if (isBinaryKind(kind)) {
    content = { encoding: "base64", data: bytesToBase64(new Uint8Array(await file.arrayBuffer())) };
  } else {
    content = { encoding: "text", data: await file.text() };
  }
  return { mode: "view", source: { path: file.name, fileName: file.name, kind }, content };
}
