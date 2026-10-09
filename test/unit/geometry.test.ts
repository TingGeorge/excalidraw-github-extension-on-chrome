import { describe, expect, it } from "vitest";
import { commonBounds, elementBounds, type ElementLike } from "../../src/shared/geometry";

const el = (extra: Partial<ElementLike> = {}): ElementLike => ({
  id: "a",
  type: "rectangle",
  x: 10,
  y: 20,
  width: 100,
  height: 50,
  ...extra,
});

describe("elementBounds", () => {
  it("returns the box for a plain element", () => {
    expect(elementBounds(el())).toEqual([10, 20, 110, 70]);
  });

  it("normalises negative width/height", () => {
    expect(elementBounds(el({ width: -100, height: -50 }))).toEqual([-90, -30, 10, 20]);
    expect(elementBounds(el({ width: -100 }))).toEqual([-90, 20, 10, 70]);
  });

  it("handles zero-size elements", () => {
    expect(elementBounds(el({ width: 0, height: 0 }))).toEqual([10, 20, 10, 20]);
  });

  it("uses points for linear elements", () => {
    const b = elementBounds(
      el({
        type: "line",
        width: 0,
        height: 0,
        points: [
          [0, 0],
          [50, -10],
          [30, 40],
        ],
      }),
    );
    expect(b).toEqual([10, 10, 60, 60]);
  });

  it("falls back to the box when points is empty", () => {
    expect(elementBounds(el({ points: [] }))).toEqual([10, 20, 110, 70]);
  });

  it("rotates 90 degrees around the element centre", () => {
    // centre (60, 45); a 100x50 box becomes 50x100 around the same centre.
    const [minX, minY, maxX, maxY] = elementBounds(el({ angle: Math.PI / 2 }));
    expect(minX).toBeCloseTo(35);
    expect(maxX).toBeCloseTo(85);
    expect(minY).toBeCloseTo(-5);
    expect(maxY).toBeCloseTo(95);
  });

  it("rotating 180 degrees keeps the box", () => {
    const b = elementBounds(el({ angle: Math.PI }));
    expect(b[0]).toBeCloseTo(10);
    expect(b[1]).toBeCloseTo(20);
    expect(b[2]).toBeCloseTo(110);
    expect(b[3]).toBeCloseTo(70);
  });

  it("rotates 45 degrees to a larger axis-aligned box", () => {
    const b = elementBounds(el({ width: 100, height: 100, angle: Math.PI / 4, x: 0, y: 0 }));
    const half = (100 * Math.SQRT2) / 2;
    expect(b[0]).toBeCloseTo(50 - half);
    expect(b[2]).toBeCloseTo(50 + half);
  });

  it("treats angle 0 / undefined identically", () => {
    expect(elementBounds(el({ angle: 0 }))).toEqual(elementBounds(el()));
  });
});

describe("commonBounds", () => {
  it("returns null for empty input", () => {
    expect(commonBounds([])).toBeNull();
  });

  it("returns null when all elements are deleted", () => {
    expect(commonBounds([el({ isDeleted: true })])).toBeNull();
  });

  it("unions the bounds of live elements", () => {
    const b = commonBounds([
      el(),
      el({ id: "b", x: -50, y: 100, width: 10, height: 10 }),
      el({ id: "c", x: 1000, y: 1000, isDeleted: true }),
    ]);
    expect(b).toEqual([-50, 20, 110, 110]);
  });

  it("returns a single element's bounds", () => {
    expect(commonBounds([el()])).toEqual([10, 20, 110, 70]);
  });
});
