import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const canvasController = await readFile(new URL("../src/canvas/canvas-metadata-controller.ts", import.meta.url), "utf8");
const itemRenderer = await readFile(new URL("../src/ui/render.ts", import.meta.url), "utf8");
const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");

test("linked Canvas nodes render an isolated clickable top-left link badge", () => {
  assert.match(canvasController, /linkedItemForNode\(canvasPath, nodeId\)/);
  assert.match(canvasController, /cp-canvas-link-badge/);
  assert.match(canvasController, /setIcon\(linkBadge, "link-2"\)/);
  assert.match(canvasController, /revealPaletteItemForCanvasNode\(canvasPath, nodeId\)/);
  assert.match(canvasController, /linkBadge\.addEventListener\("pointerdown", \(event\) => event\.stopPropagation\(\)\)/);
  assert.match(styles, /\.cp-canvas-link-badge\{pointer-events:auto!important;cursor:pointer\}/);
});

test("unlinked Palette state occupies a header slot separate from Front Back and selection", () => {
  assert.match(itemRenderer, /const unlinked = canvasPaths\.length === 0/);
  assert.match(itemRenderer, /cp-item__header-actions/);
  assert.match(itemRenderer, /cp-item__link-state--unlinked/);
  assert.match(itemRenderer, /setIcon\(unlinkedBadge, "unlink"\)/);
  assert.match(styles, /\.cp-item__header-actions\{[^}]*display:flex[^}]*gap:4px/);
  assert.doesNotMatch(styles, /\.cp-item__link-state\{[^}]*position:absolute/);
  assert.match(styles, /\.cp-item__selection\{[^}]*position:absolute/);
  assert.match(styles, /\.cp-canvas-face-toggle\{[^}]*right:calc\(7px \* var\(--cp-canvas-meta-scale,1\)\)/);
});

test("Markdown Canvas nodes show an MD badge between link and Front Back controls", () => {
  assert.match(canvasController, /const isMarkdownFile = type === "file" && typeof data\?\.file === "string" && \/\\\.md\$\/i\.test\(data\.file\)/);
  assert.match(canvasController, /cp-canvas-markdown-badge/);
  assert.match(canvasController, /text: "MD"/);
  assert.match(styles, /\.cp-canvas-markdown-badge\{[^}]*left:calc\(34px \* var\(--cp-canvas-meta-scale,1\)\)/);
  assert.match(styles, /\.cp-canvas-link-badge\{left:calc\(7px \* var\(--cp-canvas-meta-scale,1\)\)/);
  assert.match(styles, /\.cp-canvas-face-toggle\{right:calc\(7px \* var\(--cp-canvas-meta-scale,1\)\)/);
});
