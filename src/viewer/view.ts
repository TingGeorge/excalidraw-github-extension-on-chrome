/**
 * Viewport helpers shared by the viewers. Views are set instantly and on whole
 * device pixels: Excalidraw's own animated scrollToContent renders from stretched
 * bitmaps while it runs, which made "fit to content" visibly blur the drawing.
 */
import { CaptureUpdateAction, getCommonBounds } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { fitView, type View } from "../shared/viewport";

export function currentView(api: ExcalidrawImperativeAPI): View {
  const st = api.getAppState();
  return { zoom: st.zoom.value, scrollX: st.scrollX, scrollY: st.scrollY };
}

/** Jump to `view`, with every element re-rendered at full resolution. */
export function applyView(api: ExcalidrawImperativeAPI, view: View): void {
  api.updateScene({
    appState: {
      zoom: { value: view.zoom } as never,
      scrollX: view.scrollX,
      scrollY: view.scrollY,
      // Never leave the "reuse bitmaps while zooming" mode on after a jump.
      shouldCacheIgnoreZoom: false,
    },
    captureUpdate: CaptureUpdateAction.NEVER,
  });
}

/** The view that fits `elements` (default: the whole scene) into this canvas. */
export function fitElementsView(
  api: ExcalidrawImperativeAPI,
  elements: readonly ExcalidrawElement[] = api.getSceneElements(),
  options: { fill?: number; maxZoom?: number } = {},
): View | null {
  const live = elements.filter((e) => !e.isDeleted);
  if (live.length === 0) return null;
  const { width, height } = api.getAppState();
  return fitView(getCommonBounds(live), { width, height }, { ...options, dpr: window.devicePixelRatio });
}

/**
 * Call `onChange` whenever devicePixelRatio changes (page zoom, moving the
 * window to another screen, or an embedded frame learning its real density).
 */
export function watchDevicePixelRatio(onChange: () => void): () => void {
  let query: MediaQueryList | null = null;
  const listen = () => {
    query?.removeEventListener("change", handler);
    query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    query.addEventListener("change", handler);
  };
  function handler() {
    listen();
    onChange();
  }
  listen();
  return () => query?.removeEventListener("change", handler);
}

/**
 * Excalidraw caches each element's bitmap per element object and only redraws
 * it when the zoom changes, not when devicePixelRatio does — stale bitmaps are
 * drawn at the wrong size and resolution. New objects get new bitmaps.
 */
export function redrawAll(api: ExcalidrawImperativeAPI): void {
  api.updateScene({
    elements: api.getSceneElementsIncludingDeleted().map((el) => ({ ...el })),
    captureUpdate: CaptureUpdateAction.NEVER,
  });
}
