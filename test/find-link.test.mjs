import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const main = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
const store = await readFile(new URL("../src/core/store.ts", import.meta.url), "utf8");
const modal = await readFile(new URL("../src/ui/find-link-modal.ts", import.meta.url), "utf8");
const side = await readFile(new URL("../src/side-palette/side-palette-view.ts", import.meta.url), "utf8");
const mini = await readFile(new URL("../src/mini-palette/floating-mini-palette.ts", import.meta.url), "utf8");
const itemEditor = await readFile(new URL("../src/ui/modal.ts", import.meta.url), "utf8");
const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");

test("Find link preserves every linked node and numbers them independently per Canvas", () => {
  assert.match(store, /numberedCanvasLinks\(item: PaletteItem\)/);
  assert.match(store, /number: index \+ 1, total: entries\.length/);
  assert.match(main, /const locations = this\.store\.numberedCanvasLinks\(item\)/);
  assert.match(main, /if \(locations\.length === 1\) \{ void reveal\(locations\[0\]\); return; \}/);
  assert.match(main, /new FindLinkModal\(this\.app, item\.displayTitle, locations/);
});

test("Find link uses Canvas choice then numbered link choice", () => {
  assert.match(modal, /text: "Canvas 선택"/);
  assert.match(modal, /text: "링크 번호 선택"/);
  assert.match(modal, /text: `링크 \$\{link\.number\}`/);
  assert.match(modal, /this\.selectedCanvasPath = canvas\.canvasPath/);
  assert.match(modal, /this\.selectedCanvasPath = null/);
  assert.match(modal, /this\.onChoose\(link\)/);
  assert.match(main, /this\.canvas\.revealNode\(location\.canvasPath, location\.nodeId\)/);
});

test("Find link keeps a fixed header and scrollable number rows", () => {
  assert.match(modal, /cp-find-link-list--numbers/);
  assert.match(styles, /\.modal\.cp-find-link-shell\{width:min\(760px/);
  assert.match(styles, /\.cp-find-link-list\{[^}]*max-height:min\(62vh,560px\)[^}]*overflow-y:auto/);
  assert.match(styles, /\.canvas-palette button\.cp-find-link-number-row\{[^}]*min-height:52px!important/);
});

test("Side, Mini, and item editor share the numbered Canvas locator", () => {
  assert.match(side, /onLocate: \(\) => this\.plugin\.findLinkedCanvas\(item\)/);
  assert.match(mini, /this\.plugin\.store\.numberedCanvasLinks\(item\)\.length > 0/);
  assert.match(mini, /this\.plugin\.locateItemOnCanvas\(item\)/);
  assert.match(itemEditor, /this\.plugin\.store\.numberedCanvasLinks\(item\)\.length > 0/);
});
