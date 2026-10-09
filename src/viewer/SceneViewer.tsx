import { CaptureUpdateAction, Excalidraw, getSceneVersion, MainMenu } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { excalidrawLangCode, t } from "../shared/i18n";
import type { Theme, ViewPayload } from "../shared/protocol";
import { Header, SourceTitle } from "./components/Header";
import {
  AlertIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  ExternalIcon,
  FileIcon,
  FitIcon,
  MoonIcon,
  PencilIcon,
  SunIcon,
} from "./components/Icons";
import { Button, Menu, Spinner, useToast } from "./components/ui";
import { copyPng, exportExcalidraw, exportPng, exportSvg } from "./export";
import { loadScene, type LoadedScene } from "./scene";
import { useEmbedInteraction } from "./useEmbed";

/** Zoom so the whole drawing is visible; libraries (small shapes in a grid) may zoom in a little. */
export function fitScene(api: ExcalidrawImperativeAPI, animate = false, maxZoom = 1): void {
  api.scrollToContent(undefined, { fitToViewport: true, viewportZoomFactor: 0.9, maxZoom, animate });
}

export function SceneViewer({
  payload,
  embed,
  theme,
  onThemeChange,
}: {
  payload: ViewPayload;
  embed: boolean;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}) {
  const { source } = payload;
  const [scene, setScene] = useState<LoadedScene | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const initialVersion = useRef<number | null>(null);
  const active = useEmbedInteraction(embed);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    loadScene(source.kind, payload.content).then(
      (s) => {
        if (cancelled) return;
        initialVersion.current = getSceneVersion(s.elements);
        setScene(s);
      },
      (err: unknown) => !cancelled && setError(err instanceof Error ? err.message : String(err)),
    );
    return () => {
      cancelled = true;
    };
  }, [payload, source.kind]);

  useEffect(() => {
    document.title = `${source.fileName} · Excalidraw Preview`;
  }, [source.fileName]);

  /** Set once the user pans or zooms; until then resizes (e.g. of the inline frame) refit. */
  const userMoved = useRef(false);
  const maxZoom = scene?.libraryItemCount ? 1.5 : 1;

  // Fit once the canvas has its final size, and again on resize until the user moves the view.
  useEffect(() => {
    if (!api || !scene) return;
    let raf = requestAnimationFrame(() => fitScene(api, false, maxZoom));
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!userMoved.current) fitScene(api, false, maxZoom);
      });
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
    };
  }, [api, scene, maxZoom]);

  const run = useCallback(
    async (action: () => Promise<void> | void, success: string) => {
      try {
        await action();
        toast(success);
      } catch (err) {
        toast(`${t("exportFailed")}: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
    },
    [toast],
  );

  const exportItems = useMemo(
    () =>
      api
        ? [
            {
              id: "png",
              label: t("exportPng"),
              icon: <DownloadIcon />,
              onSelect: () => void run(() => exportPng(api, source.fileName, theme), t("exported")),
            },
            {
              id: "svg",
              label: t("exportSvg"),
              icon: <DownloadIcon />,
              onSelect: () => void run(() => exportSvg(api, source.fileName, theme), t("exported")),
            },
            {
              id: "copy",
              label: t("copyPng"),
              icon: <CopyIcon />,
              onSelect: () => void run(() => copyPng(api, theme), t("copied")),
            },
            {
              id: "excalidraw",
              label: t("exportExcalidraw"),
              icon: <FileIcon />,
              onSelect: () => void run(() => exportExcalidraw(api, source.fileName), t("exported")),
            },
          ]
        : [],
    [api, run, source.fileName, theme],
  );

  const discardEdits = () => {
    if (!api || !scene) return;
    api.updateScene({ elements: scene.elements, captureUpdate: CaptureUpdateAction.NEVER });
    api.history.clear();
    setDirty(false);
  };

  const openInTab = () => {
    const url = new URL(location.href);
    url.searchParams.delete("embed");
    window.open(url.toString(), "_blank", "noopener");
  };

  const themeToggle = (
    <Button
      variant="invisible"
      showLabel={false}
      icon={theme === "dark" ? <SunIcon /> : <MoonIcon />}
      label={theme === "dark" ? t("themeLight") : t("themeDark")}
      onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")}
    />
  );

  const actions = (
    <>
      {dirty && <Button variant="invisible" label={t("discardEdits")} onClick={discardEdits} />}
      {!embed && (
        <Button
          icon={editing ? <CheckIcon /> : <PencilIcon />}
          label={editing ? t("viewOnly") : t("edit")}
          title={editing ? t("viewOnlyTitle") : t("editTitle")}
          pressed={editing}
          disabled={!scene}
          onClick={() => setEditing((e) => !e)}
        />
      )}
      <Button
        showLabel={false}
        icon={<FitIcon />}
        label={t("fitToContent")}
        disabled={!api}
        onClick={() => {
          if (!api) return;
          userMoved.current = false;
          fitScene(api, true, maxZoom);
        }}
      />
      {exportItems.length > 0 && <Menu label={t("export")} icon={<DownloadIcon />} items={exportItems} />}
      {themeToggle}
      {embed ? (
        <Button showLabel={false} icon={<ExternalIcon />} label={t("openInNewTab")} onClick={openInTab} />
      ) : (
        source.htmlUrl && (
          <a
            className="xv-btn xv-btn--invisible xv-btn--icon"
            href={source.htmlUrl}
            title={t("openOnGitHub")}
            aria-label={t("openOnGitHub")}
          >
            <ExternalIcon />
          </a>
        )
      )}
    </>
  );

  const libraryNote =
    scene?.libraryItemCount !== undefined ? (
      <span className="xv-chip">{t("libraryItems", { n: scene.libraryItemCount })}</span>
    ) : null;

  return (
    <div className={`xv-app${embed ? " xv-app--embed" : ""}`}>
      <Header compact={embed} title={<SourceTitle source={source} extra={libraryNote} />} actions={actions} />
      {dirty && <div className="xv-banner">{t("localEdits")}</div>}
      <main
        className="xv-canvas"
        data-testid="xv-canvas"
        onPointerDownCapture={() => (userMoved.current = true)}
        onWheelCapture={() => (userMoved.current = true)}
      >
        {error ? (
          <div className="xv-center xv-error" role="alert">
            <AlertIcon size={24} />
            <h1>{t("errorTitle")}</h1>
            <p>{error}</p>
          </div>
        ) : !scene ? (
          <Spinner label={t("loading")} />
        ) : (
          <>
            <Excalidraw
              excalidrawAPI={setApi}
              initialData={{
                elements: scene.elements,
                appState: { ...scene.appState, theme },
                files: scene.files,
                scrollToContent: true,
              }}
              viewModeEnabled={!editing}
              theme={theme}
              name={source.fileName.replace(/\.[^.]+$/, "")}
              langCode={excalidrawLangCode}
              autoFocus={!embed}
              handleKeyboardGlobally={!embed}
              detectScroll={false}
              onChange={(elements) => {
                if (initialVersion.current !== null) {
                  const changed = getSceneVersion(elements) !== initialVersion.current;
                  setDirty((d) => (d === changed ? d : changed));
                }
              }}
              UIOptions={{
                canvasActions: {
                  loadScene: false,
                  saveToActiveFile: false,
                  export: false,
                  saveAsImage: false,
                  clearCanvas: false,
                  toggleTheme: null,
                  changeViewBackgroundColor: editing,
                },
                tools: { image: false },
              }}
            >
              <MainMenu>
                {exportItems.map((item) => (
                  <MainMenu.Item key={item.id} icon={item.icon} onSelect={item.onSelect}>
                    {item.label}
                  </MainMenu.Item>
                ))}
                <MainMenu.Separator />
                {editing && <MainMenu.DefaultItems.ChangeCanvasBackground />}
                <MainMenu.DefaultItems.Help />
              </MainMenu>
            </Excalidraw>
            {scene.elements.every((e) => e.isDeleted) && (
              <div className="xv-empty-note">{t("emptyScene")}</div>
            )}
            {embed && !active && <div className="xv-embed-hint">{t("interactHint")}</div>}
          </>
        )}
      </main>
    </div>
  );
}
