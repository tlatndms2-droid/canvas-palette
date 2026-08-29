import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/mini-palette/floating-mini-palette.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

test("Mini Palette search updates results without rebuilding the floating window", () => {
  assert.match(source, /search\.addEventListener\("input", \(\) => \{ this\.search = search\.value; update\(\); \}\)/);
  assert.match(source, /this\.refreshStorageItems\(\)/);
  assert.doesNotMatch(source, /this\.search = search\.value; this\.render\(\)/);
});

test("Mini Palette exposes persistent view controls and stable pane resizing", () => {
  assert.match(source, /"layout-grid", "Grid view"/);
  assert.match(source, /"list", "List view"/);
  assert.match(source, /panel\.style\.setProperty\("--cp-left-pane-width"/);
  assert.match(source, /\}, \(\) => this\.plugin\.store\.changed\(\)\)/);
  assert.match(styles, /\.cp-asset-grid--list\{display:flex;flex-direction:column/);
});

test("Mini Palette uses command toggling, a full header drag surface, and eight resize edges", () => {
  assert.match(source, /toggle\(\): void/);
  assert.doesNotMatch(source, /trigger\.addEventListener\("mouseenter"/);
  assert.match(source, /this\.makeDraggable\(header, panel\)/);
  assert.match(source, /\["n", "ne", "e", "se", "s", "sw", "w", "nw"\]/);
  assert.match(styles, /\.cp-window-resize--nw/);
  assert.match(styles, /\.cp-window-resize--se/);
});
