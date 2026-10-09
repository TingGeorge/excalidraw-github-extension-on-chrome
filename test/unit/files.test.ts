import { describe, expect, it } from "vitest";
import {
  base64ToBytes,
  bytesToBase64,
  detectKind,
  EXCALIDRAW_MIME,
  fileNameOf,
  hasEmbeddedScene,
  isBinaryKind,
  mimeForKind,
  needsSniff,
  type FileKind,
} from "../../src/shared/files";

describe("detectKind", () => {
  it.each([
    ["a.excalidraw", "excalidraw"],
    ["a.excalidraw.json", "excalidraw"],
    ["a.excalidraw.svg", "excalidraw-svg"],
    ["a.excalidraw.png", "excalidraw-png"],
    ["a.excalidraw.md", "obsidian"],
    ["a.excalidrawlib", "library"],
    ["a.svg", "svg"],
    ["a.png", "png"],
    ["dir/sub/diagram.excalidraw", "excalidraw"],
    ["my.diagram.v2.excalidraw.svg", "excalidraw-svg"],
  ] as Array<[string, FileKind]>)("%s -> %s", (path, kind) => {
    expect(detectKind(path)).toBe(kind);
  });

  it("is case-insensitive", () => {
    expect(detectKind("A.EXCALIDRAW")).toBe("excalidraw");
    expect(detectKind("A.Excalidraw.SVG")).toBe("excalidraw-svg");
    expect(detectKind("A.ExcaliDraw.PNG")).toBe("excalidraw-png");
    expect(detectKind("A.PNG")).toBe("png");
    expect(detectKind("Note.Excalidraw.MD")).toBe("obsidian");
  });

  it("returns null for unsupported files", () => {
    expect(detectKind("README.md")).toBeNull();
    expect(detectKind("a.jpg")).toBeNull();
    expect(detectKind("a.excalidraw.txt")).toBeNull();
    expect(detectKind("excalidraw")).toBeNull();
    expect(detectKind("")).toBeNull();
    expect(detectKind("dir.excalidraw/file.txt")).toBeNull();
  });

  it("does not treat a name that is only the suffix as a file", () => {
    expect(detectKind(".excalidraw")).toBeNull();
    expect(detectKind("dir/.excalidraw")).toBeNull();
    expect(detectKind(".svg")).toBeNull();
    expect(detectKind(".png")).toBeNull();
    expect(detectKind(".excalidrawlib")).toBeNull();
  });

  it("falls back to the shorter suffix when the long one has no base name", () => {
    // ".excalidraw.svg" is a plain SVG named ".excalidraw".
    expect(detectKind(".excalidraw.svg")).toBe("svg");
    expect(detectKind("x.excalidraw.svg")).toBe("excalidraw-svg");
  });

  it("strips query and hash", () => {
    expect(detectKind("a.excalidraw?raw=true")).toBe("excalidraw");
    expect(detectKind("a.excalidraw#L10")).toBe("excalidraw");
    expect(detectKind("https://github.com/o/r/blob/main/a.excalidraw.svg?plain=1#top")).toBe(
      "excalidraw-svg",
    );
    expect(detectKind("a.txt?x=.excalidraw")).toBeNull();
  });

  it("decodes URL-encoded names", () => {
    expect(detectKind("my%20drawing.excalidraw")).toBe("excalidraw");
    expect(detectKind("%E5%9C%96.excalidraw.png")).toBe("excalidraw-png");
    expect(detectKind("a%2Eexcalidraw")).toBe("excalidraw");
  });
});

describe("fileNameOf", () => {
  it("returns the last path segment", () => {
    expect(fileNameOf("a/b/c.txt")).toBe("c.txt");
    expect(fileNameOf("c.txt")).toBe("c.txt");
    expect(fileNameOf("a/b/")).toBe("");
  });
  it("strips query/hash and decodes", () => {
    expect(fileNameOf("a/b%20c.txt?x=1#y")).toBe("b c.txt");
    expect(fileNameOf("a/%E5%9C%96.png")).toBe("圖.png");
  });
  it("keeps raw segment on malformed escapes", () => {
    expect(fileNameOf("a/100%.png")).toBe("100%.png");
    expect(fileNameOf("a/%E0%A4%A.png")).toBe("%E0%A4%A.png");
  });
});

describe("needsSniff / isBinaryKind", () => {
  it("only plain svg and png need sniffing", () => {
    expect(needsSniff("svg")).toBe(true);
    expect(needsSniff("png")).toBe(true);
    for (const k of ["excalidraw", "excalidraw-svg", "excalidraw-png", "obsidian", "library"] as const) {
      expect(needsSniff(k)).toBe(false);
    }
  });
  it("png kinds are binary", () => {
    expect(isBinaryKind("png")).toBe(true);
    expect(isBinaryKind("excalidraw-png")).toBe(true);
    for (const k of ["excalidraw", "excalidraw-svg", "svg", "obsidian", "library"] as const) {
      expect(isBinaryKind(k)).toBe(false);
    }
  });
});

describe("hasEmbeddedScene", () => {
  const marker = `payload-type:${EXCALIDRAW_MIME}`;

  it("detects the SVG payload marker as string and bytes", () => {
    const svg = `<svg><!-- ${marker} --><g/></svg>`;
    expect(hasEmbeddedScene("svg", svg)).toBe(true);
    expect(hasEmbeddedScene("excalidraw-svg", svg)).toBe(true);
    expect(hasEmbeddedScene("svg", new TextEncoder().encode(svg))).toBe(true);
  });

  it("rejects plain SVGs and SVGs that only mention the MIME type", () => {
    expect(hasEmbeddedScene("svg", "<svg><g/></svg>")).toBe(false);
    expect(hasEmbeddedScene("svg", `<svg>${EXCALIDRAW_MIME}</svg>`)).toBe(false);
    expect(hasEmbeddedScene("svg", "")).toBe(false);
  });

  it("detects the MIME string inside PNG bytes", () => {
    const mime = new TextEncoder().encode(EXCALIDRAW_MIME);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, ...mime, 9, 9]);
    expect(hasEmbeddedScene("png", png)).toBe(true);
    expect(hasEmbeddedScene("excalidraw-png", png)).toBe(true);
  });

  it("detects the MIME string at the very start and very end", () => {
    const mime = new TextEncoder().encode(EXCALIDRAW_MIME);
    expect(hasEmbeddedScene("png", mime)).toBe(true);
    expect(hasEmbeddedScene("png", new Uint8Array([1, 2, 3, ...mime]))).toBe(true);
  });

  it("accepts base64 strings for PNG", () => {
    const mime = new TextEncoder().encode(EXCALIDRAW_MIME);
    const withScene = bytesToBase64(new Uint8Array([0x89, 0x50, ...mime, 0, 0, 0]));
    expect(hasEmbeddedScene("png", withScene)).toBe(true);
    const without = bytesToBase64(new Uint8Array([0x89, 0x50, 1, 2, 3, 4]));
    expect(hasEmbeddedScene("png", without)).toBe(false);
  });

  it("rejects PNGs with a truncated MIME string or no data", () => {
    const mime = new TextEncoder().encode(EXCALIDRAW_MIME);
    expect(hasEmbeddedScene("png", mime.subarray(0, mime.length - 1))).toBe(false);
    expect(hasEmbeddedScene("png", new Uint8Array())).toBe(false);
  });

  it("is trivially true for kinds that are always previewable", () => {
    expect(hasEmbeddedScene("excalidraw", "")).toBe(true);
    expect(hasEmbeddedScene("obsidian", "")).toBe(true);
    expect(hasEmbeddedScene("library", "")).toBe(true);
  });
});

describe("base64", () => {
  it("round-trips small buffers", () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
    expect(bytesToBase64(new Uint8Array())).toBe("");
    expect(base64ToBytes("").length).toBe(0);
  });

  it("matches Buffer's encoding", () => {
    const bytes = new Uint8Array(1000).map((_, i) => (i * 7) % 256);
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString("base64"));
  });

  it("round-trips buffers larger than the 32KB chunk size", () => {
    for (const size of [0x8000 - 1, 0x8000, 0x8000 + 1, 100_000, 0x8000 * 3 + 5]) {
      const bytes = new Uint8Array(size).map((_, i) => (i * 31 + 7) % 256);
      const out = base64ToBytes(bytesToBase64(bytes));
      expect(out.length).toBe(size);
      expect(Buffer.from(out).equals(Buffer.from(bytes))).toBe(true);
    }
  });
});

describe("mimeForKind", () => {
  it.each([
    ["excalidraw", EXCALIDRAW_MIME],
    ["excalidraw-svg", "image/svg+xml"],
    ["svg", "image/svg+xml"],
    ["excalidraw-png", "image/png"],
    ["png", "image/png"],
    ["obsidian", "text/markdown"],
    ["library", "application/vnd.excalidrawlib+json"],
  ] as Array<[FileKind, string]>)("%s -> %s", (kind, mime) => {
    expect(mimeForKind(kind)).toBe(mime);
  });
});
