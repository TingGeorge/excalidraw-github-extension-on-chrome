// Writes THIRD_PARTY_NOTICES.txt for everything bundled into the extension:
// all production npm dependencies (with their license texts when shipped) and
// the Excalidraw fonts.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FONTS = `Fonts bundled from @excalidraw/excalidraw (dist/prod/fonts):
  Excalifont, Virgil, Xiaolai, Lilita One, Nunito, Assistant, Cascadia Code,
  Liberation Sans — SIL Open Font License 1.1
  Comic Shanns — MIT License
See https://github.com/excalidraw/excalidraw/tree/master/packages/excalidraw/fonts`;

export function writeNotices(root, outFile) {
  const out = execFileSync("npm", ["ls", "--omit=dev", "--all", "--parseable"], {
    cwd: root,
    encoding: "utf8",
  });
  const dirs = [...new Set(out.split("\n").filter((d) => d && d !== root))].sort();
  const sections = [];
  const seen = new Set();
  for (const dir of dirs) {
    const pkgFile = join(dir, "package.json");
    if (!existsSync(pkgFile)) continue;
    const pkg = JSON.parse(readFileSync(pkgFile, "utf8"));
    const id = `${pkg.name}@${pkg.version}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const license =
      typeof pkg.license === "string"
        ? pkg.license
        : (pkg.license?.type ?? pkg.licenses?.map((l) => l.type ?? l).join(" OR ") ?? "UNKNOWN");
    const licenseFile = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f));
    const text = licenseFile ? readFileSync(join(dir, licenseFile), "utf8").trim() : "";
    sections.push(`${id} — ${license}${pkg.homepage ? `\n${pkg.homepage}` : ""}${text ? `\n\n${text}` : ""}`);
  }
  const header =
    "Excalidraw Preview for GitHub bundles the following third-party software.\n" +
    "Development-only tools are not included in the extension package.";
  writeFileSync(outFile, [header, FONTS, ...sections].join(`\n\n${"-".repeat(72)}\n\n`) + "\n");
  return sections.length;
}
