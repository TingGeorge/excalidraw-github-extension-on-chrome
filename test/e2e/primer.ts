import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./fixtures";

/**
 * GitHub's own stylesheets can't be fetched in tests, but GitHub builds its UI
 * from Primer, whose npm packages ship the same CSS (including the hashed
 * `prc-*` class names in the captured pages). Injecting it makes screenshots
 * of fixture pages look close to the real site.
 */
let cached: string | null = null;

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return cssFiles(path);
    return name.endsWith(".css") ? [path] : [];
  });
}

export function primerCss(): string {
  if (cached) return cached;
  const primer = join(ROOT, "node_modules/@primer");
  const primitives = join(primer, "primitives/dist/css");
  const files = [
    ...[
      "base",
      "functional/size",
      "functional/typography",
      "functional/motion",
      "functional/spacing",
    ].flatMap((d) => cssFiles(join(primitives, d))),
    join(primitives, "functional/themes/light.css"),
    join(primitives, "functional/themes/dark.css"),
    join(primer, "css/dist/primer.css"),
    ...cssFiles(join(primer, "react/dist")),
  ];
  cached = files.map((f) => readFileSync(f, "utf8")).join("\n");
  return cached;
}

/** Add Primer CSS to captured GitHub HTML and force a color mode. */
export function styled(html: string, mode: "light" | "dark" = "light"): string {
  return html
    .replace(/data-color-mode="[^"]*"/, `data-color-mode="${mode}"`)
    .replace("</head>", `<style>${primerCss()}</style></head>`);
}
