import "./asset-path";
import "@excalidraw/excalidraw/index.css";
import "./viewer.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { readParams } from "./params";
import { preventFocusScroll } from "./useEmbed";

if (readParams().embed) preventFocusScroll();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
