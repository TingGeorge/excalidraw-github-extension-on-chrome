import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  INLINE_HEIGHT_MAX,
  INLINE_HEIGHT_MIN,
  normalizeSettings,
} from "../../src/shared/settings";

describe("normalizeSettings", () => {
  it("returns defaults for non-objects", () => {
    for (const raw of [undefined, null, 0, "x", true, []]) {
      expect(normalizeSettings(raw)).toEqual(DEFAULT_SETTINGS);
    }
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it("returns a fresh object each time", () => {
    const a = normalizeSettings(null);
    a.autoInline = true;
    expect(DEFAULT_SETTINGS.autoInline).toBe(false);
    expect(normalizeSettings(null).autoInline).toBe(false);
  });

  it("accepts valid values", () => {
    expect(
      normalizeSettings({
        autoInline: true,
        sniffImages: false,
        diffButtons: false,
        theme: "dark",
        inlineHeight: 800,
      }),
    ).toEqual({ autoInline: true, sniffImages: false, diffButtons: false, theme: "dark", inlineHeight: 800 });
    expect(normalizeSettings({ theme: "light" }).theme).toBe("light");
    expect(normalizeSettings({ theme: "auto" }).theme).toBe("auto");
  });

  it("ignores values of the wrong type", () => {
    const s = normalizeSettings({
      autoInline: "yes",
      sniffImages: 0,
      diffButtons: null,
      theme: "purple",
      inlineHeight: "900",
    });
    expect(s).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ theme: 1 }).theme).toBe("auto");
  });

  it("ignores unknown keys", () => {
    expect(normalizeSettings({ foo: 1 })).toEqual(DEFAULT_SETTINGS);
    expect(Object.keys(normalizeSettings({ foo: 1 }))).not.toContain("foo");
  });

  it("clamps and rounds inlineHeight", () => {
    expect(normalizeSettings({ inlineHeight: 0 }).inlineHeight).toBe(INLINE_HEIGHT_MIN);
    expect(normalizeSettings({ inlineHeight: -500 }).inlineHeight).toBe(INLINE_HEIGHT_MIN);
    expect(normalizeSettings({ inlineHeight: 239 }).inlineHeight).toBe(INLINE_HEIGHT_MIN);
    expect(normalizeSettings({ inlineHeight: 240 }).inlineHeight).toBe(240);
    expect(normalizeSettings({ inlineHeight: 2000 }).inlineHeight).toBe(2000);
    expect(normalizeSettings({ inlineHeight: 99999 }).inlineHeight).toBe(INLINE_HEIGHT_MAX);
    expect(normalizeSettings({ inlineHeight: 600.4 }).inlineHeight).toBe(600);
    expect(normalizeSettings({ inlineHeight: 600.6 }).inlineHeight).toBe(601);
  });

  it("ignores NaN and Infinity", () => {
    expect(normalizeSettings({ inlineHeight: NaN }).inlineHeight).toBe(DEFAULT_SETTINGS.inlineHeight);
    expect(normalizeSettings({ inlineHeight: Infinity }).inlineHeight).toBe(DEFAULT_SETTINGS.inlineHeight);
    expect(normalizeSettings({ inlineHeight: -Infinity }).inlineHeight).toBe(DEFAULT_SETTINGS.inlineHeight);
  });
});
