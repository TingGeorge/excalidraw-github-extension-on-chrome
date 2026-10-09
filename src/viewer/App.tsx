import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "../shared/i18n";
import type { Payload } from "../shared/protocol";
import { Header } from "./components/Header";
import { AlertIcon, FileIcon } from "./components/Icons";
import { Button, Spinner, ToastProvider } from "./components/ui";
import { payloadFromFile, resolvePayload } from "./data";
import { DiffViewer } from "./DiffViewer";
import { readParams } from "./params";
import { SceneViewer } from "./SceneViewer";
import { useTheme } from "./theme";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; payload: Payload }
  | { status: "pick" };

export function App() {
  const params = useMemo(() => readParams(), []);
  const [state, setState] = useState<State>({ status: "loading" });
  const [theme, setTheme] = useTheme(params.theme);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    resolvePayload(params).then(
      (payload) => {
        if (cancelled) return;
        if (payload?.theme && !params.theme) setTheme(payload.theme);
        setState(payload ? { status: "ready", payload } : { status: "pick" });
      },
      (err: unknown) => {
        if (!cancelled)
          setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [params, attempt, setTheme]);

  const openFile = useCallback(async (file: File) => {
    try {
      setState({ status: "ready", payload: await payloadFromFile(file) });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  let body;
  switch (state.status) {
    case "loading":
      body = (
        <div className="xv-app">
          <Spinner label={params.url ? t("loadingFile") : t("loading")} />
        </div>
      );
      break;
    case "error":
      body = (
        <div className="xv-app">
          {!params.embed && <Header title={<span className="xv-title__name">Excalidraw Preview</span>} />}
          <div className="xv-center xv-error" role="alert">
            <AlertIcon size={24} />
            <h1>{t("errorTitle")}</h1>
            <p>{state.message}</p>
            {(params.id || params.url) && (
              <Button
                label={t("retry")}
                onClick={() => {
                  setState({ status: "loading" });
                  setAttempt((a) => a + 1);
                }}
              />
            )}
          </div>
        </div>
      );
      break;
    case "pick":
      body = <FilePicker onFile={openFile} />;
      break;
    case "ready":
      body =
        state.payload.mode === "diff" ? (
          <DiffViewer payload={state.payload} embed={params.embed} theme={theme} onThemeChange={setTheme} />
        ) : (
          <SceneViewer payload={state.payload} embed={params.embed} theme={theme} onThemeChange={setTheme} />
        );
      break;
  }
  return <ToastProvider>{body}</ToastProvider>;
}

function FilePicker({ onFile }: { onFile: (file: File) => void }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    document.title = "Excalidraw Preview";
  }, []);
  return (
    <div className="xv-app">
      <Header title={<span className="xv-title__name">Excalidraw Preview</span>} />
      <div
        className={`xv-drop${over ? " xv-drop--over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const file = e.dataTransfer.files[0];
          if (file) onFile(file);
        }}
      >
        <FileIcon size={32} />
        <h1>{t("dropTitle")}</h1>
        <p className="xv-muted">{t("dropHint")}</p>
        <Button variant="primary" label={t("chooseFile")} onClick={() => inputRef.current?.click()} />
        <input
          ref={inputRef}
          type="file"
          hidden
          accept=".excalidraw,.json,.svg,.png,.md,.excalidrawlib"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
          }}
        />
      </div>
    </div>
  );
}
