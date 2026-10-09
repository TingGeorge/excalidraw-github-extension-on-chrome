import { CaptureUpdateAction, Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { diffScenes, type SceneChange, type SceneDiff } from "../shared/diff";
import { shortSha } from "../shared/github";
import { excalidrawLangCode, t } from "../shared/i18n";
import type { DiffPayload, DiffSide, Theme } from "../shared/protocol";
import { Header } from "./components/Header";
import { AlertIcon, ExternalIcon, FitIcon, LinkIcon, ListIcon, MoonIcon, SunIcon } from "./components/Icons";
import { Button, Spinner } from "./components/ui";
import { CHANGE_COLORS, highlightElements } from "./highlights";
import { loadScene, type LoadedScene } from "./scene";
import { useEmbedInteraction } from "./useEmbed";

type Side = "base" | "head";
type El = ExcalidrawElement;

interface Loaded {
  base: LoadedScene | null;
  head: LoadedScene | null;
}

const close = (a: number, b: number) => Math.abs(a - b) < 0.5;

export function DiffViewer({
  payload,
  embed,
  theme,
  onThemeChange,
}: {
  payload: DiffPayload;
  embed: boolean;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(true);
  const [sync, setSync] = useState(true);
  const [showList, setShowList] = useState(() => window.innerWidth > 900);
  const apis = useRef<Partial<Record<Side, ExcalidrawImperativeAPI>>>({});
  const [ready, setReady] = useState(0);
  useEmbedInteraction(embed);

  useEffect(() => {
    let cancelled = false;
    const load = (side: DiffSide) =>
      side.content ? loadScene(side.source.kind, side.content) : Promise.resolve(null);
    Promise.all([load(payload.base), load(payload.head)]).then(
      ([base, head]) => !cancelled && setLoaded({ base, head }),
      (err: unknown) => !cancelled && setError(err instanceof Error ? err.message : String(err)),
    );
    return () => {
      cancelled = true;
    };
  }, [payload]);

  useEffect(() => {
    document.title = `${payload.path.split("/").pop()} (${payload.title}) · Excalidraw Preview`;
  }, [payload]);

  const diff: SceneDiff<El> | null = useMemo(() => {
    if (!loaded) return null;
    return diffScenes<El>(loaded.base?.elements ?? [], loaded.head?.elements ?? []);
  }, [loaded]);

  // Highlights only make sense when both versions exist.
  const bothSides = Boolean(loaded?.base && loaded?.head);
  const sceneFor = useCallback(
    (side: Side): El[] => {
      const scene = loaded?.[side];
      if (!scene) return [];
      const marks = highlight && bothSides && diff ? highlightElements(diff.changes, side) : [];
      return [...marks, ...scene.elements];
    },
    [loaded, highlight, bothSides, diff],
  );

  // Re-render highlights when toggled.
  useEffect(() => {
    for (const side of ["base", "head"] as const) {
      apis.current[side]?.updateScene({ elements: sceneFor(side), captureUpdate: CaptureUpdateAction.NEVER });
    }
  }, [sceneFor]);

  const allElements = useMemo(
    () => [...(loaded?.base?.elements ?? []), ...(loaded?.head?.elements ?? [])].filter((e) => !e.isDeleted),
    [loaded],
  );

  const fitBoth = useCallback(
    (animate = false) => {
      if (allElements.length === 0) return;
      for (const side of ["base", "head"] as const) {
        apis.current[side]?.scrollToContent(allElements, {
          fitToViewport: true,
          viewportZoomFactor: 0.9,
          maxZoom: 1,
          animate,
        });
      }
    },
    [allElements],
  );

  // Initial fit once both canvases exist.
  useEffect(() => {
    if (!loaded) return;
    const expected = (loaded.base ? 1 : 0) + (loaded.head ? 1 : 0);
    if (ready < expected) return;
    const raf = requestAnimationFrame(() => fitBoth());
    return () => cancelAnimationFrame(raf);
  }, [ready, loaded, fitBoth]);

  const onScroll = useCallback(
    (from: Side) => (scrollX: number, scrollY: number, zoom: { value: number }) => {
      if (!sync) return;
      const other = apis.current[from === "base" ? "head" : "base"];
      if (!other) return;
      const st = other.getAppState();
      if (close(st.scrollX, scrollX) && close(st.scrollY, scrollY) && st.zoom.value === zoom.value) return;
      other.updateScene({
        appState: { scrollX, scrollY, zoom: zoom as never },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    },
    [sync],
  );

  const focusChange = (change: SceneChange<El>) => {
    const side: Side = change.after ? "head" : "base";
    const el = change.after ?? change.before;
    const api = apis.current[side];
    if (!api || !el) return;
    api.scrollToContent(el, { fitToViewport: true, viewportZoomFactor: 0.5, maxZoom: 2, animate: true });
  };

  const counts = diff && bothSides && (
    <span className="xv-diffstat">
      <span className="xv-diffstat__added">+{diff.added}</span>
      <span className="xv-diffstat__modified">~{diff.modified}</span>
      <span className="xv-diffstat__removed">−{diff.removed}</span>
    </span>
  );

  const title = (
    <div className="xv-title">
      <a className="xv-title__name" href={payload.pageUrl} target="_blank" rel="noreferrer" title={payload.path}>
        {payload.path.split("/").pop()}
      </a>
      <span className="xv-title__context">
        {payload.title} · {payload.base.label} → {payload.head.label}
        {counts}
      </span>
    </div>
  );

  const actions = (
    <>
      <Button
        icon={<span className="xv-swatch xv-swatch--modified" aria-hidden="true" />}
        label={t("highlight")}
        pressed={highlight}
        disabled={!bothSides}
        onClick={() => setHighlight((h) => !h)}
      />
      <Button
        showLabel={false}
        icon={<LinkIcon />}
        label={t("syncViews")}
        pressed={sync}
        onClick={() => setSync((s) => !s)}
      />
      <Button
        showLabel={false}
        icon={<ListIcon />}
        label={t("changes")}
        pressed={showList}
        disabled={!bothSides}
        onClick={() => setShowList((s) => !s)}
      />
      <Button showLabel={false} icon={<FitIcon />} label={t("fitToContent")} onClick={() => fitBoth(true)} />
      <Button
        variant="invisible"
        showLabel={false}
        icon={theme === "dark" ? <SunIcon /> : <MoonIcon />}
        label={theme === "dark" ? t("themeLight") : t("themeDark")}
        onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")}
      />
      {embed && (
        <Button
          showLabel={false}
          icon={<ExternalIcon />}
          label={t("openInNewTab")}
          onClick={() => {
            const url = new URL(location.href);
            url.searchParams.delete("embed");
            window.open(url.toString(), "_blank", "noopener");
          }}
        />
      )}
    </>
  );

  const pane = (side: Side) => {
    const info = payload[side];
    const scene = loaded?.[side];
    const label = side === "base" ? t("before") : t("after");
    return (
      <section className={`xv-pane xv-pane--${side}`} aria-label={label} data-testid={`xv-pane-${side}`}>
        <div className="xv-pane__label">
          <strong>{label}</strong>
          <span className="xv-muted" title={info.source.ref}>
            {info.label || (info.source.ref ? shortSha(info.source.ref) : "")}
          </span>
          {!info.content && (
            <span className="xv-chip">{side === "base" ? t("fileAdded") : t("fileDeleted")}</span>
          )}
        </div>
        <div className="xv-pane__canvas">
          {scene ? (
            <Excalidraw
              excalidrawAPI={(api) => {
                apis.current[side] = api;
                setReady((n) => n + 1);
              }}
              initialData={{
                elements: sceneFor(side),
                appState: { ...scene.appState, theme },
                files: scene.files,
                scrollToContent: true,
              }}
              viewModeEnabled
              theme={theme}
              langCode={excalidrawLangCode}
              detectScroll={false}
              onScrollChange={onScroll(side)}
              UIOptions={{
                canvasActions: {
                  loadScene: false,
                  saveToActiveFile: false,
                  export: false,
                  saveAsImage: false,
                  clearCanvas: false,
                  toggleTheme: null,
                  changeViewBackgroundColor: false,
                },
              }}
            />
          ) : (
            <div className="xv-center xv-muted">{t("notInVersion")}</div>
          )}
        </div>
      </section>
    );
  };

  return (
    <div className={`xv-app xv-app--diff${embed ? " xv-app--embed" : ""}`}>
      <Header compact={embed} title={title} actions={actions} />
      {error ? (
        <div className="xv-center xv-error" role="alert">
          <AlertIcon size={24} />
          <h1>{t("diffLoadFailed")}</h1>
          <p>{error}</p>
        </div>
      ) : !loaded || !diff ? (
        <Spinner label={t("loading")} />
      ) : (
        <div className="xv-diff">
          <div className="xv-diff__panes">
            {pane("base")}
            {pane("head")}
          </div>
          {showList && bothSides && (
            <aside className="xv-changes" aria-label={t("changes")}>
              <h2>{t("changes")}</h2>
              {diff.changes.length === 0 ? (
                <p className="xv-muted">{t("noVisualChanges")}</p>
              ) : (
                <ul>
                  {diff.changes.map((change) => (
                    <li key={`${change.kind}-${change.id}`}>
                      <button type="button" onClick={() => focusChange(change)}>
                        <span
                          className="xv-dot"
                          style={{ background: CHANGE_COLORS[change.kind].stroke }}
                          aria-hidden="true"
                        />
                        <span className="xv-changes__label">{change.label}</span>
                        <span className={`xv-changes__kind xv-changes__kind--${change.kind}`}>{t(change.kind)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
