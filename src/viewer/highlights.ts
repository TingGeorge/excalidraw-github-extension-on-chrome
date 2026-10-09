import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ChangeKind, SceneChange } from "../shared/diff";
import { elementBounds, type ElementLike } from "../shared/geometry";

export const HIGHLIGHT_PREFIX = "xgp-diff-";
const PADDING = 10;

export const CHANGE_COLORS: Record<ChangeKind, { stroke: string; fill: string }> = {
  added: { stroke: "#1a7f37", fill: "#2da44e26" },
  removed: { stroke: "#cf222e", fill: "#cf222e1f" },
  modified: { stroke: "#9a6700", fill: "#d4a72c2e" },
};

/**
 * Dashed boxes drawn behind changed elements. `side` decides which version of
 * each change is outlined: removals only exist in the base, additions only in
 * the head.
 */
export function highlightElements(
  changes: readonly SceneChange<ExcalidrawElement & ElementLike>[],
  side: "base" | "head",
): ExcalidrawElement[] {
  const skeletons = changes.flatMap((change) => {
    const el = side === "base" ? change.before : change.after;
    if (!el) return [];
    const [x1, y1, x2, y2] = elementBounds(el);
    const colors = CHANGE_COLORS[change.kind];
    return [
      {
        type: "rectangle" as const,
        id: `${HIGHLIGHT_PREFIX}${change.id}`,
        x: x1 - PADDING,
        y: y1 - PADDING,
        width: Math.max(x2 - x1, 1) + PADDING * 2,
        height: Math.max(y2 - y1, 1) + PADDING * 2,
        strokeColor: colors.stroke,
        backgroundColor: colors.fill,
        fillStyle: "solid" as const,
        strokeStyle: "dashed" as const,
        strokeWidth: 2,
        roughness: 0,
        roundness: { type: 3 as const },
        locked: true,
      },
    ];
  });
  return convertToExcalidrawElements(skeletons, { regenerateIds: false }) as ExcalidrawElement[];
}

export function withoutHighlights<T extends { id: string }>(elements: readonly T[]): T[] {
  return elements.filter((e) => !e.id.startsWith(HIGHLIGHT_PREFIX));
}
