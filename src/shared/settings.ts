export type ThemeSetting = "auto" | "light" | "dark";

export interface Settings {
  /** Show the inline preview automatically when an Excalidraw file is opened. */
  autoInline: boolean;
  /** Offer a preview for plain .svg/.png files that carry an embedded Excalidraw scene. */
  sniffImages: boolean;
  /** Add "Preview diff" buttons on pull request, commit and compare pages. */
  diffButtons: boolean;
  /** Viewer theme; "auto" follows GitHub's current theme. */
  theme: ThemeSetting;
  /** Height of the inline preview in pixels. */
  inlineHeight: number;
}

export const DEFAULT_SETTINGS: Settings = {
  autoInline: false,
  sniffImages: true,
  diffButtons: true,
  theme: "auto",
  inlineHeight: 600,
};

export const INLINE_HEIGHT_MIN = 240;
export const INLINE_HEIGHT_MAX = 2000;

export function normalizeSettings(raw: unknown): Settings {
  const s = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== "object") return s;
  const r = raw as Record<string, unknown>;
  if (typeof r.autoInline === "boolean") s.autoInline = r.autoInline;
  if (typeof r.sniffImages === "boolean") s.sniffImages = r.sniffImages;
  if (typeof r.diffButtons === "boolean") s.diffButtons = r.diffButtons;
  if (r.theme === "auto" || r.theme === "light" || r.theme === "dark") s.theme = r.theme;
  if (typeof r.inlineHeight === "number" && Number.isFinite(r.inlineHeight)) {
    s.inlineHeight = Math.round(
      Math.min(INLINE_HEIGHT_MAX, Math.max(INLINE_HEIGHT_MIN, r.inlineHeight)),
    );
  }
  return s;
}

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await chrome.storage.sync.get(null);
    return normalizeSettings(raw);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = normalizeSettings({ ...(await loadSettings()), ...patch });
  await chrome.storage.sync.set(next);
  return next;
}

export function onSettingsChanged(callback: (settings: Settings) => void): () => void {
  const listener = (_changes: unknown, area: string) => {
    if (area === "sync") void loadSettings().then(callback);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
