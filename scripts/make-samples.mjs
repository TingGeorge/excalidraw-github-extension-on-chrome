// Generates the sample diagrams in samples/ with deterministic ids/seeds.
// Usage: node scripts/make-samples.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let seed = 1000;
const nextSeed = () => ++seed;
let idx = 0;
const nextIndex = () => `a${(idx++).toString(36).padStart(2, "0")}`;

const base = (id, type, x, y, width, height, extra = {}) => ({
  id,
  type,
  x,
  y,
  width,
  height,
  angle: 0,
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 1,
  opacity: 100,
  groupIds: [],
  frameId: null,
  index: nextIndex(),
  roundness: null,
  seed: nextSeed(),
  version: 1,
  versionNonce: nextSeed(),
  isDeleted: false,
  boundElements: [],
  updated: 1760000000000,
  link: null,
  locked: false,
  ...extra,
});

const textWidth = (text, fontSize) => Math.max(...text.split("\n").map((l) => l.length)) * fontSize * 0.55;

const label = (id, container, text, fontSize = 20) => {
  const lines = text.split("\n").length;
  const width = textWidth(text, fontSize);
  const height = lines * fontSize * 1.25;
  return base(
    id,
    "text",
    container.x + (container.width - width) / 2,
    container.y + (container.height - height) / 2,
    width,
    height,
    {
      text,
      originalText: text,
      fontSize,
      fontFamily: 5,
      textAlign: "center",
      verticalAlign: "middle",
      containerId: container.id,
      autoResize: true,
      lineHeight: 1.25,
    },
  );
};

const box = (id, x, y, w, h, text, bg, type = "rectangle") => {
  const el = base(id, type, x, y, w, h, {
    backgroundColor: bg,
    roundness: type === "rectangle" ? { type: 3 } : { type: 2 },
  });
  const t = label(`${id}-label`, el, text);
  el.boundElements = [{ type: "text", id: t.id }];
  return [el, t];
};

const arrow = (id, from, to, opts = {}) => {
  const sx = from.x + from.width;
  const sy = from.y + from.height / 2;
  const ex = to.x;
  const ey = to.y + to.height / 2;
  const el = base(id, "arrow", sx + 4, sy, ex - sx - 8, ey - sy, {
    points: [
      [0, 0],
      [ex - sx - 8, ey - sy],
    ],
    lastCommittedPoint: null,
    startBinding: { elementId: from.id, focus: 0, gap: 4 },
    endBinding: { elementId: to.id, focus: 0, gap: 4 },
    startArrowhead: null,
    endArrowhead: "arrow",
    elbowed: false,
    roundness: { type: 2 },
    ...opts,
  });
  from.boundElements.push({ type: "arrow", id });
  to.boundElements.push({ type: "arrow", id });
  return el;
};

const scene = (elements) => ({
  type: "excalidraw",
  version: 2,
  source: "https://github.com/TingGeorge/excalidraw-github-extension-on-chrome",
  elements,
  appState: { gridSize: 20, viewBackgroundColor: "#ffffff" },
  files: {},
});

const write = (rel, data) => {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(data, null, 2) + "\n");
  console.log("wrote", rel);
};

// --- samples/how-it-works.excalidraw -------------------------------------
const version = Number(process.env.SAMPLE_VERSION ?? 2);
{
  idx = 0;
  seed = 1000;
  const [gh, ghT] = box("github", 0, 0, 220, 100, "GitHub\n.excalidraw file", "#a5d8ff");
  const [cs, csT] = box("content", 320, 0, 220, 100, "Content script\n(Preview button)", "#b2f2bb");
  const [viewer, viewerT] = box("viewer", 640, 0, 220, 100, "Viewer tab\n(Excalidraw)", "#ffec99");
  const a1 = arrow("a1", gh, cs);
  const a2 = arrow("a2", cs, viewer);
  const elements = [gh, ghT, cs, csT, viewer, viewerT, a1, a2];
  if (version >= 2) {
    const [inline, inlineT] = box(
      "inline",
      320,
      200,
      220,
      100,
      "Inline preview\n(on GitHub page)",
      "#d0bfff",
    );
    const [diff, diffT] = box("diff", 640, 200, 220, 100, "PR diff\n(side by side)", "#ffc9c9");
    const a3 = arrow("a3", inline, diff);
    // Vertical arrow content -> inline
    const a4 = base("a4", "arrow", 430, 104, 0, 92, {
      points: [
        [0, 0],
        [0, 92],
      ],
      lastCommittedPoint: null,
      startBinding: { elementId: "content", focus: 0, gap: 4 },
      endBinding: { elementId: "inline", focus: 0, gap: 4 },
      startArrowhead: null,
      endArrowhead: "arrow",
      elbowed: false,
      roundness: { type: 2 },
    });
    cs.boundElements.push({ type: "arrow", id: "a4" });
    inline.boundElements.push({ type: "arrow", id: "a4" });
    viewer.backgroundColor = "#ffd8a8";
    elements.push(inline, inlineT, diff, diffT, a3, a4);
  }
  const title = base("title", "text", 0, -80, 520, 45, {
    text: "Excalidraw Preview for GitHub",
    originalText: "Excalidraw Preview for GitHub",
    fontSize: 36,
    fontFamily: 5,
    textAlign: "left",
    verticalAlign: "top",
    containerId: null,
    autoResize: true,
    lineHeight: 1.25,
  });
  elements.unshift(title);
  write("samples/how-it-works.excalidraw", scene(elements));
}
