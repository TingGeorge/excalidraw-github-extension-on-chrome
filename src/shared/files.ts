/**
 * File-type detection for everything the extension can preview.
 *
 * "Sure" kinds are recognised by file name alone. Plain `.svg` / `.png` files
 * are only previewable when Excalidraw embedded the scene in them, so those
 * need a look at the content (`hasEmbeddedScene`) before we offer a preview.
 */

export type FileKind =
  | "excalidraw" // .excalidraw, .excalidraw.json
  | "excalidraw-svg" // .excalidraw.svg
  | "excalidraw-png" // .excalidraw.png
  | "obsidian" // .excalidraw.md (Obsidian Excalidraw plugin)
  | "library" // .excalidrawlib
  | "svg" // any other .svg — preview only if a scene is embedded
  | "png"; // any other .png — preview only if a scene is embedded

const SUFFIXES: Array<[string, FileKind]> = [
  [".excalidraw.json", "excalidraw"],
  [".excalidraw.svg", "excalidraw-svg"],
  [".excalidraw.png", "excalidraw-png"],
  [".excalidraw.md", "obsidian"],
  [".excalidrawlib", "library"],
  [".excalidraw", "excalidraw"],
  [".svg", "svg"],
  [".png", "png"],
];

export function detectKind(path: string): FileKind | null {
  const name = fileNameOf(path).toLowerCase();
  for (const [suffix, kind] of SUFFIXES) {
    if (name.endsWith(suffix) && name.length > suffix.length) return kind;
  }
  return null;
}

/** Kinds that need their content inspected before a preview is offered. */
export function needsSniff(kind: FileKind): boolean {
  return kind === "svg" || kind === "png";
}

export function isBinaryKind(kind: FileKind): boolean {
  return kind === "png" || kind === "excalidraw-png";
}

/**
 * Last segment of a path. Paths may be URL-encoded (`a%20b.excalidraw`) or
 * already decoded; `#` and `?` are legal in file names, so pass a URL's
 * `pathname` (not the whole URL) when the input comes from a link.
 */
export function fileNameOf(path: string): string {
  const parts = path.split("/");
  const name = parts[parts.length - 1] ?? "";
  if (!/%[0-9a-f]{2}/i.test(name)) return name;
  try {
    return decodeURIComponent(name);
  } catch {
    return name; // a literal "%" in the name
  }
}

export const EXCALIDRAW_MIME = "application/vnd.excalidraw+json";

/** Does an SVG/PNG file carry an Excalidraw scene (exported with "Embed scene")? */
export function hasEmbeddedScene(kind: FileKind, data: string | Uint8Array): boolean {
  if (kind === "excalidraw-svg" || kind === "svg") {
    const text = typeof data === "string" ? data : new TextDecoder().decode(data);
    return text.includes(`payload-type:${EXCALIDRAW_MIME}`);
  }
  if (kind === "excalidraw-png" || kind === "png") {
    const bytes = typeof data === "string" ? base64ToBytes(data) : data;
    return bytesInclude(bytes, new TextEncoder().encode(EXCALIDRAW_MIME));
  }
  return true;
}

function bytesInclude(haystack: Uint8Array, needle: Uint8Array): boolean {
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function mimeForKind(kind: FileKind): string {
  switch (kind) {
    case "excalidraw-svg":
    case "svg":
      return "image/svg+xml";
    case "excalidraw-png":
    case "png":
      return "image/png";
    case "obsidian":
      return "text/markdown";
    case "library":
      return "application/vnd.excalidrawlib+json";
    default:
      return EXCALIDRAW_MIME;
  }
}
