/**
 * Viewport math for Excalidraw's coordinate system: a scene point (x, y) is drawn
 * at ((x + scrollX) * zoom, (y + scrollY) * zoom) CSS pixels.
 */
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 30;

export interface View {
  zoom: number;
  scrollX: number;
  scrollY: number;
}

export type SceneBounds = readonly [minX: number, minY: number, maxX: number, maxY: number];

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Put the scene origin on a whole device pixel. Excalidraw draws at
 * `(x + scroll) * zoom * devicePixelRatio`, so this only moves the view by less
 * than half a device pixel.
 */
export function snapView(view: View, dpr: number): View {
  const k = view.zoom * dpr;
  if (!(k > 0) || !Number.isFinite(k)) return view;
  return {
    zoom: view.zoom,
    scrollX: Math.round(view.scrollX * k) / k,
    scrollY: Math.round(view.scrollY * k) / k,
  };
}

/**
 * The view that shows `bounds` centred in a `width` × `height` viewport, using
 * `fill` of it (Excalidraw's "zoom to fit" uses 0.9), at most `maxZoom`. The
 * zoom is rounded down to whole percent so the zoom label reads exactly.
 */
export function fitView(
  bounds: SceneBounds,
  viewport: { width: number; height: number },
  { fill = 0.9, maxZoom = 1, dpr = 1 }: { fill?: number; maxZoom?: number; dpr?: number } = {},
): View | null {
  const [x1, y1, x2, y2] = bounds;
  if (![x1, y1, x2, y2].every(Number.isFinite) || viewport.width <= 0 || viewport.height <= 0) return null;
  const w = Math.max(x2 - x1, 1);
  const h = Math.max(y2 - y1, 1);
  const raw = Math.min(viewport.width / w, viewport.height / h) * fill;
  const zoom = clamp(Math.floor(raw * 100 + 1e-9) / 100, MIN_ZOOM, clamp(maxZoom, MIN_ZOOM, MAX_ZOOM));
  return snapView(
    {
      zoom,
      scrollX: viewport.width / 2 / zoom - (x1 + x2) / 2,
      scrollY: viewport.height / 2 / zoom - (y1 + y2) / 2,
    },
    dpr,
  );
}

/** Zoom by `factor` (or to 100% for null), keeping the viewport centre in place. */
export function zoomView(
  current: View,
  viewport: { width: number; height: number },
  factor: number | null,
  dpr = 1,
): View {
  const zoom = clamp(factor === null ? 1 : current.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  const cx = viewport.width / 2;
  const cy = viewport.height / 2;
  return snapView(
    {
      zoom,
      scrollX: current.scrollX + cx / zoom - cx / current.zoom,
      scrollY: current.scrollY + cy / zoom - cy / current.zoom,
    },
    dpr,
  );
}
