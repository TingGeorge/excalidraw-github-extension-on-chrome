// Must be imported before @excalidraw/excalidraw: tells Excalidraw to load its
// fonts from the extension package (dist/fonts) instead of a CDN.
declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string | string[];
  }
}

window.EXCALIDRAW_ASSET_PATH =
  typeof chrome !== "undefined" && chrome.runtime?.getURL ? chrome.runtime.getURL("/") : "/";

export {};
