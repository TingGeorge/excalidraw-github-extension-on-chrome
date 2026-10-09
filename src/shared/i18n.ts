/**
 * Tiny UI string table. English plus Traditional Chinese; the language follows
 * the browser (`zh-TW`, `zh-HK`, `zh-Hant*` → Traditional Chinese).
 */

const en = {
  preview: "Preview",
  previewTitle: "Open this Excalidraw diagram in a new tab",
  inline: "Inline",
  inlineTitle: "Show the diagram on this page",
  hideInline: "Code",
  hideInlineTitle: "Hide the inline preview and show the source",
  previewDiff: "Preview diff",
  previewDiffTitle: "Compare the Excalidraw diagram before and after this change",
  loading: "Loading diagram…",
  loadingFile: "Downloading file…",
  openInNewTab: "Open in new tab",
  openOnGitHub: "Open on GitHub",
  fitToContent: "Fit to content",
  export: "Export",
  exportPng: "Download PNG",
  exportSvg: "Download SVG",
  copyPng: "Copy PNG to clipboard",
  exportExcalidraw: "Download .excalidraw",
  copied: "Copied to clipboard",
  exported: "Downloaded",
  exportFailed: "Export failed",
  themeLight: "Switch to light theme",
  themeDark: "Switch to dark theme",
  edit: "Edit",
  editTitle: "Edit locally (changes are not saved to GitHub)",
  viewOnly: "Done",
  viewOnlyTitle: "Back to read-only view",
  localEdits: "Local edits are not saved to GitHub",
  discardEdits: "Discard edits",
  settings: "Settings",
  close: "Close",
  errorTitle: "Couldn’t preview this file",
  retry: "Try again",
  expired: "This preview has expired. Reopen it from GitHub.",
  emptyScene: "This drawing is empty.",
  dropTitle: "Preview an Excalidraw file",
  dropHint:
    "Drop a .excalidraw, .excalidraw.svg, .excalidraw.png, .excalidraw.md or .excalidrawlib file here",
  chooseFile: "Choose file…",
  unsupportedFile: "This file type is not supported.",
  libraryItems: "{n} library items",
  before: "Before",
  after: "After",
  added: "added",
  removed: "removed",
  modified: "modified",
  noVisualChanges: "No visual changes",
  fileAdded: "File added in this change",
  fileDeleted: "File deleted in this change",
  notInVersion: "This file does not exist in this version.",
  split: "Side by side",
  highlight: "Highlight changes",
  changes: "Changes",
  syncViews: "Sync views",
  zoom: "Zoom",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  zoomReset: "Reset zoom to 100%",
  interactHint: "Click to interact · drag to pan · Ctrl/⌘ + scroll to zoom",
  resizePreview: "Resize preview",
  inlineFrameTitle: "Excalidraw preview",
  diffLoadFailed: "Couldn’t load both versions of this file",
  signedOut: "GitHub didn’t return the file. Make sure you are signed in and can access this repository.",
  popupTitle: "Excalidraw Preview for GitHub",
  optAutoInline: "Show the inline preview automatically when opening a diagram",
  optSniffImages: "Detect Excalidraw scenes embedded in any .svg / .png file",
  optDiffButtons: "Add “Preview diff” buttons on pull request, commit and compare pages",
  optTheme: "Theme",
  optThemeAuto: "Match GitHub",
  optThemeLight: "Light",
  optThemeDark: "Dark",
  optInlineHeight: "Inline preview height",
  optOpenLocal: "Open a local file…",
  optAllSettings: "All settings",
  optSaved: "Saved",
  optSupported: "Supported files",
  optPrivacy: "Diagrams are rendered locally in your browser. Nothing is uploaded.",
} as const;

export type MessageKey = keyof typeof en;

const zhTW: Record<MessageKey, string> = {
  preview: "預覽",
  previewTitle: "在新分頁中開啟這張 Excalidraw 圖",
  inline: "內嵌",
  inlineTitle: "直接在這個頁面顯示圖",
  hideInline: "原始碼",
  hideInlineTitle: "隱藏內嵌預覽並顯示原始碼",
  previewDiff: "預覽差異",
  previewDiffTitle: "比較這次變更前後的 Excalidraw 圖",
  loading: "正在載入圖…",
  loadingFile: "正在下載檔案…",
  openInNewTab: "在新分頁開啟",
  openOnGitHub: "在 GitHub 開啟",
  fitToContent: "縮放至適合大小",
  export: "匯出",
  exportPng: "下載 PNG",
  exportSvg: "下載 SVG",
  copyPng: "複製 PNG 到剪貼簿",
  exportExcalidraw: "下載 .excalidraw",
  copied: "已複製到剪貼簿",
  exported: "已下載",
  exportFailed: "匯出失敗",
  themeLight: "切換為淺色主題",
  themeDark: "切換為深色主題",
  edit: "編輯",
  editTitle: "在本機編輯（變更不會存回 GitHub）",
  viewOnly: "完成",
  viewOnlyTitle: "回到唯讀檢視",
  localEdits: "本機編輯不會存回 GitHub",
  discardEdits: "捨棄編輯",
  settings: "設定",
  close: "關閉",
  errorTitle: "無法預覽這個檔案",
  retry: "重試",
  expired: "這個預覽已過期，請從 GitHub 重新開啟。",
  emptyScene: "這張圖是空的。",
  dropTitle: "預覽 Excalidraw 檔案",
  dropHint:
    "把 .excalidraw、.excalidraw.svg、.excalidraw.png、.excalidraw.md 或 .excalidrawlib 檔案拖曳到這裡",
  chooseFile: "選擇檔案…",
  unsupportedFile: "不支援這種檔案類型。",
  libraryItems: "{n} 個元件庫項目",
  before: "變更前",
  after: "變更後",
  added: "新增",
  removed: "刪除",
  modified: "修改",
  noVisualChanges: "沒有視覺上的變更",
  fileAdded: "這次變更新增了這個檔案",
  fileDeleted: "這次變更刪除了這個檔案",
  notInVersion: "這個版本中沒有這個檔案。",
  split: "並排",
  highlight: "標示變更",
  changes: "變更",
  syncViews: "同步檢視",
  zoom: "縮放",
  zoomIn: "放大",
  zoomOut: "縮小",
  zoomReset: "重設為 100%",
  interactHint: "點一下開始操作 · 拖曳平移 · Ctrl/⌘ + 滾輪縮放",
  resizePreview: "調整預覽高度",
  inlineFrameTitle: "Excalidraw 預覽",
  diffLoadFailed: "無法載入這個檔案的兩個版本",
  signedOut: "GitHub 沒有回傳檔案。請確認你已登入並且有權限存取這個 repo。",
  popupTitle: "Excalidraw Preview for GitHub",
  optAutoInline: "開啟圖檔時自動顯示內嵌預覽",
  optSniffImages: "偵測任何 .svg / .png 檔案中內嵌的 Excalidraw 場景",
  optDiffButtons: "在 Pull Request、commit 和 compare 頁面加入「預覽差異」按鈕",
  optTheme: "主題",
  optThemeAuto: "跟隨 GitHub",
  optThemeLight: "淺色",
  optThemeDark: "深色",
  optInlineHeight: "內嵌預覽高度",
  optOpenLocal: "開啟本機檔案…",
  optAllSettings: "所有設定",
  optSaved: "已儲存",
  optSupported: "支援的檔案",
  optPrivacy: "圖都在你的瀏覽器中本機渲染，不會上傳任何資料。",
};

function pickLocale(languages: readonly string[]): "en" | "zh-TW" {
  for (const raw of languages) {
    const lang = raw.toLowerCase();
    if (lang === "zh-tw" || lang === "zh-hk" || lang === "zh-mo" || lang.startsWith("zh-hant"))
      return "zh-TW";
    if (lang.startsWith("en")) return "en";
  }
  return "en";
}

const browserLanguages = (): readonly string[] =>
  typeof navigator === "undefined"
    ? []
    : navigator.languages?.length
      ? navigator.languages
      : [navigator.language];

export const locale = pickLocale(browserLanguages());

/** Excalidraw language code for its own UI. */
export const excalidrawLangCode = locale === "zh-TW" ? "zh-TW" : "en";

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  let s: string = locale === "zh-TW" ? zhTW[key] : en[key];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

export const __test = { pickLocale };
