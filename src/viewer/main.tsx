import "./asset-path";
import "@excalidraw/excalidraw/index.css";
import "./viewer.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { locale } from "../shared/i18n";
import { App } from "./App";
import { readParams } from "./params";
import { installPixelSnapping } from "./pixel-snap";
import { preventFocusScroll } from "./useEmbed";

installPixelSnapping();
if (readParams().embed) preventFocusScroll();
document.documentElement.lang = locale;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
