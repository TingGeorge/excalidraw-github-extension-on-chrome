import { afterEach, describe, expect, it, vi } from "vitest";
import { bytesToBase64 } from "../../src/shared/files";
import { fetchFileContent, isAllowedFetchUrl, MAX_FILE_BYTES } from "../../src/shared/fetch";

describe("isAllowedFetchUrl", () => {
  it.each([
    "https://github.com/o/r/raw/main/a.excalidraw",
    "https://raw.githubusercontent.com/o/r/main/a.excalidraw",
    "https://media.githubusercontent.com/media/o/r/main/a.png",
    "https://objects.githubusercontent.com/x",
  ])("allows %s", (url) => {
    expect(isAllowedFetchUrl(url)).toBe(true);
  });

  it.each([
    "http://github.com/o/r/raw/main/a",
    "http://raw.githubusercontent.com/o/r",
    "https://evil-github.com/o/r",
    "https://github.com.evil.com/o/r",
    "https://evil.com/github.com",
    "https://githubusercontent.com/x",
    "https://notgithubusercontent.com/x",
    "https://evil.com/?u=https://github.com/",
    "https://user@evil.com@github.com.evil.com/",
    "javascript:alert(1)",
    "data:text/plain,hi",
    "file:///etc/passwd",
    "ftp://github.com/x",
    "/o/r/raw/main/a",
    "garbage",
    "",
  ])("rejects %j", (url) => {
    expect(isAllowedFetchUrl(url)).toBe(false);
  });
});

function response(
  body: BodyInit | null,
  init: { status?: number; headers?: Record<string, string>; url?: string } = {},
): Response {
  const res = new Response(body, { status: init.status ?? 200, headers: init.headers });
  Object.defineProperty(res, "url", { value: init.url ?? "https://raw.githubusercontent.com/o/r/main/a" });
  return res;
}

function stubFetch(impl: (...args: unknown[]) => Promise<Response> | Response) {
  const mock = vi.fn(async (...args: unknown[]) => impl(...args));
  vi.stubGlobal("fetch", mock);
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchFileContent", () => {
  const url = "https://github.com/o/r/raw/main/a.excalidraw";

  it("refuses disallowed URLs without fetching", async () => {
    const mock = stubFetch(() => response("x"));
    const res = await fetchFileContent("https://evil.com/a", false);
    expect(res).toMatchObject({ ok: false, status: 0 });
    expect(mock).not.toHaveBeenCalled();
  });

  it("returns text content and the final URL", async () => {
    const mock = stubFetch(() =>
      response('{"a":1}', {
        headers: { "content-type": "text/plain" },
        url: "https://raw.githubusercontent.com/o/r/main/a.excalidraw",
      }),
    );
    const res = await fetchFileContent(url, false);
    expect(res).toEqual({
      ok: true,
      content: { encoding: "text", data: '{"a":1}' },
      finalUrl: "https://raw.githubusercontent.com/o/r/main/a.excalidraw",
    });
    expect(mock).toHaveBeenCalledWith(
      url,
      expect.objectContaining({ credentials: "same-origin", redirect: "follow" }),
    );
  });

  it("passes credentials through", async () => {
    const mock = stubFetch(() => response("x"));
    await fetchFileContent(url, false, "include");
    expect(mock).toHaveBeenCalledWith(url, expect.objectContaining({ credentials: "include" }));
  });

  it("returns binary content as base64", async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 255, 128]);
    stubFetch(() => response(bytes, { headers: { "content-type": "image/png" } }));
    const res = await fetchFileContent(url, true);
    expect(res).toMatchObject({ ok: true, content: { encoding: "base64", data: bytesToBase64(bytes) } });
  });

  it("reports HTTP errors", async () => {
    stubFetch(() => response("nope", { status: 404 }));
    const res = await fetchFileContent(url, false);
    expect(res).toMatchObject({ ok: false, status: 404 });
    expect((res as { error: string }).error).toContain("404");
  });

  it("reports network errors", async () => {
    stubFetch(() => {
      throw new TypeError("Failed to fetch");
    });
    expect(await fetchFileContent(url, false)).toEqual({ ok: false, status: 0, error: "Failed to fetch" });
    stubFetch(() => Promise.reject("boom"));
    expect(await fetchFileContent(url, false)).toEqual({ ok: false, status: 0, error: "boom" });
  });

  it("rejects files whose content-length is too large", async () => {
    stubFetch(() => response("x", { headers: { "content-length": String(MAX_FILE_BYTES + 1) } }));
    const res = await fetchFileContent(url, false);
    expect(res).toMatchObject({ ok: false, status: 200 });
    expect((res as { error: string }).error).toMatch(/too large/i);
  });

  it("accepts files at exactly the limit", async () => {
    stubFetch(() => response("x", { headers: { "content-length": String(MAX_FILE_BYTES) } }));
    expect((await fetchFileContent(url, false)).ok).toBe(true);
  });

  it("treats a GitHub HTML page as signed out (401)", async () => {
    stubFetch(() =>
      response("<html>login</html>", {
        headers: { "content-type": "text/html; charset=utf-8" },
        url: "https://github.com/login?return_to=x",
      }),
    );
    expect(await fetchFileContent(url, false)).toMatchObject({ ok: false, status: 401 });
    expect(await fetchFileContent(url, true)).toMatchObject({ ok: false, status: 401 });
  });

  it("does not treat HTML from other hosts as a login page", async () => {
    stubFetch(() =>
      response("<html></html>", {
        headers: { "content-type": "text/html" },
        url: "https://raw.githubusercontent.com/o/r/main/page.html",
      }),
    );
    expect((await fetchFileContent("https://raw.githubusercontent.com/o/r/main/page.html", false)).ok).toBe(
      true,
    );
  });
});
