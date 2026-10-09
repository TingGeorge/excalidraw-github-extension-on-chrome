import { describe, expect, it } from "vitest";
import { __test, t } from "../../src/shared/i18n";

const { pickLocale } = __test;

describe("pickLocale", () => {
  it.each([
    [["zh-TW"], "zh-TW"],
    [["zh-tw"], "zh-TW"],
    [["zh-HK"], "zh-TW"],
    [["zh-MO"], "zh-TW"],
    [["zh-Hant"], "zh-TW"],
    [["zh-Hant-TW"], "zh-TW"],
    [["zh-Hant-HK"], "zh-TW"],
    [["zh-CN"], "en"],
    [["zh-Hans"], "en"],
    [["zh"], "en"],
    [["en"], "en"],
    [["en-US"], "en"],
    [["en-GB", "zh-TW"], "en"],
    [["zh-TW", "en-US"], "zh-TW"],
    [["ja", "zh-TW"], "zh-TW"],
    [["ja", "fr"], "en"],
    [["fr", "en-US"], "en"],
    [[], "en"],
  ] as Array<[string[], string]>)("%j -> %s", (langs, expected) => {
    expect(pickLocale(langs)).toBe(expected);
  });
});

describe("t", () => {
  it("returns a non-empty string", () => {
    expect(typeof t("preview")).toBe("string");
    expect(t("preview").length).toBeGreaterThan(0);
  });

  it("interpolates {n}", () => {
    const out = t("libraryItems", { n: 12 });
    expect(out).toContain("12");
    expect(out).not.toContain("{n}");
    expect(t("libraryItems", { n: "x" })).toContain("x");
  });

  it("leaves the string alone without vars", () => {
    expect(t("libraryItems")).toContain("{n}");
  });
});
