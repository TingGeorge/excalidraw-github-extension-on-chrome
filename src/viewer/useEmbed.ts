import { useEffect, useState } from "react";
import type { EmbedScrollMessage } from "../shared/protocol";

/**
 * Inline previews live in an iframe on github.com. Until the user clicks the
 * diagram, plain mouse-wheel scrolling should scroll the GitHub page instead of
 * panning the canvas; Ctrl/⌘ + wheel (and trackpad pinch) still zooms.
 */
export function useEmbedInteraction(embed: boolean): boolean {
  const [active, setActive] = useState(!embed);

  useEffect(() => {
    if (!embed) return;
    let isActive = false;
    const update = (value: boolean) => {
      isActive = value;
      setActive(value);
    };
    const onPointerDown = () => update(true);
    const onBlur = () => update(false);
    const onWheel = (e: WheelEvent) => {
      if (isActive || e.ctrlKey || e.metaKey) return;
      // Keep Excalidraw from panning and forward the scroll to the GitHub page.
      e.stopImmediatePropagation();
      e.preventDefault();
      const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
      const message: EmbedScrollMessage = {
        source: "xgp-viewer",
        type: "scroll",
        dx: e.deltaX * scale,
        dy: e.deltaY * scale,
      };
      window.parent.postMessage(message, "*");
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("blur", onBlur);
    window.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("wheel", onWheel, { capture: true });
    };
  }, [embed]);

  return active;
}
