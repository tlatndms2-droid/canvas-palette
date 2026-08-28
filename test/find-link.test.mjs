import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const main = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
const store = await readFile(new URL("../src/core/store.ts", import.meta.url), "utf8");
const modal = await readFile(new URL("../src/ui/find-link-modal.ts", import.meta.url), "utf8");
const side = await readFile(new URL("../src/side-palette/side-palette-view.ts", import.meta.url), "utf8");
const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");

test("Find link groups placements to one selectable location per Canvas", () => {
  assert.match(store, /linkedCanvasLocations\(item: PaletteItem\)/);
  assert.match(store, /if \(!locations\.has\(location\.canvasPath\)\) locations\.set\(location\.canvasPath, location\)/);
  assert.match(main, /const locations = this\.store\.linkedCanvasLocations\(item\)/);
  assert.match(main, /if \(locations\.length === 1\) \{ void reveal\(locations\[0\]\); return; \}/);
  assert.match(main, /new FindLinkModal\(this\.app, item\.displayTitle, locations/);
});

test("Find link popup chooses an exact Canvas path and node", () => {
  assert.match(modal, /class FindLinkModal extends Modal/);
  assert.match(modal, /text: "Find link"/);
  assert.match(modal, /for \(const location of this\.locations\)/);
  assert.match(modal, /this\.onChoose\(location\)/);
  assert.match(main, /this\.canvas\.revealNode\(location\.canvasPath, location\.nodeId\)/);
  assert.match(side, /onLocate: \(\) => this\.plugin\.findLinkedCanvas\(item\)/);
});

test("Find link popup provides a large non-overlapping navigation target", () => {
  assert.match(modal, /this\.modalEl\.addClass\("cp-find-link-shell"\)/);
  assert.match(modal, /cp-find-link-row__path/);
  assert.match(modal, /cp-find-link-row__node/);
  assert.match(styles, /\.modal\.cp-find-link-shell\{width:min\(760px/);
  assert.match(styles, /\.cp-find-link-list\{[^}]*min-height:min\(300px,42vh\)/);
  assert.match(styles, /\.cp-find-link-row\{[^}]*min-height:68px/);
});
