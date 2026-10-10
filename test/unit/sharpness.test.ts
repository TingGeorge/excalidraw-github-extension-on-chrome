import { describe, expect, it } from "vitest";
import { fitView, snapView, zoomView, type View } from "../../src/shared/viewport";
import { snapTranslation, type Transform2D } from "../../src/viewer/pixel-snap";

const identity: Transform2D = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const device = (t: Transform2D, x: number, y: number) => [t.a * x + t.c * y + t.e, t.b * x + t.d * y + t.f];
const isWhole = (v: number) => Math.abs(v - Math.round(v)) < 1e-9;

describe("snapTranslation", () => {
  it("moves a copy at a fractional position onto whole device pixels", () => {
    // Excalidraw's static canvas at zoom 0.37: scale(zoom) with a fractional offset.
    const t = { a: 0.37, b: 0, c: 0, d: 0.37, e: 10.25, f: 3.6 };
    const snapped = snapTranslation(t, 123.4, 56.7)!;
    const [x, y] = device({ ...t, ...snapped }, 123.4, 56.7);
    expect(isWhole(x!) && isWhole(y!)).toBe(true);
    // never by more than half a pixel
    const [x0, y0] = device(t, 123.4, 56.7);
    expect(Math.abs(x! - x0!)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(y! - y0!)).toBeLessThanOrEqual(0.5);
  });

  it("breaks exact half-pixel ties the same way despite float noise", () => {
    const a = snapTranslation(identity, 639.5, 10)!;
    const b = snapTranslation(identity, 639.4999999999, 10)!;
    expect(device({ ...identity, ...a }, 639.5, 10)[0]).toBe(640);
    expect(Math.round(device({ ...identity, ...b }, 639.4999999999, 10)[0]!)).toBe(640);
  });

  it("leaves copies that are already on the grid alone", () => {
    expect(snapTranslation({ a: 2, b: 0, c: 0, d: 2, e: 4, f: 6 }, 10, 20)).toBeNull();
  });

  it("handles quarter turns but not other rotations", () => {
    const quarter = { a: 6e-17, b: 1, c: -1, d: 6e-17, e: 100.3, f: 50.7 };
    const snapped = snapTranslation(quarter, 12.2, 8.9)!;
    const [x, y] = device({ ...quarter, ...snapped }, 12.2, 8.9);
    expect(isWhole(x!) && isWhole(y!)).toBe(true);
    const c = Math.cos(0.3);
    const s = Math.sin(0.3);
    expect(snapTranslation({ a: c, b: s, c: -s, d: c, e: 10.5, f: 3.5 }, 1, 1)).toBeNull();
  });
});

describe("fitView", () => {
  const viewport = { width: 1000, height: 500 };

  it("centres the bounds and fills 90% of the tighter side, in whole percent", () => {
    const view = fitView([0, 0, 2000, 400], viewport)!;
    expect(view.zoom).toBe(0.45); // 1000 / 2000 * 0.9
    const centreX = (1000 + view.scrollX) * view.zoom;
    const centreY = (200 + view.scrollY) * view.zoom;
    expect(centreX).toBeCloseTo(500, 0);
    expect(centreY).toBeCloseTo(250, 0);
  });

  it("rounds the zoom down so the drawing always fits", () => {
    const view = fitView([0, 0, 1000 / 0.947, 10], viewport, { fill: 1 })!;
    expect(view.zoom).toBe(0.94);
  });

  it("does not enlarge small drawings past maxZoom, and keeps within Excalidraw's range", () => {
    expect(fitView([0, 0, 50, 50], viewport)!.zoom).toBe(1);
    expect(fitView([0, 0, 50, 50], viewport, { maxZoom: 1.5 })!.zoom).toBe(1.5);
    expect(fitView([0, 0, 1e7, 1e7], viewport)!.zoom).toBe(0.1);
    expect(fitView([5, 5, 5, 5], viewport)!.zoom).toBe(1);
  });

  it("puts the scene origin on a whole device pixel", () => {
    for (const dpr of [1, 1.25, 1.5, 2, 2.2]) {
      const view = fitView([0.37, 0.61, 1234.5, 777.7], { width: 1262, height: 549 }, { dpr })!;
      expect(isWhole(view.scrollX * view.zoom * dpr)).toBe(true);
      expect(isWhole(view.scrollY * view.zoom * dpr)).toBe(true);
    }
  });

  it("returns null without a usable viewport or bounds", () => {
    expect(fitView([0, 0, 10, 10], { width: 0, height: 500 })).toBeNull();
    expect(fitView([Infinity, Infinity, -Infinity, -Infinity], viewport)).toBeNull();
  });
});

describe("zoomView / snapView", () => {
  it("zooms around the viewport centre", () => {
    const start: View = { zoom: 1, scrollX: -100, scrollY: -50 };
    const vp = { width: 800, height: 600 };
    const sceneAtCentre = (v: View) => [
      vp.width / 2 / v.zoom - v.scrollX,
      vp.height / 2 / v.zoom - v.scrollY,
    ];
    const next = zoomView(start, vp, 1.2);
    expect(next.zoom).toBeCloseTo(1.2);
    const [x0, y0] = sceneAtCentre(start);
    const [x1, y1] = sceneAtCentre(next);
    expect(x1).toBeCloseTo(x0!, 0);
    expect(y1).toBeCloseTo(y0!, 0);
    expect(zoomView(start, vp, null).zoom).toBe(1);
    expect(zoomView(start, vp, 1000).zoom).toBe(30);
  });

  it("moves the view by less than half a device pixel", () => {
    const view = { zoom: 0.73, scrollX: 12.3456, scrollY: -7.891 };
    const snapped = snapView(view, 2);
    expect(Math.abs((snapped.scrollX - view.scrollX) * 0.73 * 2)).toBeLessThanOrEqual(0.5);
    expect(Math.abs((snapped.scrollY - view.scrollY) * 0.73 * 2)).toBeLessThanOrEqual(0.5);
    expect(snapView({ zoom: 0, scrollX: 1.5, scrollY: 2.5 }, 2)).toEqual({
      zoom: 0,
      scrollX: 1.5,
      scrollY: 2.5,
    });
  });
});
