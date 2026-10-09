import { describe, expect, it } from "vitest";
import {
  blobUrl,
  encodePath,
  parseCompareRange,
  parsePage,
  parseShaBlobLink,
  rawUrl,
  rawUrlFromBlobUrl,
  shortSha,
} from "../../src/shared/github";

const SHA = "e4413eeae42e4f3853ca8ad80372e995b022509b";
const SHA256 = "a".repeat(64);

describe("parsePage", () => {
  it("parses blob pages", () => {
    expect(parsePage("https://github.com/o/r/blob/main/docs/a.excalidraw")).toEqual({
      type: "blob",
      owner: "o",
      repo: "r",
      refAndPath: "main/docs/a.excalidraw",
      fileName: "a.excalidraw",
    });
  });

  it("keeps ref and path together for refs with slashes", () => {
    const p = parsePage("https://github.com/o/r/blob/feature/foo/dir/a.excalidraw");
    expect(p).toMatchObject({
      type: "blob",
      refAndPath: "feature/foo/dir/a.excalidraw",
      fileName: "a.excalidraw",
    });
  });

  it("handles refs/heads/main", () => {
    const p = parsePage("https://github.com/o/r/blob/refs/heads/main/a.excalidraw");
    expect(p).toMatchObject({ type: "blob", refAndPath: "refs/heads/main/a.excalidraw" });
  });

  it("decodes encoded segments", () => {
    const p = parsePage("https://github.com/o/r/blob/main/my%20dir/%E5%9C%96.excalidraw");
    expect(p).toMatchObject({
      type: "blob",
      refAndPath: "main/my dir/圖.excalidraw",
      fileName: "圖.excalidraw",
    });
  });

  it("does not throw on malformed escapes", () => {
    const p = parsePage("https://github.com/o/r/blob/main/100%.excalidraw");
    expect(p).toMatchObject({ type: "blob", fileName: "100%.excalidraw" });
  });

  it("ignores query and hash", () => {
    const p = parsePage("https://github.com/o/r/blob/main/a.excalidraw?plain=1#L3");
    expect(p).toMatchObject({ type: "blob", refAndPath: "main/a.excalidraw" });
  });

  it("accepts relative paths", () => {
    expect(parsePage("/o/r/blob/main/a.excalidraw")).toMatchObject({ type: "blob", owner: "o", repo: "r" });
  });

  it("requires both a ref and a path for blob", () => {
    expect(parsePage("https://github.com/o/r/blob/main")).toEqual({ type: "other" });
    expect(parsePage("https://github.com/o/r/blob")).toEqual({ type: "other" });
  });

  it.each([
    "https://github.com/o/r/pull/12",
    "https://github.com/o/r/pull/12/files",
    "https://github.com/o/r/pull/12/changes",
    `https://github.com/o/r/pull/12/commits/${SHA}`,
    "https://github.com/o/r/pull/12/files?w=1#diff-abc",
  ])("parses pull page %s", (url) => {
    expect(parsePage(url)).toEqual({ type: "pull", owner: "o", repo: "r", number: 12 });
  });

  it("rejects non-numeric pull numbers", () => {
    expect(parsePage("https://github.com/o/r/pull/abc")).toEqual({ type: "other" });
    expect(parsePage("https://github.com/o/r/pull/12abc")).toEqual({ type: "other" });
    expect(parsePage("https://github.com/o/r/pull")).toEqual({ type: "other" });
  });

  it("parses commit pages", () => {
    expect(parsePage(`https://github.com/o/r/commit/${SHA}`)).toEqual({
      type: "commit",
      owner: "o",
      repo: "r",
      sha: SHA,
    });
    expect(parsePage(`https://github.com/o/r/commit/${SHA256}`)).toMatchObject({ type: "commit" });
    expect(parsePage("https://github.com/o/r/commit/abc1234")).toMatchObject({
      type: "commit",
      sha: "abc1234",
    });
  });

  it("rejects non-sha commit paths", () => {
    expect(parsePage("https://github.com/o/r/commit/abc12")).toEqual({ type: "other" });
    expect(parsePage("https://github.com/o/r/commit/main")).toEqual({ type: "other" });
    expect(parsePage("https://github.com/o/r/commit/zzzzzzzz")).toEqual({ type: "other" });
  });

  it("parses compare pages", () => {
    expect(parsePage("https://github.com/o/r/compare/main...feature")).toEqual({
      type: "compare",
      owner: "o",
      repo: "r",
      range: "main...feature",
    });
    expect(parsePage("https://github.com/o/r/compare/a..b")).toMatchObject({ range: "a..b" });
    expect(parsePage("https://github.com/o/r/compare/main...fork:feat%2Fx")).toMatchObject({
      range: "main...fork:feat/x",
    });
    expect(parsePage("https://github.com/o/r/compare")).toEqual({ type: "other" });
  });

  it("returns other for everything else", () => {
    expect(parsePage("https://github.com/")).toEqual({ type: "other" });
    expect(parsePage("https://github.com/o")).toEqual({ type: "other" });
    expect(parsePage("https://github.com/o/r")).toEqual({ type: "other" });
    expect(parsePage("https://github.com/o/r/issues/3")).toEqual({ type: "other" });
    expect(parsePage("https://github.com/o/r/tree/main/dir")).toEqual({ type: "other" });
    expect(parsePage("https://github.com/o/r/")).toEqual({ type: "other" });
    expect(parsePage("")).toEqual({ type: "other" });
    expect(parsePage("http://[bad")).toEqual({ type: "other" });
  });
});

describe("rawUrlFromBlobUrl", () => {
  it("swaps blob for raw", () => {
    expect(rawUrlFromBlobUrl("https://github.com/o/r/blob/main/a/b.excalidraw")).toBe(
      "https://github.com/o/r/raw/main/a/b.excalidraw",
    );
  });
  it("accepts relative URLs", () => {
    expect(rawUrlFromBlobUrl("/o/r/blob/main/a.excalidraw")).toBe(
      "https://github.com/o/r/raw/main/a.excalidraw",
    );
  });
  it("keeps encoded segments encoded", () => {
    expect(rawUrlFromBlobUrl("https://github.com/o/r/blob/main/my%20dir/%E5%9C%96.excalidraw")).toBe(
      "https://github.com/o/r/raw/main/my%20dir/%E5%9C%96.excalidraw",
    );
  });
  it("drops query and hash (they are not part of the path)", () => {
    const out = rawUrlFromBlobUrl("https://github.com/o/r/blob/main/a.excalidraw?plain=1#L1");
    expect(out).toBe("https://github.com/o/r/raw/main/a.excalidraw");
  });
  it("returns null when it is not a blob URL", () => {
    expect(rawUrlFromBlobUrl("https://github.com/o/r/tree/main/a.excalidraw")).toBeNull();
    expect(rawUrlFromBlobUrl("https://github.com/o/r/blob/main")).toBeNull();
    expect(rawUrlFromBlobUrl("https://github.com/o/r")).toBeNull();
    expect(rawUrlFromBlobUrl("http://[bad")).toBeNull();
  });
});

describe("rawUrl / blobUrl / encodePath", () => {
  const repo = { owner: "o", repo: "r" };
  it("encodes each segment but keeps slashes", () => {
    expect(encodePath("a b/c#d/e?f/圖.png")).toBe("a%20b/c%23d/e%3Ff/%E5%9C%96.png");
  });
  it("builds raw URLs", () => {
    expect(rawUrl(repo, "main", "dir/a b.excalidraw")).toBe(
      "https://github.com/o/r/raw/main/dir/a%20b.excalidraw",
    );
  });
  it("encodes '#' and unicode so they stay in the path", () => {
    expect(rawUrl(repo, "main", "C#/圖.excalidraw")).toBe(
      "https://github.com/o/r/raw/main/C%23/%E5%9C%96.excalidraw",
    );
    expect(blobUrl(repo, "main", "C#/圖.excalidraw")).toBe(
      "https://github.com/o/r/blob/main/C%23/%E5%9C%96.excalidraw",
    );
  });
  it("keeps slashes in refs", () => {
    expect(blobUrl(repo, "feature/x", "a.excalidraw")).toBe(
      "https://github.com/o/r/blob/feature/x/a.excalidraw",
    );
  });
  it("round-trips through parsePage", () => {
    const url = blobUrl(repo, "main", "my dir/圖 #1.excalidraw");
    expect(parsePage(url)).toMatchObject({ type: "blob", refAndPath: "main/my dir/圖 #1.excalidraw" });
  });
});

describe("parseShaBlobLink", () => {
  it("parses sha links", () => {
    expect(parseShaBlobLink(`https://github.com/o/r/blob/${SHA}/dir/a%20b.excalidraw`)).toEqual({
      owner: "o",
      repo: "r",
      sha: SHA,
      path: "dir/a b.excalidraw",
    });
    expect(parseShaBlobLink(`/o/r/blob/${SHA}/a.excalidraw`)).toMatchObject({
      sha: SHA,
      path: "a.excalidraw",
    });
    expect(parseShaBlobLink(`/o/r/blob/${SHA256}/a.excalidraw`)).toMatchObject({ sha: SHA256 });
  });
  it("rejects branch names, short shas and other sections", () => {
    expect(parseShaBlobLink("https://github.com/o/r/blob/main/a.excalidraw")).toBeNull();
    expect(parseShaBlobLink("https://github.com/o/r/blob/abc1234/a.excalidraw")).toBeNull();
    expect(parseShaBlobLink(`https://github.com/o/r/tree/${SHA}/a.excalidraw`)).toBeNull();
    expect(parseShaBlobLink(`https://github.com/o/r/blob/${SHA}`)).toBeNull();
    expect(parseShaBlobLink("http://[bad")).toBeNull();
  });
});

describe("parseCompareRange", () => {
  it("splits three-dot and two-dot ranges", () => {
    expect(parseCompareRange("main...feature")).toEqual({ base: "main", head: "feature" });
    expect(parseCompareRange("a..b")).toEqual({ base: "a", head: "b" });
    expect(parseCompareRange(`${SHA}...${"1".repeat(40)}`)).toEqual({ base: SHA, head: "1".repeat(40) });
  });
  it("supports fork syntax", () => {
    expect(parseCompareRange("owner:branch...other:branch")).toEqual({
      base: "owner:branch",
      head: "other:branch",
    });
  });
  it("supports refs containing single dots and slashes", () => {
    expect(parseCompareRange("v1.2.3...release/v1.3")).toEqual({ base: "v1.2.3", head: "release/v1.3" });
  });
  it("returns null without a separator or an empty side", () => {
    expect(parseCompareRange("main")).toBeNull();
    expect(parseCompareRange("")).toBeNull();
  });

  it("returns null when one side of the separator is empty", () => {
    expect(parseCompareRange("...b")).toBeNull();
    expect(parseCompareRange("a...")).toBeNull();
    expect(parseCompareRange("..b")).toBeNull();
  });
});

describe("shortSha", () => {
  it("abbreviates full shas only", () => {
    expect(shortSha(SHA)).toBe("e4413ee");
    expect(shortSha(SHA256)).toBe("aaaaaaa");
    expect(shortSha("E4413EEAE42E4F3853CA8AD80372E995B022509B")).toBe("E4413EE");
    expect(shortSha("main")).toBe("main");
    expect(shortSha("abc1234")).toBe("abc1234");
    expect(shortSha(`${SHA}~1`)).toBe(`${SHA}~1`);
  });
});
