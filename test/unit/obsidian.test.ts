import LZString from "lz-string";
import { describe, expect, it } from "vitest";
import { extractObsidianScene } from "../../src/shared/obsidian";

const scene = {
  type: "excalidraw",
  version: 2,
  elements: [{ id: "a", type: "rectangle", x: 0, y: 0, width: 10, height: 10, text: "héllo 圖" }],
  appState: {},
};
const json = JSON.stringify(scene);

function wrap(s: string, n = 256): string {
  const lines: string[] = [];
  for (let i = 0; i < s.length; i += n) lines.push(s.slice(i, i + n));
  return lines.join("\n");
}

function note(drawingBlock: string, heading = "# Drawing"): string {
  return `---\nexcalidraw-plugin: parsed\n---\n\n# Text Elements\nhello ^abc123\n\n%%\n${heading}\n${drawingBlock}\n%%\n`;
}

describe("extractObsidianScene", () => {
  it("reads a plain json block under '# Drawing'", () => {
    const out = extractObsidianScene(note("```json\n" + json + "\n```"));
    expect(JSON.parse(out)).toEqual(scene);
  });

  it("reads a plain json block under '## Drawing'", () => {
    const out = extractObsidianScene(note("```json\n" + json + "\n```", "## Drawing"));
    expect(JSON.parse(out)).toEqual(scene);
  });

  it("trims surrounding whitespace of plain json", () => {
    const out = extractObsidianScene(note("```json\n  " + json + "  \n```"));
    expect(out).toBe(json);
  });

  it("decompresses a compressed-json block wrapped at 256 chars", () => {
    const big = {
      ...scene,
      elements: Array.from({ length: 40 }, (_, i) => ({ ...scene.elements[0], id: `e${i}`, x: i })),
    };
    const compressed = LZString.compressToBase64(JSON.stringify(big));
    expect(compressed.length).toBeGreaterThan(512);
    const out = extractObsidianScene(note("```compressed-json\n" + wrap(compressed) + "\n```"));
    expect(JSON.parse(out)).toEqual(big);
  });

  it("decompresses a short single-line compressed block", () => {
    const compressed = LZString.compressToBase64(json);
    const out = extractObsidianScene(note("```compressed-json\n" + compressed + "\n```"));
    expect(out).toBe(json);
  });

  it("handles CRLF line endings (plain and compressed)", () => {
    const plain = note("```json\n" + json + "\n```").replace(/\n/g, "\r\n");
    expect(extractObsidianScene(plain)).toBe(json);
    const compressed = LZString.compressToBase64(json.repeat(1) + " ".repeat(600));
    const crlf = note("```compressed-json\n" + wrap(compressed, 100) + "\n```").replace(/\n/g, "\r\n");
    expect(extractObsidianScene(crlf)).toBe(json + " ".repeat(600));
  });

  it("works without a Drawing heading", () => {
    expect(extractObsidianScene("```json\n" + json + "\n```")).toBe(json);
  });

  it("ignores earlier unrelated json blocks when a Drawing heading exists", () => {
    const md = '# Notes\n```json\n{"not":"the scene"}\n```\n\n' + note("```json\n" + json + "\n```");
    expect(extractObsidianScene(md)).toBe(json);
  });

  it("throws when there is no drawing", () => {
    expect(() => extractObsidianScene("# Just a note\n\nNo drawing here.")).toThrow(/No Excalidraw drawing/);
    expect(() => extractObsidianScene("")).toThrow();
    expect(() => extractObsidianScene("# Drawing\n\n```js\nconsole.log(1)\n```")).toThrow();
  });

  it("throws on corrupted compressed data", () => {
    expect(() => extractObsidianScene(note("```compressed-json\n!!!not-base64!!!\n```"))).toThrow(
      /decompress/,
    );
    expect(() => extractObsidianScene(note("```compressed-json\n\n```"))).toThrow();
  });
});
