/**
 * Keep Excalidraw's canvas sharp.
 *
 * Excalidraw 0.18 paints every element from a cached bitmap and copies it onto
 * the canvas with image smoothing off, at the element's exact device position —
 * which is usually fractional. On GPU-accelerated canvases (most real browsers)
 * a copy that lands on a half pixel takes some rows from the neighbouring row,
 * so text and strokes come out doubled or smeared. Which elements suffer depends
 * on the zoom and scroll, so a view can look soft until it is zoomed, and
 * "fit to content" — which centres the drawing, often on a half pixel — makes it
 * soft again. Upstream fixed this after 0.18.1 by snapping these copies to whole
 * device pixels (excalidraw/excalidraw#12063); this does the same for our pages.
 */

/** Breaks exact half-pixel ties the same way on every frame despite float noise. */
const TIE_BIAS = 1e-6;
const EPSILON = 1e-9;

export interface Transform2D {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/**
 * The translation that puts a copy drawn at (dx, dy) under `t` on whole device
 * pixels, or null if it already is there or the transform rotates by an angle
 * other than a multiple of 90° (such copies are smoothed anyway).
 */
export function snapTranslation(t: Transform2D, dx: number, dy: number): { e: number; f: number } | null {
  const axisAligned = Math.abs(t.b) < EPSILON && Math.abs(t.c) < EPSILON;
  const quarterTurn = Math.abs(t.a) < EPSILON && Math.abs(t.d) < EPSILON;
  if (!axisAligned && !quarterTurn) return null;
  const x = t.a * dx + t.c * dy + t.e;
  const y = t.b * dx + t.d * dy + t.f;
  const ex = Math.round(x + TIE_BIAS) - x;
  const ey = Math.round(y + TIE_BIAS) - y;
  if (ex === 0 && ey === 0) return null;
  return { e: t.e + ex, f: t.f + ey };
}

let installed = false;

/** Snap Excalidraw's cached-bitmap copies on its canvases to whole device pixels. */
export function installPixelSnapping(): void {
  if (installed || typeof CanvasRenderingContext2D === "undefined") return;
  installed = true;
  const proto = CanvasRenderingContext2D.prototype;
  const drawImage = proto.drawImage as (this: CanvasRenderingContext2D, ...args: unknown[]) => void;
  proto.drawImage = function (this: CanvasRenderingContext2D, ...args: unknown[]) {
    // Excalidraw turns smoothing off exactly for the copies it means to be crisp
    // (and leaves it on mid-zoom and for rotated elements).
    if (
      !this.imageSmoothingEnabled &&
      args[0] instanceof HTMLCanvasElement &&
      this.canvas instanceof HTMLCanvasElement &&
      this.canvas.classList.contains("excalidraw__canvas")
    ) {
      const [dx, dy] = args.length === 9 ? [args[5], args[6]] : [args[1], args[2]];
      if (typeof dx === "number" && typeof dy === "number") {
        const t = this.getTransform();
        const snapped = snapTranslation(t, dx, dy);
        if (snapped) {
          this.setTransform(t.a, t.b, t.c, t.d, snapped.e, snapped.f);
          try {
            drawImage.apply(this, args);
          } finally {
            this.setTransform(t);
          }
          return;
        }
      }
    }
    drawImage.apply(this, args);
  } as typeof proto.drawImage;
}
