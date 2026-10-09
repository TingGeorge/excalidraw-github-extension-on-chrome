/** Minimal element geometry used for diff highlights and library layout. */

export interface ElementLike {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
  points?: ReadonlyArray<readonly [number, number]>;
  isDeleted?: boolean;
}

export type Bounds = [minX: number, minY: number, maxX: number, maxY: number];

export function elementBounds(el: ElementLike): Bounds {
  let minX: number;
  let minY: number;
  let maxX: number;
  let maxY: number;
  if (el.points && el.points.length > 0) {
    const xs = el.points.map((p) => p[0]);
    const ys = el.points.map((p) => p[1]);
    minX = el.x + Math.min(...xs);
    maxX = el.x + Math.max(...xs);
    minY = el.y + Math.min(...ys);
    maxY = el.y + Math.max(...ys);
  } else {
    minX = Math.min(el.x, el.x + el.width);
    maxX = Math.max(el.x, el.x + el.width);
    minY = Math.min(el.y, el.y + el.height);
    maxY = Math.max(el.y, el.y + el.height);
  }
  const angle = el.angle ?? 0;
  if (!angle) return [minX, minY, maxX, maxY];
  // Excalidraw rotates around the centre of the element's own box.
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const corners: Array<[number, number]> = [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
  ];
  const rotated = corners.map(([x, y]) => [
    cx + (x - cx) * cos - (y - cy) * sin,
    cy + (x - cx) * sin + (y - cy) * cos,
  ]);
  return [
    Math.min(...rotated.map((p) => p[0]!)),
    Math.min(...rotated.map((p) => p[1]!)),
    Math.max(...rotated.map((p) => p[0]!)),
    Math.max(...rotated.map((p) => p[1]!)),
  ];
}

export function commonBounds(elements: readonly ElementLike[]): Bounds | null {
  let result: Bounds | null = null;
  for (const el of elements) {
    if (el.isDeleted) continue;
    const b = elementBounds(el);
    result = result
      ? [
          Math.min(result[0], b[0]),
          Math.min(result[1], b[1]),
          Math.max(result[2], b[2]),
          Math.max(result[3], b[3]),
        ]
      : b;
  }
  return result;
}
