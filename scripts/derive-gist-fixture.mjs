// Builds test/fixtures/github/gist.html from a real gist page so the e2e tests
// run against GitHub's actual gist markup, without shipping a stranger's gist:
// the user, gist id, description and file contents are replaced with our own
// sample (an Excalidraw file plus a Markdown file).
//
// Usage: curl -sS https://gist.github.com/<user>/<id> > /tmp/gist.html
//        node scripts/derive-gist-fixture.mjs /tmp/gist.html
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [input] = process.argv.slice(2);
if (!input) throw new Error("Usage: node scripts/derive-gist-fixture.mjs <saved gist page.html>");
let html = readFileSync(input, "utf8");

const fileBlock = /<div id="file-[^"]+" class="file my-2">[\s\S]*?<\/table>\s*<\/div>\s*<\/div>\s*<\/div>/;
const block = fileBlock.exec(html)?.[0];
if (!block) throw new Error("No gist file block found");
const oldName = /class="user-select-contain gist-blob-name css-truncate-target">\s*([^<\s]+)\s*</.exec(
  block,
)[1];
const user = /href="\/([^/"]+)\/([0-9a-f]{20,})\/raw\//.exec(block);
const [, oldUser, oldId] = user;

const escape = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slug = (name) => `file-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

function makeBlock(name, text) {
  const rows = text
    .split("\n")
    .slice(0, 40)
    .map(
      (line, i) =>
        `<tr><td id="${slug(name)}-L${i + 1}" class="blob-num js-line-number js-blob-rnum" data-line-number="${i + 1}"></td>` +
        `<td id="${slug(name)}-LC${i + 1}" class="blob-code blob-code-inner js-file-line">${escape(line)}</td></tr>`,
    )
    .join("\n");
  return block
    .split(oldName)
    .join(name)
    .split(slug(oldName))
    .join(slug(name))
    .replace(/<table([^>]*)>[\s\S]*<\/table>/, `<table$1>\n${rows}\n</table>`);
}

const sample = readFileSync(join(root, "samples/how-it-works.excalidraw"), "utf8");
const files =
  makeBlock("how-it-works.excalidraw", sample) + makeBlock("notes.md", "# Notes\n\nDiagram for the README.");
html = html.replace(fileBlock, files);

const NEW_USER = "example-user";
const NEW_ID = "0f1e2d3c4b5a69788796a5b4c3d2e1f0";
html = html.split(oldUser).join(NEW_USER).split(oldId).join(NEW_ID);
const oldAbout = /<div itemprop="about">\s*([\s\S]*?)\s*<\/div>/.exec(html)?.[1];
if (oldAbout) html = html.split(oldAbout).join("Excalidraw sample");
// Drop avatars and other external images.
html = html.replace(/<img\b[^>]*>/g, "");
// Strip scripts/styles like capture-fixtures.mjs does.
html = html
  .replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/gi, "")
  .replace(/<script\b(?![^>]*type="application\/json")[^>]*>[\s\S]*?<\/script>/gi, "")
  .replace(
    /<link\b[^>]*rel="(?:stylesheet|modulepreload|preload|prefetch|dns-prefetch|preconnect)"[^>]*>/gi,
    "",
  )
  .replace(/\s(?:nonce|integrity)="[^"]*"/gi, "")
  .replace(/\n\s*\n+/g, "\n");

const out = join(root, "test/fixtures/github/gist.html");
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KB) from ${oldUser}/${oldId}`);
