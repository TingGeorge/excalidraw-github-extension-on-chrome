// Downloads real GitHub pages into test/fixtures/github/ so the e2e tests run
// the content script against GitHub's actual markup. External scripts and
// stylesheets are stripped (tests run offline); embedded JSON data is kept.
//
// Usage: node scripts/capture-fixtures.mjs <name> <github-url> [<name> <url> ...]
//        node scripts/capture-fixtures.mjs --derive   (see deriveDiffFixtures below)
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "test/fixtures/github");
const args = process.argv.slice(2);
const derive = args[0] === "--derive";
if (!derive && (args.length === 0 || args.length % 2)) {
  console.error("Usage: node scripts/capture-fixtures.mjs <name> <url> [...] | --derive");
  process.exit(1);
}

function sanitize(html) {
  return html
    .replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/gi, "")
    .replace(/<script\b(?![^>]*type="application\/json")[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(
      /<link\b[^>]*rel="(?:stylesheet|modulepreload|preload|prefetch|dns-prefetch|preconnect)"[^>]*>/gi,
      "",
    )
    .replace(/\s(?:nonce|integrity)="[^"]*"/gi, "")
    .replace(/\n\s*\n+/g, "\n");
}

for (let i = 0; !derive && i < args.length; i += 2) {
  const [name, url] = [args[i], args[i + 1]];
  const res = await fetch(url, { headers: { Accept: "text/html" } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const html = sanitize(await res.text());
  await writeFile(join(out, `${name}.html`), html);
  console.log(`${name}.html  ${(html.length / 1024).toFixed(0)} KB  ← ${url}`);
}

// --- Derived diff fixtures ------------------------------------------------------
//
// GitHub only server-renders the first file(s) of a diff. On the classic PR
// "Files changed" page the rest arrives through
// <include-fragment src="/OWNER/REPO/diffs?...&start_entry=1">, and the React
// commit page renders only the first file. The `/diffs` endpoint was not
// reachable from the capture environment, so the files the e2e tests need are
// built by cloning GitHub's real markup for the first file (`.gitignore`) and
// swapping in the other file's path, anchor (sha256 of the path), diffstat and
// diff rows (computed with `git diff` from the local clone, which must contain
// the commits below).
//
//   pr-files-diffs.html  stand-in for the /diffs fragment of pr-files.html
//   pr-files-full.html   pr-files.html with that fragment spliced in place of
//                        the progressive include-fragment
//   commit-full.html     commit.html with a second React diff (the sample)
//   how-it-works.{base,head}.excalidraw
//                        the sample at both commits, served as the raw files

const BASE_SHA = "e4413eeae42e4f3853ca8ad80372e995b022509b";
const HEAD_SHA = "2fa800062b33136871c6cd109d770279c9f88b4a";
const PR_FRAGMENT_FILES = [
  "playwright.config.ts",
  "samples/how-it-works.excalidraw",
  "static/icons/icon.svg",
];
const COMMIT_EXTRA_FILES = ["samples/how-it-works.excalidraw"];
const TEMPLATE_PATH = ".gitignore";

const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const esc = (text) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Parsed `git diff` of one file: hunks of [kind, oldLine, newLine, text]. */
function gitDiff(path) {
  const text = execFileSync("git", ["diff", "--no-color", "-U3", BASE_SHA, HEAD_SHA, "--", path], {
    cwd: root,
    encoding: "utf8",
  });
  const hunks = [];
  let oldNo = 0;
  let newNo = 0;
  let added = 0;
  let deleted = 0;
  for (const line of text.split("\n")) {
    const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (m) {
      oldNo = Number(m[1]);
      newNo = Number(m[2]);
      hunks.push({ header: line, lines: [] });
    } else if (!hunks.length || line.startsWith("\\")) {
      continue;
    } else if (line.startsWith("+")) {
      hunks.at(-1).lines.push(["add", null, newNo++, line.slice(1)]);
      added++;
    } else if (line.startsWith("-")) {
      hunks.at(-1).lines.push(["del", oldNo++, null, line.slice(1)]);
      deleted++;
    } else if (line.startsWith(" ")) {
      hunks.at(-1).lines.push(["ctx", oldNo++, newNo++, line.slice(1)]);
    }
  }
  return { hunks, added, deleted };
}

function fileType(path) {
  const name = path.split("/").pop();
  if (name.startsWith(".") && !name.slice(1).includes(".")) return "dotfile";
  return name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
}

/** GitHub's five diffstat squares. */
function squares(added, deleted) {
  const total = added + deleted;
  const a = total ? Math.round((added / total) * 5) : 0;
  const d = total ? Math.min(5 - a, Math.round((deleted / total) * 5)) : 0;
  return ["added", a, "deleted", d, "neutral", 5 - a - d];
}

/** Index just past the element that starts at `start` (balanced `<tag` / `</tag>`). */
function elementEnd(html, start, tag) {
  const re = new RegExp(`<${tag}\\b|</${tag}>`, "g");
  re.lastIndex = start;
  let depth = 0;
  for (let m; (m = re.exec(html));) {
    depth += m[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return m.index + m[0].length;
  }
  throw new Error(`unbalanced <${tag}>`);
}

/** Replace the template file's identity (path, anchor, ids) in cloned markup. */
function retarget(html, path) {
  const anchor = sha256(path);
  const fromAnchor = sha256(TEMPLATE_PATH);
  return html
    .replaceAll(fromAnchor, anchor)
    .replaceAll(`data-short-path="${fromAnchor.slice(0, 7)}"`, `data-short-path="${anchor.slice(0, 7)}"`)
    .replaceAll(`data-file-type="${fileType(TEMPLATE_PATH)}"`, `data-file-type="${fileType(path)}"`)
    .replaceAll(TEMPLATE_PATH, path);
}

function classicRows(path, diff) {
  const a = `diff-${sha256(path)}`;
  const rows = [];
  diff.hunks.forEach((hunk, i) => {
    const hunkId = sha256(`${path}:${i}`);
    rows.push(`      <tr data-position="0">
    <td id="${a}HL${i + 1}" class="blob-num blob-num-hunk non-expandable" data-line-number="..."></td>
    <td id="${a}HR${i + 1}" class="blob-num blob-num-hunk non-expandable" data-line-number="..."></td>
    <td class="blob-code blob-code-inner blob-code-hunk">${esc(hunk.header)}</td>
  </tr>`);
    for (const [kind, o, n, text] of hunk.lines) {
      const cls = { ctx: "context", add: "addition", del: "deletion" }[kind];
      const marker = { ctx: " ", add: "+", del: "-" }[kind];
      const left =
        o === null
          ? `<td class="blob-num blob-num-${cls} empty-cell"></td>`
          : `<td id="${a}L${o}" data-line-number="${o}"
        class="blob-num blob-num-${cls} js-linkable-line-number"></td>`;
      const right =
        n === null
          ? `<td class="blob-num blob-num-${cls} empty-cell"></td>`
          : `<td id="${a}R${n}" data-line-number="${n}"
        class="blob-num blob-num-${cls} js-linkable-line-number js-blob-rnum"></td>`;
      rows.push(`    <tr data-hunk="${hunkId}" class="show-top-border">
    ${left}
    ${right}
  <td class="blob-code blob-code-${cls}  js-file-line">
    <span class='blob-code-inner blob-code-marker ' data-code-marker="${marker}">${esc(text)}</span></td>
</tr>`);
    }
  });
  return rows.join("\n");
}

function reactRows(path, diff) {
  const a = `diff-${sha256(path)}`;
  const cell = (id, style, cls, inner, extra = "") =>
    `<td data-grid-cell-id="${a}-${id}"${extra} data-selected="false" role="gridcell" style="${style}" tabindex="-1" valign="top" class="${cls}">${inner}</td>`;
  const rows = [];
  let o0 = 0;
  let n0 = 0;
  for (const hunk of diff.hunks) {
    rows.push(
      `<tr class="diff-line-row" data-row-selected="false">${cell(`${o0}-${n0}-0`, "background-color:var(--bgColor-accent-muted, var(--color-accent-subtle));flex-grow:1", "focusable-grid-cell diff-hunk-cell left-side", `<div class="d-flex flex-row"><code class="diff-text-cell hunk"><div class="diff-text-inner color-fg-muted">${esc(hunk.header)}</div></code></div>`, ' colSpan="4"')}</tr>`,
    );
    for (const [kind, o, n, text] of hunk.lines) {
      o0 = o ?? o0;
      n0 = n ?? n0;
      const name = { ctx: null, add: "addition", del: "deletion" }[kind];
      const numBg = name
        ? `background-color:var(--diffBlob-${name}Num-bgColor, var(--diffBlob-${name}-bgColor-num));text-align:center`
        : "background-color:var(--bgColor-default);text-align:center";
      const lineBg = name
        ? `background-color:var(--diffBlob-${name}Line-bgColor, var(--diffBlob-${name}-bgColor-line));padding-right:24px`
        : "background-color:var(--bgColor-default);padding-right:24px";
      const numCls = `focusable-grid-cell diff-line-number position-relative${name ? "" : " diff-line-number-neutral"} left-side`;
      const marker = name ? `<span class="diff-text-marker">${kind === "add" ? "+" : "-"}</span>` : "";
      rows.push(
        `<tr class="diff-line-row" data-row-selected="false">` +
          cell(`${o0}-${n0}-0`, numBg, numCls, `<code>${o ?? ""}</code>`) +
          cell(`${o0}-${n0}-1`, numBg, numCls, `<code>${n ?? ""}</code>`) +
          cell(
            `${o0}-${n0}-2`,
            lineBg,
            "focusable-grid-cell diff-text-cell right-side-diff-cell  left-side",
            `<code class="diff-text syntax-highlighted-line${name ? ` ${name}` : ""}">${marker}<div class="diff-text-inner">${esc(text)}</div></code>`,
            ` data-line-anchor="${a}${n === null ? `L${o}` : `R${n}`}"`,
          ) +
          `</tr>`,
      );
    }
  }
  return rows.join("");
}

function classicEntry(template, path) {
  const diff = gitDiff(path);
  const total = diff.added + diff.deleted;
  const [, a, , d, , n] = squares(diff.added, diff.deleted);
  const blocks =
    '<span class="diffstat-block-added"></span>'.repeat(a) +
    '<span class="diffstat-block-deleted"></span>'.repeat(d) +
    '<span class="diffstat-block-neutral"></span>'.repeat(n);
  let html = template
    .replace(/(<tbody>)[\s\S]*(<\/tbody>)/, `$1\n${classicRows(path, diff)}\n                $2`)
    .replace(
      /\d+ changes: \d+ additions &amp; \d+ deletions/,
      `${total} changes: ${diff.added} additions &amp; ${diff.deleted} deletions`,
    )
    .replace(
      /(<span class="diffstat" aria-hidden="true">)[\s\S]*?(<\/span><\/span>|<\/span>\n)/,
      `$1${total} ${blocks}</span>`,
    );
  html = retarget(html, path);
  return `    <div class="js-diff-progressive-container">${html}\n</div>\n`;
}

function reactRegion(template, path, idSuffix) {
  const diff = gitDiff(path);
  const total = diff.added + diff.deleted;
  const [, a, , d, , n] = squares(diff.added, diff.deleted);
  const square = (kind) =>
    `<div data-testid="${kind} diffstat" class="DiffSquares-module__diffSquare__r6Bwa DiffSquares-module__${kind}__wxDmF"></div>`;
  const stat =
    `<span aria-hidden="true" class="f6 fgColor-success text-bold">+<!-- -->${diff.added}</span>` +
    (diff.deleted
      ? `<span aria-hidden="true" class="f6 fgColor-danger text-bold">-<!-- -->${diff.deleted}</span>`
      : "") +
    `<span class="sr-only">Lines changed: ${diff.added} additions &amp; ${diff.deleted} deletions</span>` +
    `<div class="d-flex">${square("addition").repeat(a)}${square("deletion").repeat(d)}${square("neutral").repeat(n)}</div>`;
  void total;
  let html = template
    .replace(/(<tbody>)[\s\S]*(<\/tbody>)/, `$1${reactRows(path, diff)}$2`)
    .replace(
      /<span aria-hidden="true" class="f6 fgColor-success[\s\S]*?<div class="d-flex">(?:<div data-testid="[^"]*diffstat"[^>]*><\/div>)*<\/div>/,
      stat,
    )
    .replace(/_R_([0-9a-z]*)al85_/g, `_R_$1al${idSuffix}_`);
  return retarget(html, path);
}

function deriveDiffFixtures() {
  // Classic PR "Files changed" page.
  const pr = readFileSync(join(out, "pr-files.html"), "utf8");
  const entryStart = pr.indexOf(`<copilot-diff-entry\n  data-file-path="${TEMPLATE_PATH}"`);
  const entryEnd = pr.indexOf("</copilot-diff-entry>", entryStart) + "</copilot-diff-entry>".length;
  if (entryStart < 0 || entryEnd < entryStart) throw new Error("pr-files.html: template entry not found");
  const entry = pr.slice(entryStart, entryEnd);
  const fragment = PR_FRAGMENT_FILES.map((path) => classicEntry(entry, path)).join("");
  writeFileSync(join(out, "pr-files-diffs.html"), fragment);

  const loader = pr.indexOf('<include-fragment data-targets="diff-file-filter.progressiveLoaders"');
  const containerStart = pr.lastIndexOf('<div class="js-diff-progressive-container">', loader);
  if (loader < 0 || containerStart < 0) throw new Error("pr-files.html: progressive loader not found");
  const containerEnd = elementEnd(pr, containerStart, "div");
  writeFileSync(
    join(out, "pr-files-full.html"),
    pr.slice(0, containerStart) + fragment + pr.slice(containerEnd),
  );

  // React commit page.
  const commit = readFileSync(join(out, "commit.html"), "utf8");
  const header = commit.indexOf('class="DiffFileHeader-module__diff-file-header');
  const regionStart = commit.lastIndexOf('<div role="region"', header);
  if (header < 0 || regionStart < 0) throw new Error("commit.html: diff region not found");
  const regionEnd = elementEnd(commit, regionStart, "div");
  const region = commit.slice(regionStart, regionEnd);
  const extra = COMMIT_EXTRA_FILES.map((path, i) => reactRegion(region, path, 86 + i)).join("");
  writeFileSync(join(out, "commit-full.html"), commit.slice(0, regionEnd) + extra + commit.slice(regionEnd));

  // Raw file contents for both sides of the diff.
  const sample = "samples/how-it-works.excalidraw";
  for (const [side, sha] of [
    ["base", BASE_SHA],
    ["head", HEAD_SHA],
  ]) {
    const text = execFileSync("git", ["show", `${sha}:${sample}`], { cwd: root, encoding: "utf8" });
    writeFileSync(join(out, `how-it-works.${side}.excalidraw`), text);
  }

  for (const name of [
    "pr-files-diffs.html",
    "pr-files-full.html",
    "commit-full.html",
    "how-it-works.base.excalidraw",
    "how-it-works.head.excalidraw",
  ]) {
    console.log(`derived ${name}`);
  }
}

if (derive) deriveDiffFixtures();
