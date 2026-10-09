import { describe, expect, it } from "vitest";
import { describeElement, diffScenes, visualSignature } from "../../src/shared/diff";
import type { ElementLike } from "../../src/shared/geometry";

type El = ElementLike & Record<string, unknown>;

function rect(id: string, extra: Record<string, unknown> = {}): El {
  return { id, type: "rectangle", x: 0, y: 0, width: 100, height: 50, ...extra };
}

describe("diffScenes", () => {
  it("counts added, removed, modified and unchanged", () => {
    const base = [rect("keep"), rect("change"), rect("gone")];
    const head = [rect("keep"), rect("change", { x: 10 }), rect("new")];
    const d = diffScenes(base, head);
    expect(d).toMatchObject({ added: 1, removed: 1, modified: 1, unchanged: 1 });
    expect(d.changes.map((c) => [c.kind, c.id])).toEqual([
      ["added", "new"],
      ["modified", "change"],
      ["removed", "gone"],
    ]);
  });

  it("reports empty diffs for identical and empty scenes", () => {
    expect(diffScenes([], [])).toMatchObject({
      changes: [],
      added: 0,
      removed: 0,
      modified: 0,
      unchanged: 0,
    });
    const d = diffScenes([rect("a")], [rect("a")]);
    expect(d.changes).toEqual([]);
    expect(d.unchanged).toBe(1);
  });

  it("populates before/after on each kind", () => {
    const a1 = rect("a");
    const a2 = rect("a", { width: 5 });
    const d = diffScenes([a1, rect("r")], [a2, rect("n")]);
    const mod = d.changes.find((c) => c.kind === "modified")!;
    expect(mod.before).toBe(a1);
    expect(mod.after).toBe(a2);
    const add = d.changes.find((c) => c.kind === "added")!;
    expect(add.before).toBeUndefined();
    expect(add.after?.id).toBe("n");
    const rem = d.changes.find((c) => c.kind === "removed")!;
    expect(rem.after).toBeUndefined();
    expect(rem.before?.id).toBe("r");
  });

  it("ignores deleted elements on both sides", () => {
    const d = diffScenes(
      [rect("a", { isDeleted: true }), rect("b"), rect("c", { isDeleted: true })],
      [rect("a"), rect("b", { isDeleted: true }), rect("c", { isDeleted: true })],
    );
    // a: deleted in base, live in head -> added. b: live in base, deleted in head -> removed. c: gone both.
    expect(d.changes.map((c) => [c.kind, c.id])).toEqual([
      ["added", "a"],
      ["removed", "b"],
    ]);
    expect(d.unchanged).toBe(0);
  });

  it("does not count volatile keys as modifications", () => {
    const base = [
      rect("a", { version: 1, versionNonce: 1, updated: 1, seed: 1, index: "a0", boundElements: [] }),
    ];
    const head = [
      rect("a", {
        version: 9,
        versionNonce: 99,
        updated: 12345,
        seed: 777,
        index: "a5",
        boundElements: [{ id: "x", type: "arrow" }],
        lastCommittedPoint: [1, 2],
      }),
    ];
    const d = diffScenes(base, head);
    expect(d.modified).toBe(0);
    expect(d.unchanged).toBe(1);
  });

  it("ignores floating point noise but detects real changes", () => {
    expect(diffScenes([rect("a", { x: 10.0001 })], [rect("a", { x: 10.0004 })]).modified).toBe(0);
    expect(diffScenes([rect("a", { x: 0.1 + 0.2 })], [rect("a", { x: 0.3 })]).modified).toBe(0);
    expect(diffScenes([rect("a", { x: 10 })], [rect("a", { x: 10.01 })]).modified).toBe(1);
  });

  it("is insensitive to key order and undefined values", () => {
    const a = { id: "a", type: "rectangle", x: 0, y: 0, width: 1, height: 1, strokeColor: "#000" };
    const b = {
      strokeColor: "#000",
      height: 1,
      width: 1,
      y: 0,
      x: 0,
      type: "rectangle",
      id: "a",
      extra: undefined,
    };
    expect(diffScenes([a], [b]).modified).toBe(0);
  });

  it("detects changes in nested data such as points", () => {
    const base = [
      rect("l", {
        type: "line",
        points: [
          [0, 0],
          [10, 10],
        ],
      }),
    ];
    const head = [
      rect("l", {
        type: "line",
        points: [
          [0, 0],
          [10, 20],
        ],
      }),
    ];
    expect(diffScenes(base, head).modified).toBe(1);
  });

  it("reports a bound text label change on the CONTAINER", () => {
    const box = rect("box", { boundElements: [{ id: "t", type: "text" }] });
    const baseText = rect("t", { type: "text", text: "old", containerId: "box" });
    const headText = rect("t", { type: "text", text: "new", containerId: "box" });
    const d = diffScenes([box, baseText], [box, headText]);
    expect(d.changes).toHaveLength(1);
    expect(d.changes[0]).toMatchObject({ kind: "modified", id: "box", type: "rectangle" });
    expect(d.changes[0]!.label).toBe("rectangle “new”");
    expect(d.modified).toBe(1);
    // box (folded in as modified) and text (the modified one) are both accounted for.
    expect(d.unchanged).toBe(0);
    expect(d.added + d.removed + d.modified + d.unchanged).toBe(1);
  });

  it("keeps unchanged consistent when other elements are untouched", () => {
    const box = rect("box", { boundElements: [{ id: "t", type: "text" }] });
    const other = rect("other");
    const d = diffScenes(
      [box, rect("t", { type: "text", text: "a", containerId: "box" }), other],
      [box, rect("t", { type: "text", text: "b", containerId: "box" }), other],
    );
    expect(d.modified).toBe(1);
    expect(d.unchanged).toBe(1);
    expect(d.changes.map((c) => c.id)).toEqual(["box"]);
  });

  it("does not double-report when container and its text both change", () => {
    const box1 = rect("box", { boundElements: [{ id: "t", type: "text" }] });
    const box2 = rect("box", { boundElements: [{ id: "t", type: "text" }], x: 50 });
    const d = diffScenes(
      [box1, rect("t", { type: "text", text: "a", containerId: "box" })],
      [box2, rect("t", { type: "text", text: "b", containerId: "box" })],
    );
    expect(d.changes.map((c) => [c.kind, c.id])).toEqual([["modified", "box"]]);
    expect(d.unchanged).toBe(0);
  });

  it("reports an added labelled container once (label folded into it)", () => {
    const box = rect("box", { boundElements: [{ id: "t", type: "text" }] });
    const d = diffScenes([], [box, rect("t", { type: "text", text: "Hello", containerId: "box" })]);
    expect(d.added).toBe(1);
    expect(d.changes.find((c) => c.id === "box")!.label).toBe("rectangle “Hello”");
  });

  it("reports a label added to an existing container as modification of the container", () => {
    const d = diffScenes(
      [rect("box")],
      [
        rect("box", { boundElements: [{ id: "t", type: "text" }] }),
        rect("t", { type: "text", text: "new label", containerId: "box" }),
      ],
    );
    expect(d.changes.map((c) => [c.kind, c.id])).toEqual([["modified", "box"]]);
    expect(d.unchanged).toBe(0);
  });

  it("orders added, then modified, then removed", () => {
    const d = diffScenes(
      [rect("r1"), rect("m1"), rect("r2"), rect("m2")],
      [rect("a1"), rect("m1", { x: 1 }), rect("a2"), rect("m2", { x: 1 })],
    );
    expect(d.changes.map((c) => c.kind)).toEqual([
      "added",
      "added",
      "modified",
      "modified",
      "removed",
      "removed",
    ]);
  });
});

describe("describeElement", () => {
  it("returns just the type without text", () => {
    expect(describeElement(rect("a"))).toBe("rectangle");
    expect(describeElement(rect("a", { text: "" }))).toBe("rectangle");
  });

  it("includes element text with curly quotes", () => {
    expect(describeElement(rect("a", { type: "text", text: "Viewer tab" }))).toBe("text “Viewer tab”");
  });

  it("collapses whitespace and newlines", () => {
    expect(describeElement(rect("a", { type: "text", text: "  one\n\ntwo\t three  " }))).toBe(
      "text “one two three”",
    );
  });

  it("truncates to 40 characters including the ellipsis", () => {
    const long = "x".repeat(60);
    const out = describeElement(rect("a", { type: "text", text: long }));
    expect(out).toBe(`text “${"x".repeat(39)}…”`);
    const exactly40 = "y".repeat(40);
    expect(describeElement(rect("a", { type: "text", text: exactly40 }))).toBe(`text “${exactly40}”`);
  });

  it("looks up the bound label of containers", () => {
    const box = rect("box", { boundElements: [{ id: "t", type: "text" }] });
    const all = new Map<string, ElementLike>([
      ["box", box],
      ["t", rect("t", { type: "text", text: "Inside" })],
    ]);
    expect(describeElement(box, all)).toBe("rectangle “Inside”");
  });

  it("ignores non-text bound elements and missing labels", () => {
    const box = rect("box", { boundElements: [{ id: "arrow", type: "arrow" }] });
    const all = new Map<string, ElementLike>([["arrow", rect("arrow", { type: "arrow", text: "nope" })]]);
    expect(describeElement(box, all)).toBe("rectangle");
    const dangling = rect("d", { boundElements: [{ id: "missing", type: "text" }] });
    expect(describeElement(dangling, all)).toBe("rectangle");
    expect(describeElement(dangling)).toBe("rectangle");
  });
});

describe("visualSignature", () => {
  it("is stable across key order and strips volatile keys", () => {
    expect(visualSignature(rect("a", { seed: 1 }))).toBe(visualSignature(rect("a", { seed: 2 })));
    expect(visualSignature(rect("a"))).not.toBe(visualSignature(rect("b")));
  });
});
