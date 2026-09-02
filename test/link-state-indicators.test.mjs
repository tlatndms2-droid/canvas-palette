import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const canvasController = await readFile(new URL("../src/canvas/canvas-metadata-controller.ts", import.meta.url), "utf8");
const itemRenderer = await readFile(new URL("../src/ui/render.ts", import.meta.url), "utf8");
const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");

test("linked Canvas nodes render an isolated clickable top-left link badge", () => {
  assert.match(canvasController, /numberedCanvasLinkForNode\(canvasPath, nodeId\)/);
  assert.match(canvasController, /cp-canvas-link-badge/);
  assert.match(canvasController, /cp-canvas-link-badge__number/);
  assert.match(canvasController, /링크 \$\{numberedLink\?\.link\.number\}/);
  assert.match(canvasController, /setIcon\(linkBadge, "link-2"\)/);
  assert.match(canvasController, /revealPaletteItemForCanvasNode\(canvasPath, nodeId\)/);
  assert.match(canvasController, /linkBadge\.addEventListener\("pointerdown", \(event\) => event\.stopPropagation\(\)\)/);
  assert.match(styles, /\.cp-canvas-link-badge\{pointer-events:auto!important;cursor:pointer\}/);
  assert.match(styles, /\.cp-canvas-link-badge__number\{[^}]*width:calc\(14px/);
});

test("unlinked Palette state occupies a header slot separate from Front Back and selection", () => {
  assert.match(itemRenderer, /const unlinked = options\.unlinked \?\? canvasPaths\.length === 0/);
  assert.match(itemRenderer, /cp-item__header-actions/);
  assert.match(itemRenderer, /cp-item__link-state--unlinked/);
  assert.match(itemRenderer, /setIcon\(unlinkedBadge, "unlink"\)/);
  assert.match(styles, /\.cp-item__header-actions\{[^}]*display:flex[^}]*gap:4px/);
  assert.doesNotMatch(styles, /\.cp-item__link-state\{[^}]*position:absolute/);
  assert.match(styles, /\.cp-item__selection\{[^}]*position:absolute/);
  assert.match(styles, /\.cp-canvas-face-toggle\{[^}]*right:calc\(7px \* var\(--cp-canvas-meta-scale,1\)\)/);
});

test("Canvas indicators contain no unrequested Markdown type badge", () => {
  assert.doesNotMatch(canvasController, /cp-canvas-markdown-badge/);
  assert.doesNotMatch(styles, /\.cp-canvas-markdown-badge/);
});
