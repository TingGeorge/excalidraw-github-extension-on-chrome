import type { Theme } from "../shared/protocol";
import type { Settings } from "../shared/settings";

/** The theme GitHub is currently rendering with. */
export function githubTheme(doc: Document = document): Theme {
  const mode = doc.documentElement.getAttribute("data-color-mode");
  if (mode === "light" || mode === "dark") return mode;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function viewerTheme(settings: Settings): Theme {
  return settings.theme === "auto" ? githubTheme() : settings.theme;
}
