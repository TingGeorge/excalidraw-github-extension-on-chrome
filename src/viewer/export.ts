import { exportToBlob, exportToSvg, serializeAsJSON } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { Theme } from "../shared/protocol";

const PADDING = 20;

function baseName(fileName: string): string {
  return fileName.replace(/\.excalidraw(\.(json|svg|png|md))?$|\.excalidrawlib$|\.(svg|png|json)$/i, "") || "diagram";
}

function snapshot(api: ExcalidrawImperativeAPI) {
  return {
    elements: api.getSceneElements(),
    appState: api.getAppState(),
    files: api.getFiles(),
  };
}

export function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function pngBlob(api: ExcalidrawImperativeAPI, theme: Theme): Promise<Blob> {
  const { elements, appState, files } = snapshot(api);
  return exportToBlob({
    elements,
    files,
    mimeType: "image/png",
    exportPadding: PADDING,
    appState: { ...appState, exportBackground: true, exportWithDarkMode: theme === "dark", exportScale: 2 },
    getDimensions: (width: number, height: number) => ({ width: width * 2, height: height * 2, scale: 2 }),
  });
}

export async function exportPng(api: ExcalidrawImperativeAPI, fileName: string, theme: Theme): Promise<void> {
  download(await pngBlob(api, theme), `${baseName(fileName)}.png`);
}

export async function exportSvg(api: ExcalidrawImperativeAPI, fileName: string, theme: Theme): Promise<void> {
  const { elements, appState, files } = snapshot(api);
  const svg = await exportToSvg({
    elements,
    files,
    exportPadding: PADDING,
    appState: { ...appState, exportBackground: true, exportWithDarkMode: theme === "dark" },
  });
  const xml = new XMLSerializer().serializeToString(svg);
  download(new Blob([xml], { type: "image/svg+xml" }), `${baseName(fileName)}.svg`);
}

export async function copyPng(api: ExcalidrawImperativeAPI, theme: Theme): Promise<void> {
  // Passing a promise keeps the user activation alive while the PNG renders.
  await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob(api, theme) })]);
}

export function exportExcalidraw(api: ExcalidrawImperativeAPI, fileName: string): void {
  const { elements, appState, files } = snapshot(api);
  const json = serializeAsJSON(elements, appState, files, "local");
  download(new Blob([json], { type: "application/vnd.excalidraw+json" }), `${baseName(fileName)}.excalidraw`);
}

export const __test = { baseName };
