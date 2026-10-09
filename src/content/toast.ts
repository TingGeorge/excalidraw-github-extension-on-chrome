import { h, MARK } from "./dom";

let timer: ReturnType<typeof setTimeout> | undefined;

/** Small transient message in the corner of the GitHub page. */
export function showToast(message: string, kind: "info" | "error" = "info") {
  document.querySelector(`[${MARK}="toast"]`)?.remove();
  const toast = h("div", { class: `xgp-toast xgp-toast--${kind}`, [MARK]: "toast", role: "status" }, message);
  document.body.append(toast);
  clearTimeout(timer);
  timer = setTimeout(() => toast.remove(), kind === "error" ? 6000 : 2500);
}
