import LZString from "lz-string";

/**
 * Extract the scene JSON from an Obsidian Excalidraw plugin file (`*.excalidraw.md`).
 *
 * The plugin stores the drawing in a fenced block under a "Drawing" heading,
 * either as plain JSON (```json) or LZ-String compressed base64
 * (```compressed-json, wrapped across lines).
 */
export function extractObsidianScene(markdown: string): string {
  const text = markdown.replace(/\r\n?/g, "\n");
  const heading = /^#{1,6}\s+Drawing\s*$/m.exec(text);
  const searchFrom = heading ? heading.index : 0;
  const fence = /```(compressed-json|json)[ \t]*\n([\s\S]*?)\n[ \t]*```/g;
  fence.lastIndex = searchFrom;
  const match = fence.exec(text);
  if (!match) {
    throw new Error("No Excalidraw drawing found in this Markdown file.");
  }
  const [, format, body = ""] = match;
  if (format === "json") return body.trim();
  const decompressed = LZString.decompressFromBase64(body.replace(/\s+/g, ""));
  if (!decompressed) {
    throw new Error("Could not decompress the Obsidian Excalidraw drawing.");
  }
  return decompressed;
}
