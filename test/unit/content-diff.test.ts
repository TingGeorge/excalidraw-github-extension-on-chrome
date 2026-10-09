// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

type Mod = typeof import("../../src/content/diff");
let mod: Mod;

beforeAll(async () => {
  (globalThis as unknown as { chrome: unknown }).chrome ??= {
    runtime: { sendMessage: () => Promise.resolve(), onMessage: { addListener() {} } },
    storage: { sync: { get: async () => ({}) }, onChanged: { addListener() {}, removeListener() {} } },
  };
  mod = await import("../../src/content/diff");
});

const BASE = "e4413eeae42e4f3853ca8ad80372e995b022509b";
const HEAD = "2fa800062b33136871c6cd109d770279c9f88b4a";
const A = "a".repeat(40);
const B = "b".repeat(40);

const fixture = (name: string) => readFileSync(resolve(__dirname, "../fixtures/github", name), "utf8");
const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");

describe("shasFromText", () => {
  it("reads sha1/sha2 query parameters, including &amp; encoding", () => {
    expect(mod.shasFromText(`/o/r/diffs?sha1=${A}&sha2=${B}`)).toEqual({ base: A, head: B });
    expect(mod.shasFromText(`src="/o/r/diffs?sha1=${A}&amp;sha2=${B}"`)).toEqual({ base: A, head: B });
    expect(mod.shasFromText(`/x?foo=1&sha1=${A}&bar=2&sha2=${B}`)).toEqual({ base: A, head: B });
  });

  it("reads start_commit_oid / end_commit_oid in order", () => {
    expect(mod.shasFromText(`?start_commit_oid=${A}&amp;end_commit_oid=${B}`)).toEqual({ base: A, head: B });
  });

  it("reads end_commit_oid before start_commit_oid", () => {
    expect(mod.shasFromText(`?end_commit_oid=${B}&start_commit_oid=${A}`)).toEqual({ base: A, head: B });
    expect(mod.shasFromText(`?end_commit_oid=${B}&amp;start_commit_oid=${A}`)).toEqual({ base: A, head: B });
  });

  it("reads /diffs/A..B paths", () => {
    expect(mod.shasFromText(`/o/r/pull/1/diffs/${A}..${B}`)).toEqual({ base: A, head: B });
  });

  it("returns null when nothing matches", () => {
    expect(mod.shasFromText("")).toBeNull();
    expect(mod.shasFromText("nothing to see")).toBeNull();
    expect(mod.shasFromText(`sha1=${A.slice(1)}&sha2=${B}`)).toBeNull();
    expect(mod.shasFromText(`?sha1=${A}`)).toBeNull();
    expect(mod.shasFromText(`/diffs/${A}...${B}`)).toBeNull();
  });
});

describe("embeddedInfo", () => {
  it("finds sha1/sha2 in a commit payload", () => {
    const info = mod.embeddedInfo([JSON.stringify({ payload: { diff: { sha1: A, sha2: B } } })]);
    expect(info.base).toBe(A);
    expect(info.head).toBe(B);
    expect(info.files.size).toBe(0);
  });

  it("collects diff entries with oids and rename paths", () => {
    const info = mod.embeddedInfo([
      JSON.stringify({
        diffEntries: [
          { path: "new.excalidraw", oldOid: A, newOid: B, oldTreeEntry: { path: "old.excalidraw" } },
          { path: "same.excalidraw", oldOid: A, newOid: B, oldTreeEntry: { path: "same.excalidraw" } },
          { path: "added.excalidraw", newOid: B },
          { path: "no-oids.txt" },
        ],
      }),
    ]);
    expect(info.files.get("new.excalidraw")).toEqual({ oldPath: "old.excalidraw", oldOid: A, newOid: B });
    expect(info.files.get("same.excalidraw")?.oldPath).toBe("same.excalidraw");
    expect(info.files.get("added.excalidraw")).toEqual({ oldPath: undefined, oldOid: undefined, newOid: B });
    expect(info.files.has("no-oids.txt")).toBe(false);
  });

  it("recognises baseRefOid/headRefOid style pairs and keeps the first pair found", () => {
    const info = mod.embeddedInfo([
      JSON.stringify({ x: { baseRefOid: A, headRefOid: B } }),
      JSON.stringify({ sha1: "1".repeat(40), sha2: "2".repeat(40) }),
    ]);
    expect(info).toMatchObject({ base: A, head: B });
  });

  it("ignores malformed JSON and non-object values", () => {
    const info = mod.embeddedInfo([
      "{not json",
      "",
      "null",
      "42",
      '"str"',
      JSON.stringify({ sha1: A, sha2: B }),
    ]);
    expect(info).toMatchObject({ base: A, head: B });
  });

  it("returns an empty result for no input", () => {
    const info = mod.embeddedInfo([]);
    expect(info.base).toBeUndefined();
    expect(info.head).toBeUndefined();
    expect(info.files.size).toBe(0);
  });

  it("does not recurse forever on deep nesting", () => {
    let deep: unknown = { sha1: A, sha2: B };
    for (let i = 0; i < 30; i++) deep = { child: deep };
    expect(mod.embeddedInfo([JSON.stringify(deep)]).base).toBeUndefined();
  });
});

describe("findClassicFiles (real pr-files.html)", () => {
  const doc = parse(fixture("pr-files.html"));

  it("finds the .gitignore file with its slot and view-file link", () => {
    const files = mod.findClassicFiles(doc);
    const f = files.find((x) => x.path === ".gitignore");
    expect(f).toBeDefined();
    expect(f!.oldPath).toBe(".gitignore");
    expect(f!.deleted).toBe(false);
    expect(f!.header.classList.contains("file-header")).toBe(true);
    expect(f!.slot.closest(".file-actions")).not.toBeNull();
    expect(f!.viewFileHref).toContain(`/blob/${HEAD}/.gitignore`);
    expect(f!.before).toBe(f!.slot.firstElementChild);
  });

  it("has a path for every file", () => {
    const files = mod.findClassicFiles(doc);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(f.path).not.toBe("");
  });

  it("returns nothing for a document without diffs", () => {
    expect(mod.findClassicFiles(parse("<p>hi</p>"))).toEqual([]);
  });
});

describe("findReactFiles (real commit.html)", () => {
  const doc = parse(fixture("commit.html"));

  it("finds the .gitignore header and its slot", () => {
    const files = mod.findReactFiles(doc);
    const f = files.find((x) => x.path === ".gitignore");
    expect(f).toBeDefined();
    expect(f!.oldPath).toBe(".gitignore");
    expect(f!.deleted).toBe(false);
    expect(f!.header.className).toContain("DiffFileHeader-module__diff-file-header");
    expect(f!.slot.parentElement).toBe(f!.header);
  });

  it("returns nothing for a document without diffs", () => {
    expect(mod.findReactFiles(parse("<p>hi</p>"))).toEqual([]);
  });
});

describe("renames", () => {
  it("classic: reads old and new path from the file-info title", () => {
    const doc = parse(`
      <div class="file" data-tagsearch-path="new.excalidraw" data-file-deleted="false">
        <div class="file-header">
          <div class="file-info"><a title="old.excalidraw → new.excalidraw" href="#x">x</a></div>
          <div class="file-actions"><div class="d-flex"><button id="first"></button></div></div>
        </div>
      </div>`);
    const [f] = mod.findClassicFiles(doc);
    expect(f).toMatchObject({ path: "new.excalidraw", oldPath: "old.excalidraw" });
    expect(f!.slot.className).toBe("d-flex");
    expect(f!.before?.id).toBe("first");
    expect(f!.viewFileHref).toBeNull();
  });

  it("classic: marks deleted files and falls back to data-tagsearch-path", () => {
    const doc = parse(`
      <div class="file" data-tagsearch-path="gone.excalidraw" data-file-deleted="true">
        <div class="file-header"><div class="file-actions"></div></div>
      </div>`);
    const [f] = mod.findClassicFiles(doc);
    expect(f).toMatchObject({ path: "gone.excalidraw", oldPath: "gone.excalidraw", deleted: true });
  });

  it("classic: skips files without header or action slot", () => {
    const doc = parse(`
      <div class="file" data-tagsearch-path="a.excalidraw"></div>
      <div class="file" data-tagsearch-path="b.excalidraw"><div class="file-header"></div></div>`);
    expect(mod.findClassicFiles(doc)).toEqual([]);
  });

  it("react: reads rename titles, stripping bidi marks", () => {
    const doc = parse(`
      <div class="DiffFileHeader-module__diff-file-header__abc">
        <h3><a><code>‎old.excalidraw → new.excalidraw‎</code></a></h3>
        <div class="flex-justify-end">
          <button aria-haspopup="true" id="more"></button>
        </div>
      </div>`);
    const [f] = mod.findReactFiles(doc);
    expect(f).toMatchObject({ path: "new.excalidraw", oldPath: "old.excalidraw" });
    expect(f!.before?.id).toBe("more");
  });

  it("react: picks up the view-file link", () => {
    const doc = parse(`
      <div class="DiffFileHeader-module__diff-file-header__abc">
        <h3>a.excalidraw</h3>
        <div><a href="/o/r/blob/${HEAD}/a.excalidraw">View file</a></div>
      </div>`);
    const [f] = mod.findReactFiles(doc);
    expect(f!.viewFileHref).toContain(`/o/r/blob/${HEAD}/a.excalidraw`);
  });

  it("react: skips headers without a heading or slot", () => {
    const doc = parse(`
      <div class="DiffFileHeader-module__diff-file-header__abc"><div></div></div>
      <div class="DiffFileHeader-module__diff-file-header__abc"><h3>a.excalidraw</h3></div>`);
    expect(mod.findReactFiles(doc)).toEqual([]);
  });
});

describe("real GitHub fixtures: commit SHAs", () => {
  it("shasFromText finds base/head in the whole pr-files.html", () => {
    expect(mod.shasFromText(fixture("pr-files.html"))).toEqual({ base: BASE, head: HEAD });
  });

  it("embeddedInfo on commit.html's embedded JSON finds the same pair", () => {
    const doc = parse(fixture("commit.html"));
    const texts = [
      ...doc.querySelectorAll<HTMLScriptElement>(
        'script[type="application/json"][data-target$=".embeddedData"]',
      ),
    ].map((s) => s.textContent ?? "");
    expect(texts.length).toBeGreaterThan(0);
    const info = mod.embeddedInfo(texts);
    expect(info.base).toBe(BASE);
    expect(info.head).toBe(HEAD);
  });
});
