/**
 * Element-level diff between two Excalidraw scenes. Excalidraw element ids are
 * stable across edits, so elements are matched by id.
 */
import type { ElementLike } from "./geometry";

export type ChangeKind = "added" | "removed" | "modified";

export interface SceneChange<T extends ElementLike = ElementLike> {
  kind: ChangeKind;
  id: string;
  type: string;
  /** Element in the base scene (removed / modified). */
  before?: T;
  /** Element in the head scene (added / modified). */
  after?: T;
  /** Human readable description, e.g. `rectangle "Viewer tab"`. */
  label: string;
  /** Just the text part of the label (may be empty). */
  text: string;
}

export interface SceneDiff<T extends ElementLike = ElementLike> {
  changes: SceneChange<T>[];
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
}

/**
 * Properties that change on every save or only reflect bookkeeping, not what
 * the drawing looks like.
 */
const IGNORED_KEYS = new Set([
  "version",
  "versionNonce",
  "updated",
  "seed",
  "index",
  "boundElements",
  "lastCommittedPoint",
]);

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  if (typeof value === "number") {
    // Ignore floating point noise from re-serialisation.
    return String(Math.round(value * 1000) / 1000);
  }
  return JSON.stringify(value) ?? "null";
}

export function visualSignature(el: ElementLike): string {
  const copy: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(el)) {
    if (!IGNORED_KEYS.has(k)) copy[k] = v;
  }
  return stableStringify(copy);
}

type Described = ElementLike & {
  text?: unknown;
  boundElements?: ReadonlyArray<{ id: string; type: string }> | null;
  startBinding?: { elementId: string } | null;
  endBinding?: { elementId: string } | null;
};

function ownText(el: Described, all?: Map<string, ElementLike>): string {
  if (typeof el.text === "string" && el.text.trim()) return el.text;
  // Containers (and labelled arrows) show the text of their bound label.
  const label = el.boundElements?.find((b) => b.type === "text");
  const labelEl = label ? (all?.get(label.id) as Described | undefined) : undefined;
  return labelEl && typeof labelEl.text === "string" ? labelEl.text : "";
}

/**
 * Short human readable text for an element: its own or its label's text, or for
 * an unlabelled arrow the elements it connects ("Client → Server").
 */
export function elementText(el: Described, all?: Map<string, ElementLike>): string {
  let text = ownText(el, all);
  if (!text && all && (el.type === "arrow" || el.type === "line")) {
    const name = (id: string | undefined) => {
      const target = id ? (all.get(id) as Described | undefined) : undefined;
      if (!target) return null;
      return ownText(target, all).trim().split("\n")[0]!.trim() || target.type;
    };
    const from = name(el.startBinding?.elementId);
    const to = name(el.endBinding?.elementId);
    if (from || to) text = `${from ?? "…"} → ${to ?? "…"}`;
  }
  text = text.replace(/\s+/g, " ").trim();
  return text.length > 40 ? `${text.slice(0, 39)}…` : text;
}

export function describeElement(el: Described, all?: Map<string, ElementLike>): string {
  const text = elementText(el, all);
  return text ? `${el.type} “${text}”` : el.type;
}

export function diffScenes<T extends ElementLike>(
  baseElements: readonly T[],
  headElements: readonly T[],
): SceneDiff<T> {
  const live = (els: readonly T[]) => els.filter((e) => !e.isDeleted);
  const base = new Map(live(baseElements).map((e) => [e.id, e]));
  const head = new Map(live(headElements).map((e) => [e.id, e]));
  const changes: SceneChange<T>[] = [];
  let unchanged = 0;

  for (const [id, after] of head) {
    const before = base.get(id);
    if (!before) {
      changes.push({
        kind: "added",
        id,
        type: after.type,
        after,
        label: describeElement(after, head),
        text: elementText(after, head),
      });
    } else if (visualSignature(before) !== visualSignature(after)) {
      changes.push({
        kind: "modified",
        id,
        type: after.type,
        before,
        after,
        label: describeElement(after, head),
        text: elementText(after, head),
      });
    } else {
      unchanged++;
    }
  }
  for (const [id, before] of base) {
    if (!head.has(id)) {
      changes.push({
        kind: "removed",
        id,
        type: before.type,
        before,
        label: describeElement(before, base),
        text: elementText(before, base),
      });
    }
  }

  // Bound text changes are reported through their container: a container whose
  // label changed is "modified" even if the box itself did not move.
  const containerOf = (el: ElementLike | undefined) =>
    (el as { containerId?: string | null } | undefined)?.containerId ?? null;
  const byId = new Map(changes.map((c) => [c.id, c]));
  const folded: SceneChange<T>[] = [];
  for (const change of changes) {
    const containerId = containerOf(change.after ?? change.before);
    if (change.type === "text" && containerId) {
      const container = head.get(containerId) ?? base.get(containerId);
      const containerChange = byId.get(containerId);
      if (containerChange) continue; // already reported via the container
      if (container && head.has(containerId) && base.has(containerId)) {
        const entry: SceneChange<T> = {
          kind: "modified",
          id: containerId,
          type: container.type,
          before: base.get(containerId),
          after: head.get(containerId),
          label: describeElement(head.get(containerId)!, head),
          text: elementText(head.get(containerId)!, head),
        };
        byId.set(containerId, entry);
        folded.push(entry);
        unchanged--; // the container was counted as unchanged above
        continue;
      }
    }
    folded.push(change);
  }

  const order: Record<ChangeKind, number> = { added: 0, modified: 1, removed: 2 };
  folded.sort((a, b) => order[a.kind] - order[b.kind]);
  return {
    changes: folded,
    added: folded.filter((c) => c.kind === "added").length,
    removed: folded.filter((c) => c.kind === "removed").length,
    modified: folded.filter((c) => c.kind === "modified").length,
    unchanged,
  };
}
