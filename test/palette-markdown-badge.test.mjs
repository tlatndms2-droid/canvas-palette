import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const render = await readFile(new URL("../src/ui/render.ts", import.meta.url), "utf8");
const canvas = await readFile(new URL("../src/canvas/canvas-metadata-controller.ts", import.meta.url), "utf8");
const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");

test("Palette item headers use color icons without type text and show complete wrapping titles", () => {
  assert.match(render, /`cp-item__type-badge--\$\{item\.type\}`/);
  assert.doesNotMatch(render, /TYPE_LABEL/);
  assert.doesNotMatch(render, /cp-item__type-badge-label/);
  assert.match(styles, /\.cp-item__title\{[^}]*overflow-wrap:anywhere[^}]*white-space:normal/);
  assert.match(styles, /\.cp-item__type-badge\{[^}]*display:grid/);
  assert.match(styles, /\.cp-item__type-badge--card\{--cp-type-color:#d99100\}/);
  assert.match(styles, /\.cp-item__type-badge--markdown\{--cp-type-color:#22a55a\}/);
  assert.match(styles, /\.cp-item__type-badge--image\{--cp-type-color:#f06445\}/);
  assert.match(styles, /\.cp-item__type-badge--group\{--cp-type-color:#7657d6\}/);
  assert.doesNotMatch(canvas, /cp-canvas-markdown-badge/);
  assert.doesNotMatch(styles, /\.cp-canvas-markdown-badge/);
});
