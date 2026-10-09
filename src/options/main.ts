import "./options.css";
import { t, type MessageKey } from "../shared/i18n";
import {
  INLINE_HEIGHT_MAX,
  INLINE_HEIGHT_MIN,
  loadSettings,
  saveSettings,
  type Settings,
} from "../shared/settings";

const isPopup = document.body.classList.contains("page-popup");

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { dataset?: Record<string, string> } = {},
  ...children: Array<Node | string>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  const { dataset, ...rest } = props;
  Object.assign(node, rest);
  if (dataset) Object.assign(node.dataset, dataset);
  node.append(...children);
  return node;
}

let statusTimer: ReturnType<typeof setTimeout> | undefined;
function flashSaved(status: HTMLElement) {
  status.textContent = t("optSaved");
  status.classList.add("is-visible");
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => status.classList.remove("is-visible"), 1200);
}

function checkbox(key: "autoInline" | "sniffImages" | "diffButtons", label: MessageKey, settings: Settings, onSave: () => void) {
  const input = el("input", { type: "checkbox", checked: settings[key], id: `opt-${key}` });
  input.addEventListener("change", () => void saveSettings({ [key]: input.checked }).then(onSave));
  return el("label", { className: "opt-row opt-row--check", htmlFor: input.id }, input, el("span", {}, t(label)));
}

function radios<K extends "theme">(
  key: K,
  label: MessageKey,
  options: Array<[Settings[K], MessageKey]>,
  settings: Settings,
  onSave: () => void,
) {
  const group = el("fieldset", { className: "opt-group" }, el("legend", {}, t(label)));
  const row = el("div", { className: "opt-segmented" });
  for (const [value, text] of options) {
    const input = el("input", {
      type: "radio",
      name: key,
      value: String(value),
      checked: settings[key] === value,
      id: `opt-${key}-${String(value)}`,
    });
    input.addEventListener("change", () => {
      if (input.checked) void saveSettings({ [key]: value } as Partial<Settings>).then(onSave);
    });
    row.append(el("label", { htmlFor: input.id }, input, el("span", {}, t(text))));
  }
  group.append(row);
  return group;
}

async function render() {
  const settings = await loadSettings();
  const root = document.getElementById("root")!;
  const status = el("span", { className: "opt-status", role: "status" });
  const onSave = () => flashSaved(status);

  const heightInput = el("input", {
    type: "range",
    min: String(INLINE_HEIGHT_MIN),
    max: String(INLINE_HEIGHT_MAX),
    step: "20",
    value: String(settings.inlineHeight),
    id: "opt-inlineHeight",
  });
  const heightValue = el("output", {}, `${settings.inlineHeight}px`);
  heightValue.htmlFor.add(heightInput.id);
  heightInput.addEventListener("input", () => (heightValue.textContent = `${heightInput.value}px`));
  heightInput.addEventListener("change", () => void saveSettings({ inlineHeight: Number(heightInput.value) }).then(onSave));

  const header = el(
    "header",
    { className: "opt-header" },
    el("img", { src: "icons/icon-48.png", alt: "", width: 32, height: 32 }),
    el("h1", {}, t("popupTitle")),
    status,
  );

  const form = el(
    "div",
    { className: "opt-form" },
    radios(
      "theme",
      "optTheme",
      [
        ["auto", "optThemeAuto"],
        ["light", "optThemeLight"],
        ["dark", "optThemeDark"],
      ],
      settings,
      onSave,
    ),
    checkbox("autoInline", "optAutoInline", settings, onSave),
    checkbox("diffButtons", "optDiffButtons", settings, onSave),
    checkbox("sniffImages", "optSniffImages", settings, onSave),
    el(
      "div",
      { className: "opt-row opt-row--range" },
      el("label", { htmlFor: heightInput.id }, t("optInlineHeight")),
      heightInput,
      heightValue,
    ),
  );

  const openLocal = el("button", { type: "button", className: "opt-btn" }, t("optOpenLocal"));
  openLocal.addEventListener("click", () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html") });
    if (isPopup) window.close();
  });
  const footer = el("footer", { className: "opt-footer" }, openLocal);
  if (isPopup) {
    const all = el("button", { type: "button", className: "opt-btn opt-btn--link" }, t("optAllSettings"));
    all.addEventListener("click", () => {
      void chrome.runtime.openOptionsPage();
      window.close();
    });
    footer.append(all);
  }

  root.replaceChildren(header, form, footer);
  if (!isPopup) {
    root.append(
      el(
        "section",
        { className: "opt-about" },
        el("h2", {}, t("optSupported")),
        el(
          "ul",
          {},
          ...[
            ".excalidraw / .excalidraw.json",
            ".excalidraw.svg / .excalidraw.png (Embed scene)",
            ".excalidraw.md (Obsidian Excalidraw)",
            ".excalidrawlib",
          ].map((s) => el("li", {}, el("code", {}, s))),
        ),
        el("p", { className: "opt-muted" }, t("optPrivacy")),
      ),
    );
  }
}

document.documentElement.lang = navigator.language;
void render();
