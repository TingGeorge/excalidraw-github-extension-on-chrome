// Generates the sample diagrams in samples/ with deterministic ids/seeds.
// Usage: node scripts/make-samples.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import LZString from "lz-string";
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

// --- samples/obsidian-note.excalidraw.md ----------------------------------
// A mind map wrapped the way the Obsidian Excalidraw plugin saves it.
{
  idx = 0;
  seed = 2000;
  const sceneArrow = (id, from, to, [sx, sy], [ex, ey]) => {
    const el = base(id, "arrow", sx, sy, ex - sx, ey - sy, {
      points: [
        [0, 0],
        [ex - sx, ey - sy],
      ],
      lastCommittedPoint: null,
      startBinding: { elementId: from.id, focus: 0, gap: 4 },
      endBinding: { elementId: to.id, focus: 0, gap: 4 },
      startArrowhead: null,
      endArrowhead: "arrow",
      elbowed: false,
      roundness: { type: 2 },
    });
    from.boundElements.push({ type: "arrow", id });
    to.boundElements.push({ type: "arrow", id });
    return el;
  };
  const [center, centerT] = box("center", 280, 170, 240, 100, "Weekend\nproject", "#ffec99", "ellipse");
  const [n1, n1T] = box("n1", 0, 20, 200, 80, "Read\nnotes", "#a5d8ff");
  const [n2, n2T] = box("n2", 600, 20, 200, 80, "Sketch\nideas", "#b2f2bb");
  const [n3, n3T] = box("n3", 0, 340, 200, 80, "Plan\nthe week", "#ffc9c9");
  const [n4, n4T] = box("n4", 600, 340, 200, 80, "Share\nwith team", "#d0bfff");
  const arrows = [
    sceneArrow("m1", center, n1, [300, 190], [204, 96]),
    sceneArrow("m2", center, n2, [500, 190], [596, 96]),
    sceneArrow("m3", center, n3, [300, 250], [204, 344]),
    sceneArrow("m4", center, n4, [500, 250], [596, 344]),
  ];
  const elements = [center, centerT, n1, n1T, n2, n2T, n3, n3T, n4, n4T, ...arrows];
  const data = scene(elements);
  data.source = "https://github.com/zsviczian/obsidian-excalidraw-plugin";
  const json = JSON.stringify(data);
  const compressed = LZString.compressToBase64(json);
  const wrapped = compressed.match(/.{1,256}/g).join("\n");
  const texts = elements
    .filter((e) => e.type === "text")
    .map((e) => `${e.originalText.replace(/\n/g, " ")} ^${e.id}`)
    .join("\n\n");
  const md = `---

excalidraw-plugin: parsed
tags: [excalidraw]

---
==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠== You can decompress Drawing data with the command palette: 'Decompress current Excalidraw file'. For more info check in plugin settings under 'Saving'


# Excalidraw Data

## Text Elements
${texts}

%%
## Drawing
\`\`\`compressed-json
${wrapped}
\`\`\`
%%
`;
  mkdirSync(join(root, "samples"), { recursive: true });
  writeFileSync(join(root, "samples/obsidian-note.excalidraw.md"), md);
  console.log("wrote samples/obsidian-note.excalidraw.md");
}

// --- samples/shapes.excalidrawlib -----------------------------------------
{
  idx = 0;
  seed = 3000;
  const grp = (g, els) => els.map((e) => ({ ...e, groupIds: [g] }));
  const item = (n, name, elements) => ({
    id: `shapes-${n}`,
    status: "published",
    created: 1760000000000,
    name,
    elements,
  });
  const database = (() => {
    const body = base("db-body", "rectangle", 0, 20, 120, 100, { backgroundColor: "#a5d8ff" });
    const bottom = base("db-bottom", "ellipse", 0, 100, 120, 40, { backgroundColor: "#a5d8ff" });
    const top = base("db-top", "ellipse", 0, 0, 120, 40, { backgroundColor: "#d0ebff" });
    return item(1, "Database", grp("g-db", [bottom, body, top]));
  })();
  const user = (() => {
    const head = base("u-head", "ellipse", 20, 0, 40, 40, { backgroundColor: "#ffec99" });
    const line = (id, x, y, dx, dy) =>
      base(id, "line", x, y, Math.abs(dx), Math.abs(dy), {
        points: [
          [0, 0],
          [dx, dy],
        ],
        lastCommittedPoint: null,
        startBinding: null,
        endBinding: null,
        startArrowhead: null,
        endArrowhead: null,
      });
    return item(
      2,
      "User",
      grp("g-user", [
        head,
        line("u-body", 40, 40, 0, 50),
        line("u-arms", 10, 60, 60, 0),
        base("u-legl", "line", 15, 90, 25, 40, {
          points: [
            [25, 0],
            [0, 40],
          ],
          lastCommittedPoint: null,
          startBinding: null,
          endBinding: null,
          startArrowhead: null,
          endArrowhead: null,
        }),
        line("u-legr", 40, 90, 25, 40),
      ]),
    );
  })();
  const server = (() => {
    const [frame, text] = box("srv", 0, 0, 160, 120, "Server", "#b2f2bb");
    const slot = (id, y) =>
      base(id, "rectangle", 16, y, 128, 14, { backgroundColor: "#ffffff", roundness: null });
    frame.boundElements = [{ type: "text", id: text.id }];
    return item(3, "Server", grp("g-srv", [frame, slot("srv-s1", 10), slot("srv-s2", 96), text]));
  })();
  const cloud = (() => {
    const bg = "#e7f5ff";
    const parts = [
      base("c-1", "ellipse", 0, 40, 70, 60, { backgroundColor: bg }),
      base("c-2", "ellipse", 40, 0, 80, 80, { backgroundColor: bg }),
      base("c-3", "ellipse", 90, 30, 70, 70, { backgroundColor: bg }),
      base("c-4", "rectangle", 30, 50, 100, 50, {
        backgroundColor: bg,
        strokeColor: "transparent",
        roundness: null,
      }),
    ];
    return item(4, "Cloud", grp("g-cloud", parts));
  })();
  write("samples/shapes.excalidrawlib", {
    type: "excalidrawlib",
    version: 2,
    source: "https://github.com/TingGeorge/excalidraw-github-extension-on-chrome",
    libraryItems: [database, user, server, cloud],
  });
}
