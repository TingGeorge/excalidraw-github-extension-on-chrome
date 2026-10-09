# Samples

One file per supported format (demos for the README, fixtures for `test/e2e/formats.spec.ts`).

- `how-it-works.excalidraw`: plain Excalidraw scene (JSON); source of the two exports below.
- `how-it-works.excalidraw.svg`: SVG export with the scene embedded.
- `how-it-works.excalidraw.png`: PNG export with the scene embedded.
- `obsidian-note.excalidraw.md`: Obsidian Excalidraw plugin note (LZ-String compressed drawing, a small mind map).
- `shapes.excalidrawlib`: Excalidraw library with four items (Database, User, Server, Cloud).

Regenerate: `node scripts/make-samples.mjs` (scene, note, library), then build and run
`XGP_DIST=<build dir> node scripts/export-samples.mjs` (SVG and PNG).
