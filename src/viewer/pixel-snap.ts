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
 *
 * Excalidraw also sizes its canvas to `cssSize * devicePixelRatio`, which the
 * browser truncates: at fractional ratios (page zoom 90%/110%, 125% screens) the
 * canvas ends up a pixel smaller than the box it is shown in, and the whole
 * drawing is rescaled. Its canvases get exactly the device pixels of their box.
 */

/** Breaks exact half-pixel ties the same way on every frame despite float noise. */
const TIE_BIAS = 1e-6;
/**
 * How far from axis-aligned a transform may be and still count as a multiple of
 * 90°. Excalidraw keeps smoothing off for angles within |sin 2θ| < 1e-4.
 */
const ANGLE_TOLERANCE = 1e-4;

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
  const straight = Math.max(Math.abs(t.a), Math.abs(t.d));
  const turned = Math.max(Math.abs(t.b), Math.abs(t.c));
  const axisAligned = turned <= straight * ANGLE_TOLERANCE;
  const quarterTurn = straight <= turned * ANGLE_TOLERANCE;
  if (!axisAligned && !quarterTurn) return null;
  const x = t.a * dx + t.c * dy + t.e;
  const y = t.b * dx + t.d * dy + t.f;
  const ex = Math.round(x + TIE_BIAS) - x;
  const ey = Math.round(y + TIE_BIAS) - y;
  if (ex === 0 && ey === 0) return null;
  return { e: t.e + ex, f: t.f + ey };
}

/**
 * The number of device pixels a canvas box spanning `start`–`end` (CSS pixels from
 * the viewport origin) really covers, for a requested `cssSize * devicePixelRatio`.
 * Layout snaps each edge to the device pixel grid, so this can differ from the
 * request by one; anything further off means the measurement is stale.
 */
export function deviceExtent(requested: number, start: number, end: number, dpr: number): number {
  const covered = Math.round(end * dpr) - Math.round(start * dpr);
  return covered > 0 && Math.abs(covered - requested) <= 1 ? covered : Math.round(requested);
}

const isExcalidrawCanvas = (canvas: HTMLCanvasElement) => canvas.classList.contains("excalidraw__canvas");

/** Give Excalidraw's canvases (it sets `canvas.width/height` itself) exactly the device pixels of their box. */
function installCanvasSizing(): void {
  const proto = HTMLCanvasElement.prototype;
  for (const axis of ["width", "height"] as const) {
    const native = Object.getOwnPropertyDescriptor(proto, axis);
    if (!native?.get || !native.set) continue;
    const set = native.set;
    Object.defineProperty(proto, axis, {
      configurable: true,
      enumerable: native.enumerable,
      get: native.get,
      set(this: HTMLCanvasElement, value: number) {
        if (value > 0 && this.isConnected && isExcalidrawCanvas(this)) {
          const box = this.getBoundingClientRect();
          const [start, end] = axis === "width" ? [box.left, box.right] : [box.top, box.bottom];
          value = deviceExtent(value, start, end, window.devicePixelRatio);
        }
        set.call(this, value);
      },
    });
  }
}

let installed = false;

/** Keep Excalidraw's canvases on the device pixel grid (see above). */
export function installPixelSnapping(): void {
  if (installed || typeof CanvasRenderingContext2D === "undefined") return;
  installed = true;
  installCanvasSizing();
  const proto = CanvasRenderingContext2D.prototype;
  const drawImage = proto.drawImage as (this: CanvasRenderingContext2D, ...args: unknown[]) => void;
  proto.drawImage = function (this: CanvasRenderingContext2D, ...args: unknown[]) {
    // Excalidraw turns smoothing off exactly for the copies it means to be crisp
    // (and leaves it on mid-zoom and for rotated elements).
    if (
      !this.imageSmoothingEnabled &&
      args[0] instanceof HTMLCanvasElement &&
      this.canvas instanceof HTMLCanvasElement &&
      isExcalidrawCanvas(this.canvas)
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
