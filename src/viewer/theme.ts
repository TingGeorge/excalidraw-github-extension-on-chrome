import { useEffect, useState } from "react";
import type { Theme } from "../shared/protocol";
import { loadSettings } from "../shared/settings";

const systemTheme = (): Theme => (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

/**
 * Viewer theme: an explicit choice in the URL/payload wins (GitHub's theme at
 * the time the preview was opened), then the user's setting, then the OS.
 */
export function useTheme(initial: Theme | null): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(initial ?? systemTheme());
  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    void loadSettings().then((s) => {
      if (!cancelled && s.theme !== "auto") setTheme(s.theme);
    });
    return () => {
      cancelled = true;
    };
  }, [initial]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);
  return [theme, setTheme];
}
