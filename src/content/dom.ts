/** DOM helpers for the content script. Everything we add carries a `data-xgp` attribute. */

export const MARK = "data-xgp";

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | undefined> = {},
  ...children: Array<Node | string | null | undefined>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    node.setAttribute(k, v === true ? "" : v);
  }
  for (const child of children) if (child != null) node.append(child);
  return node;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** 16px octicon-style icon. `paths` are stroke paths in a 16×16 box. */
export function icon(paths: string[], { fill = false }: { fill?: boolean } = {}): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", "octicon xgp-icon");
  for (const d of paths) {
    const p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("d", d);
    if (fill) {
      p.setAttribute("fill", "currentColor");
    } else {
      p.setAttribute("fill", "none");
      p.setAttribute("stroke", "currentColor");
      p.setAttribute("stroke-width", "1.5");
      p.setAttribute("stroke-linecap", "round");
      p.setAttribute("stroke-linejoin", "round");
    }
    svg.append(p);
  }
  return svg;
}

export const ICONS = {
  /** Two boxes joined by an arrow — the extension's mark. */
  diagram: [
    "M2.25 2.75h4.5v3.5h-4.5z",
    "M9.25 9.75h4.5v3.5h-4.5z",
    "M4.5 6.25c0 3.25 1.5 5.25 4.5 5.25",
    "m7.5 10 1.5 1.5-1.5 1.5",
  ],
  external: [
    "M9 2.75h4.25V7",
    "M13.25 2.75 7.5 8.5",
    "M11.5 9.5v3a.75.75 0 0 1-.75.75h-7.5a.75.75 0 0 1-.75-.75v-7.5a.75.75 0 0 1 .75-.75h3",
  ],
  eye: [
    "M1.75 8S4.25 3.25 8 3.25 14.25 8 14.25 8 11.75 12.75 8 12.75 1.75 8 1.75 8Z",
    "M8 9.75a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5Z",
  ],
  diff: ["M4 2.75v7.5", "M.75 6.5H7.25", "M9 9.75h6.25", "M11.5 2.75h3.5v3.5", "M15 2.75 10.5 7.25"],
  spinner: ["M8 1.75A6.25 6.25 0 1 1 1.75 8"],
};

/** Run `fn` at most once per animation frame. */
export function rafThrottle(fn: () => void): () => void {
  let scheduled = false;
  return () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      fn();
    });
  };
}

export function extensionOrigin(): string {
  return new URL(chrome.runtime.getURL("/")).origin;
}
