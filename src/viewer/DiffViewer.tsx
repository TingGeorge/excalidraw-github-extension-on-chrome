import { CaptureUpdateAction, Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { diffScenes, type SceneChange, type SceneDiff } from "../shared/diff";
import { shortSha } from "../shared/github";
import { excalidrawLangCode, t } from "../shared/i18n";
import type { DiffPayload, DiffSide, Theme } from "../shared/protocol";
import { Header } from "./components/Header";
import {
  AlertIcon,
  ExternalIcon,
  FitIcon,
  LinkIcon,
  ListIcon,
  MinusIcon,
  MoonIcon,
  PlusIcon,
  SunIcon,
} from "./components/Icons";
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
  const [apis, setApis] = useState<Partial<Record<Side, ExcalidrawImperativeAPI>>>({});
  // Stable callbacks: Excalidraw calls `excalidrawAPI` again whenever the prop changes.
  const onBaseApi = useCallback(
    (api: ExcalidrawImperativeAPI) => setApis((prev) => (prev.base === api ? prev : { ...prev, base: api })),
    [],
  );
  const onHeadApi = useCallback(
    (api: ExcalidrawImperativeAPI) => setApis((prev) => (prev.head === api ? prev : { ...prev, head: api })),
    [],
  );
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
      apis[side]?.updateScene({ elements: sceneFor(side), captureUpdate: CaptureUpdateAction.NEVER });
    }
  }, [sceneFor, apis]);

  const allElements = useMemo(
    () => [...(loaded?.base?.elements ?? []), ...(loaded?.head?.elements ?? [])].filter((e) => !e.isDeleted),
    [loaded],
  );

  // Only the pane the user is interacting with drives the other one. Mirroring
  // both ways makes the panes swap viewports forever: each one's getAppState()
  // is stale while the other's update is still pending.
  const driver = useRef<Side | null>(null);
  /** Set once the user pans or zooms; until then window resizes refit the drawing. */
  const userMoved = useRef(false);
  const [zoomPct, setZoomPct] = useState(100);
  const touch = (side: Side) => {
    driver.current = side;
    userMoved.current = true;
  };

  const fitBoth = useCallback(
    (animate = false) => {
      if (allElements.length === 0) return;
      // Both panes get the same target; no mirroring while they move there.
      driver.current = null;
      userMoved.current = false;
      for (const side of ["base", "head"] as const) {
        apis[side]?.scrollToContent(allElements, {
          fitToViewport: true,
          viewportZoomFactor: 0.9,
          maxZoom: 1,
          animate,
        });
      }
    },
    [allElements, apis],
  );

  // Initial fit once both canvases exist.
  useEffect(() => {
    if (!loaded) return;
    const expected = (loaded.base ? 1 : 0) + (loaded.head ? 1 : 0);
    if (Object.keys(apis).length < expected) return;
    const raf = requestAnimationFrame(() => fitBoth());
    return () => cancelAnimationFrame(raf);
  }, [apis, loaded, fitBoth]);

  // Refit on window resize until the user has moved the view themselves.
  useEffect(() => {
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!userMoved.current) fitBoth();
      });
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
    };
  }, [fitBoth]);

  /** Zoom both panes around their centre (factor, or null for 100%). */
  const zoomBoth = (factor: number | null) => {
    driver.current = null;
    userMoved.current = true;
    for (const side of ["base", "head"] as const) {
      const api = apis[side];
      if (!api) continue;
      const st = api.getAppState();
      const z = st.zoom.value;
      const next = Math.min(30, Math.max(0.1, factor === null ? 1 : z * factor));
      const cx = st.width / 2;
      const cy = st.height / 2;
      api.updateScene({
        appState: {
          zoom: { value: next } as never,
          scrollX: st.scrollX + cx / next - cx / z,
          scrollY: st.scrollY + cy / next - cy / z,
        },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    }
  };

  const mirror = useCallback(
    (from: Side, scrollX: number, scrollY: number, zoom: { value: number }) => {
      const pct = Math.round(zoom.value * 100);
      setZoomPct((p) => (p === pct ? p : pct));
      if (!sync || driver.current !== from) return;
      const other = apis[from === "base" ? "head" : "base"];
      if (!other) return;
      const st = other.getAppState();
      if (close(st.scrollX, scrollX) && close(st.scrollY, scrollY) && st.zoom.value === zoom.value) return;
      other.updateScene({
        appState: { scrollX, scrollY, zoom: zoom as never },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    },
    [sync, apis],
  );
  const onBaseScroll = useCallback(
    (x: number, y: number, zoom: { value: number }) => mirror("base", x, y, zoom),
    [mirror],
  );
  const onHeadScroll = useCallback(
    (x: number, y: number, zoom: { value: number }) => mirror("head", x, y, zoom),
    [mirror],
  );

  const focusChange = (change: SceneChange<El>) => {
    const side: Side = change.after ? "head" : "base";
    const el = change.after ?? change.before;
    const api = apis[side];
    if (!api || !el) return;
    touch(side);
    api.scrollToContent(el, { fitToViewport: true, viewportZoomFactor: 0.5, maxZoom: 2, animate: true });
  };

  const counts = diff && (
    <span className="xv-diffstat">
      <span className="xv-diffstat__added">+{diff.added}</span>
      <span className="xv-diffstat__modified">~{diff.modified}</span>
      <span className="xv-diffstat__removed">−{diff.removed}</span>
    </span>
  );

  const title = (
    <div className="xv-title">
      <a
        className="xv-title__name"
        href={payload.pageUrl}
        target="_blank"
        rel="noreferrer"
        title={payload.path}
      >
        {payload.path.split("/").pop()}
      </a>
      <span className="xv-title__context">
        {payload.title} · {payload.base.label} → {payload.head.label}
      </span>
      {counts}
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
        onClick={() => setShowList((s) => !s)}
      />
      <div className="xv-zoom" role="group" aria-label={t("zoom")}>
        <Button
          showLabel={false}
          icon={<MinusIcon />}
          label={t("zoomOut")}
          onClick={() => zoomBoth(1 / 1.2)}
        />
        <Button
          className="xv-zoom__value"
          label={`${zoomPct}%`}
          title={t("zoomReset")}
          onClick={() => zoomBoth(null)}
        />
        <Button showLabel={false} icon={<PlusIcon />} label={t("zoomIn")} onClick={() => zoomBoth(1.2)} />
      </div>
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
      <section
        className={`xv-pane xv-pane--${side}`}
        aria-label={label}
        data-testid={`xv-pane-${side}`}
        onPointerEnter={() => (driver.current = side)}
        onPointerDownCapture={() => touch(side)}
        onWheelCapture={() => touch(side)}
        onFocusCapture={() => (driver.current = side)}
      >
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
              excalidrawAPI={side === "base" ? onBaseApi : onHeadApi}
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
              onScrollChange={side === "base" ? onBaseScroll : onHeadScroll}
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
          {showList && (
            <aside className="xv-changes" aria-label={t("changes")}>
              <h2>{t("changes")}</h2>
              {diff.changes.length === 0 ? (
                <p className="xv-muted">{t("noVisualChanges")}</p>
              ) : (
                <ul>
                  {diff.changes.map((change) => (
                    <li key={`${change.kind}-${change.id}`}>
                      <button type="button" title={change.label} onClick={() => focusChange(change)}>
                        <span
                          className="xv-dot"
                          style={{ background: CHANGE_COLORS[change.kind].stroke }}
                          aria-hidden="true"
                        />
                        <span className="xv-changes__text">
                          <span className="xv-changes__label">{change.text || change.type}</span>
                          <span className="xv-changes__meta">
                            {change.text ? `${change.type} · ` : ""}
                            {t(change.kind)}
                          </span>
                        </span>
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
