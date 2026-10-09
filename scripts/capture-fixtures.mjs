// Downloads real GitHub pages into test/fixtures/github/ so the e2e tests run
// the content script against GitHub's actual markup. External scripts and
// stylesheets are stripped (tests run offline); embedded JSON data is kept.
//
// Usage: node scripts/capture-fixtures.mjs <name> <github-url> [<name> <url> ...]
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const out = join(dirname(fileURLToPath(import.meta.url)), "../test/fixtures/github");
const args = process.argv.slice(2);
if (args.length === 0 || args.length % 2) {
  console.error("Usage: node scripts/capture-fixtures.mjs <name> <url> [...]");
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

for (let i = 0; i < args.length; i += 2) {
  const [name, url] = [args[i], args[i + 1]];
  const res = await fetch(url, { headers: { Accept: "text/html" } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const html = sanitize(await res.text());
  await writeFile(join(out, `${name}.html`), html);
  console.log(`${name}.html  ${(html.length / 1024).toFixed(0)} KB  ← ${url}`);
}
