/** Turn downloaded file content into something Excalidraw can render. */
import {
  loadFromBlob,
  loadLibraryFromBlob,
  restore,
  restoreLibraryItems,
} from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, BinaryFiles, LibraryItem } from "@excalidraw/excalidraw/types";
import { base64ToBytes, type FileKind, mimeForKind } from "../shared/files";
import { commonBounds, type ElementLike } from "../shared/geometry";
import { extractObsidianScene } from "../shared/obsidian";
import type { FileContent } from "../shared/protocol";

export interface LoadedScene {
  elements: readonly ExcalidrawElement[];
  appState: Partial<AppState>;
  files: BinaryFiles;
  /** Set when the file was a library; the scene shows the items in a grid. */
  libraryItemCount?: number;
}

function contentToBlob(kind: FileKind, content: FileContent): Blob {
  const type = mimeForKind(kind);
  if (content.encoding === "base64") {
    const bytes = base64ToBytes(content.data);
    return new Blob([bytes.buffer as ArrayBuffer], { type });
  }
  return new Blob([content.data], { type });
}

function contentToText(content: FileContent): string {
  return content.encoding === "text"
    ? content.data
    : new TextDecoder().decode(base64ToBytes(content.data));
}

function restoreSceneJson(text: string): LoadedScene {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON, so it cannot be an Excalidraw drawing.");
  }
  if (!data || typeof data !== "object") throw new Error("Unrecognised Excalidraw file.");
  const obj = data as Record<string, unknown>;
  if (obj.type === "excalidrawlib" || Array.isArray(obj.library) || Array.isArray(obj.libraryItems)) {
    return libraryToScene(restoreLibraryItems((obj.libraryItems ?? obj.library) as never, "published"));
  }
  if (!Array.isArray(obj.elements)) {
    throw new Error("This JSON file does not contain an Excalidraw scene (no “elements” array).");
  }
  const restored = restore(
    {
      elements: obj.elements as never,
      appState: (obj.appState ?? {}) as never,
      files: (obj.files ?? {}) as never,
    },
    null,
    null,
    { repairBindings: true, refreshDimensions: false },
  );
  return { elements: restored.elements, appState: restored.appState, files: restored.files };
}

export async function loadScene(kind: FileKind, content: FileContent): Promise<LoadedScene> {
  switch (kind) {
    case "excalidraw":
      return restoreSceneJson(contentToText(content));
    case "obsidian":
      return restoreSceneJson(extractObsidianScene(contentToText(content)));
    case "library": {
      const items = await loadLibraryFromBlob(contentToBlob(kind, content), "published");
      return libraryToScene(items);
    }
    case "excalidraw-svg":
    case "excalidraw-png":
    case "svg":
    case "png": {
      try {
        const scene = await loadFromBlob(contentToBlob(kind, content), null, null);
        return { elements: scene.elements, appState: scene.appState, files: scene.files };
      } catch (err) {
        const reason = err instanceof Error && err.message ? ` (${err.message})` : "";
        throw new Error(
          `This image does not contain an embedded Excalidraw scene${reason}. ` +
            "Export from Excalidraw with “Embed scene” enabled to make it previewable.",
        );
      }
    }
  }
}

const GRID_GAP = 80;
const LABEL_SIZE = 16;

/** Lay library items out in a grid so the whole library can be browsed as one scene. */
export function libraryToScene(items: readonly LibraryItem[]): LoadedScene {
  const elements: ExcalidrawElement[] = [];
  const cellBounds = items.map((item) => commonBounds(item.elements as unknown as ElementLike[]));
  const cellW = Math.max(120, ...cellBounds.map((b) => (b ? b[2] - b[0] : 0)));
  const cellH = Math.max(80, ...cellBounds.map((b) => (b ? b[3] - b[1] : 0)));
  const columns = Math.max(1, Math.min(6, Math.ceil(Math.sqrt(items.length))));

  items.forEach((item, i) => {
    const b = cellBounds[i];
    if (!b) return;
    const col = i % columns;
    const row = Math.floor(i / columns);
    const originX = col * (cellW + GRID_GAP);
    const originY = row * (cellH + GRID_GAP + LABEL_SIZE * 2);
    // centre the item inside its cell
    const dx = originX + (cellW - (b[2] - b[0])) / 2 - b[0];
    const dy = originY + (cellH - (b[3] - b[1])) / 2 - b[1];
    const prefix = `lib${i}-`;
    for (const el of item.elements) {
      elements.push(remapElement(el, prefix, dx, dy));
    }
    if (item.name) {
      elements.push(makeLabel(`${prefix}name`, item.name, originX, originY + cellH + 12, cellW));
    }
  });

  const restored = restore({ elements: elements as never }, null, null, { refreshDimensions: true });
  return {
    elements: restored.elements,
    appState: { ...restored.appState, viewBackgroundColor: "#ffffff" },
    files: {},
    libraryItemCount: items.length,
  };
}

function remapElement(el: ExcalidrawElement, prefix: string, dx: number, dy: number): ExcalidrawElement {
  const any = el as unknown as Record<string, unknown>;
  const remap = (id: unknown) => (typeof id === "string" ? prefix + id : id);
  const binding = (b: unknown) =>
    b && typeof b === "object" ? { ...(b as object), elementId: remap((b as { elementId: string }).elementId) } : b;
  return {
    ...any,
    id: prefix + el.id,
    x: el.x + dx,
    y: el.y + dy,
    groupIds: el.groupIds.map((g) => prefix + g),
    frameId: el.frameId ? prefix + el.frameId : null,
    containerId: remap(any.containerId) ?? null,
    boundElements: el.boundElements?.map((b) => ({ ...b, id: prefix + b.id })) ?? null,
    startBinding: binding(any.startBinding),
    endBinding: binding(any.endBinding),
  } as unknown as ExcalidrawElement;
}

function makeLabel(id: string, text: string, x: number, y: number, width: number): ExcalidrawElement {
  return {
    id,
    type: "text",
    x,
    y,
    width,
    height: LABEL_SIZE * 1.25,
    text,
    originalText: text,
    fontSize: LABEL_SIZE,
    fontFamily: 2,
    textAlign: "center",
    verticalAlign: "top",
    strokeColor: "#868e96",
    autoResize: false,
  } as unknown as ExcalidrawElement;
}
