/**
 * Excalidraw can embed live web content: `embeddable` elements (YouTube,
 * Figma, any whitelisted site) and `iframe` elements whose HTML comes from the
 * file itself and runs scripts. A diagram from a repository must not be able
 * to load third-party pages or show (phishing) UI on github.com, so those
 * elements are turned into plain dashed boxes. Their `link` survives, so the
 * user can still open it deliberately.
 */
const ACTIVE_TYPES = new Set(["iframe", "embeddable"]);

export function neutralizeElements<T extends { type: string }>(elements: readonly T[]): T[] {
  return elements.map((el) => {
    if (!ACTIVE_TYPES.has(el.type)) return el;
    const { customData: _customData, ...rest } = el as T & { customData?: unknown };
    return { ...rest, type: "rectangle", strokeStyle: "dashed" } as unknown as T;
  });
}
