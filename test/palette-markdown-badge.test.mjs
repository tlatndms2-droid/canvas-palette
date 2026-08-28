import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const render = await readFile(new URL("../src/ui/render.ts", import.meta.url), "utf8");
const canvas = await readFile(new URL("../src/canvas/canvas-metadata-controller.ts", import.meta.url), "utf8");
const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");

test("Palette Markdown items label their existing file icon with MD only in the Palette", () => {
  assert.match(render, /if \(item\.type === "markdown"\)/);
  assert.match(render, /cp-item__type-badge--markdown/);
  assert.match(render, /cp-item__type-badge-label", text: "MD"/);
  assert.match(styles, /\.cp-item__type-badge--markdown\{[^}]*display:inline-flex/);
  assert.doesNotMatch(canvas, /cp-canvas-markdown-badge/);
  assert.doesNotMatch(styles, /\.cp-canvas-markdown-badge/);
});
