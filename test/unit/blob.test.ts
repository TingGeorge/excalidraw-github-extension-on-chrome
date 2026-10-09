import { describe, expect, it } from "vitest";
import { rawLinkMatches } from "../../src/content/blob";
import { parsePage, type BlobUrl } from "../../src/shared/github";

const page = (url: string) => parsePage(url) as { type: "blob" } & BlobUrl;
const A = page("https://github.com/o/r/blob/main/docs/a.excalidraw");

describe("rawLinkMatches", () => {
  it("accepts GitHub's Raw link for the same file (refs/heads form)", () => {
    expect(rawLinkMatches("https://github.com/o/r/raw/refs/heads/main/docs/a.excalidraw", A)).toBe(true);
  });
  it("rejects a stale Raw link for another file after client-side navigation", () => {
    expect(rawLinkMatches("https://github.com/o/r/raw/refs/heads/main/docs/b.excalidraw", A)).toBe(false);
    expect(rawLinkMatches("https://github.com/x/r/raw/refs/heads/main/docs/a.excalidraw", A)).toBe(false);
  });
  it("rejects the previous branch's Raw link after switching branches", () => {
    const dev = page("https://github.com/o/r/blob/dev/x.excalidraw");
    expect(rawLinkMatches("https://github.com/o/r/raw/refs/heads/main/x.excalidraw", dev)).toBe(false);
    expect(rawLinkMatches("https://github.com/o/r/raw/refs/heads/dev/x.excalidraw", dev)).toBe(true);
  });
  it("rejects a file with the same name in another folder", () => {
    const top = page("https://github.com/o/r/blob/main/x.excalidraw");
    expect(rawLinkMatches("https://github.com/o/r/raw/refs/heads/main/docs/x.excalidraw", top)).toBe(false);
  });
  it("handles refs with slashes and encoded names", () => {
    const p = page("https://github.com/o/r/blob/feature/x/my%20diagram%231.excalidraw");
    expect(
      rawLinkMatches("https://github.com/o/r/raw/refs/heads/feature/x/my%20diagram%231.excalidraw", p),
    ).toBe(true);
  });
});
