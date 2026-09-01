import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Side and Mini palettes share the Explorer density model", async () => {
  const density = await readFile(new URL("../src/ui/asset-density.ts", import.meta.url), "utf8");
  const side = await readFile(new URL("../src/side-palette/side-palette-view.ts", import.meta.url), "utf8");
  const mini = await readFile(new URL("../src/mini-palette/floating-mini-palette.ts", import.meta.url), "utf8");
  const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(density, /ASSET_DENSITY_MAX = 6/);
  assert.match(density, /clampAssetDensity\(value\) === 0 \? "list" : "grid"/);
  assert.match(side, /applyAssetDensity\(listEl/);
  assert.match(mini, /applyAssetDensity\(grid/);
  assert.match(styles, /repeat\(auto-fill,minmax\(min\(var\(--cp-density-card-width/);
});

test("Mini Palette keeps Collect and Storage selections independent", async () => {
  const defaults = await readFile(new URL("../src/core/defaults.ts", import.meta.url), "utf8");
  const mini = await readFile(new URL("../src/mini-palette/floating-mini-palette.ts", import.meta.url), "utf8");
  assert.match(defaults, /collectSelectedItemIds: \[\]/);
  assert.match(defaults, /storageSelectedItemIds: \[\]/);
  assert.match(defaults, /collectSelectionAnchorId: null/);
  assert.match(defaults, /storageSelectionAnchorId: null/);
  assert.match(mini, /selectionFromEvent/);
  assert.match(mini, /event\.shiftKey && anchorId/);
  assert.match(mini, /mountStorageSelection/);
});

test("Mini batch actions use selected IDs and guarded Canvas placement", async () => {
  const mini = await readFile(new URL("../src/mini-palette/floating-mini-palette.ts", import.meta.url), "utf8");
  const main = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
  const canvas = await readFile(new URL("../src/canvas/canvas-adapter.ts", import.meta.url), "utf8");
  assert.match(mini, /Place on Canvas/);
  assert.match(mini, /new ConfirmMiniStorageRemovalModal/);
  assert.match(mini, /dragItemIds: selected/);
  assert.match(mini, /application\/x-canvas-palette-items/);
  assert.match(mini, /Export \$\{targetIds\.length\} item[\s\S]{0,100}to Canvas/);
  assert.match(mini, /exportItemsToActiveCanvas\(targetIds\)/);
  assert.match(main, /async exportItemsToActiveCanvas\(itemIds: string\[\]\)/);
  assert.match(canvas, /async restoreItems\(items: PaletteItem\[\], screenX: number, screenY: number\)/);
});

test("Mini Storage is workspace-independent and removes relay links without deleting source items", async () => {
  const types = await readFile(new URL("../src/core/types.ts", import.meta.url), "utf8");
  const defaults = await readFile(new URL("../src/core/defaults.ts", import.meta.url), "utf8");
  const store = await readFile(new URL("../src/core/store.ts", import.meta.url), "utf8");
  const mini = await readFile(new URL("../src/mini-palette/floating-mini-palette.ts", import.meta.url), "utf8");
  assert.match(types, /storageItemIds: string\[\]/);
  assert.match(defaults, /storageWorkspaceFilter: _legacyStorageWorkspaceFilter, hiddenStorageItemIds: _legacyHiddenStorageItemIds/);
  assert.match(defaults, /storageItemIds: legacyMiniPalette\.storageItemIds/);
  assert.doesNotMatch(mini, /storageWorkspaceFilter/);
  assert.doesNotMatch(mini, /text: "Workspace"/);
  assert.match(mini, /storageCandidates\(\)/);
  assert.match(mini, /text: "Remove from Mini"/);
  assert.match(mini, /type === "markdown" \? "MD"/);
  assert.match(store, /addMiniStorageItems\(itemIds: string\[\]\)/);
  assert.match(store, /removeMiniStorageItems\(itemIds: string\[\]\)/);
  const addToStorage = store.slice(store.indexOf("addMiniStorageItems(itemIds: string[])"), store.indexOf("itemLinkedToWorkspace", store.indexOf("addMiniStorageItems(itemIds: string[])")));
  assert.doesNotMatch(addToStorage, /!pending\.has\(id\)/);
  assert.doesNotMatch(mini, /!this\.plugin\.store\.data\.pendingItemIds\.includes\(item\.id\)/);
  assert.match(store, /storageItemIds = \[\.\.\.linked\]/);
});

test("Mini Collect and Storage use the same Canvas and source-file navigation labels", async () => {
  const mini = await readFile(new URL("../src/mini-palette/floating-mini-palette.ts", import.meta.url), "utf8");
  const menu = mini.slice(mini.indexOf("private openMiniItemMenu"), mini.indexOf("private confirmPendingDelete"));
  assert.match(menu, /setTitle\("Locate on Canvas"\)/);
  assert.match(menu, /else if \(item\.origin\.filePath\) menu\.addItem\(\(entry\) => entry\.setTitle\("Open source file"\)/);
  assert.doesNotMatch(menu, /Open original/);
});

test("Canvas Collect always opens Collect and never redirects existing items to Storage", async () => {
  const main = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
  const start = main.indexOf("async collectCanvasSelection()");
  const end = main.indexOf("\n  sendItemsToMini", start);
  const collect = main.slice(start, end);
  assert.match(collect, /store\.collectCanvasItems\(items\)/);
  assert.match(collect, /miniPalette\.tab = "collect"/);
  assert.doesNotMatch(collect, /addMiniStorageItems|tab = "storage"|sent to Mini Storage/);
});
