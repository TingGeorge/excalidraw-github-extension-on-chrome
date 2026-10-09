import { describe, expect, it } from "vitest";
import { parseCompareSide } from "../../src/shared/github";
import { neutralizeElements } from "../../src/shared/sanitize";

describe("neutralizeElements", () => {
  it("turns iframe and embeddable elements into plain dashed boxes", () => {
    const out = neutralizeElements([
      { id: "a", type: "iframe", link: null, customData: { generationData: { html: "<script>x</script>" } } },
      { id: "b", type: "embeddable", link: "https://www.youtube.com/watch?v=x" },
      { id: "c", type: "rectangle" },
    ]);
    expect(out.map((e) => e.type)).toEqual(["rectangle", "rectangle", "rectangle"]);
    expect(out[0]).not.toHaveProperty("customData");
    expect(out[0]).toMatchObject({ strokeStyle: "dashed" });
    // the link stays so the user can open it deliberately
    expect(out[1]).toMatchObject({ link: "https://www.youtube.com/watch?v=x" });
  });

  it("leaves other elements untouched (same objects)", () => {
    const el = { id: "c", type: "text", text: "hi" };
    expect(neutralizeElements([el])[0]).toBe(el);
  });
});

describe("parseCompareSide", () => {
  const repo = { owner: "o", repo: "r" };
  it("plain branch stays in the repository", () => {
    expect(parseCompareSide("feature/x", repo)).toEqual({ repo, ref: "feature/x" });
  });
  it("owner:branch is a fork with the same name", () => {
    expect(parseCompareSide("someone:fix", repo)).toEqual({
      repo: { owner: "someone", repo: "r" },
      ref: "fix",
    });
  });
  it("owner:repo:branch names the fork repository", () => {
    expect(parseCompareSide("someone:fork:fix/a", repo)).toEqual({
      repo: { owner: "someone", repo: "fork" },
      ref: "fix/a",
    });
  });
});
