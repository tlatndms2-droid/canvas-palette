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
  const canvas = await readFile(new URL("../src/canvas/canvas-adapter.ts", import.meta.url), "utf8");
  assert.match(mini, /Place on Canvas/);
  assert.match(mini, /new ConfirmMiniStorageRemovalModal/);
  assert.match(mini, /dragItemIds: selected/);
  assert.match(mini, /application\/x-canvas-palette-items/);
  assert.match(canvas, /async restoreItems\(items: PaletteItem\[\], screenX: number, screenY: number\)/);
});

test("Mini Storage is workspace-independent and removes relay links without deleting source items", async () => {
  const types = await readFile(new URL("../src/core/types.ts", import.meta.url), "utf8");
  const defaults = await readFile(new URL("../src/core/defaults.ts", import.meta.url), "utf8");
  const store = await readFile(new URL("../src/core/store.ts", import.meta.url), "utf8");
  const mini = await readFile(new URL("../src/mini-palette/floating-mini-palette.ts", import.meta.url), "utf8");
  assert.match(types, /hiddenStorageItemIds: string\[\]/);
  assert.match(defaults, /storageWorkspaceFilter: _legacyStorageWorkspaceFilter/);
  assert.match(defaults, /hiddenStorageItemIds: legacyMiniPalette\.hiddenStorageItemIds/);
  assert.doesNotMatch(mini, /storageWorkspaceFilter/);
  assert.doesNotMatch(mini, /text: "Workspace"/);
  assert.match(mini, /storageCandidates\(\)/);
  assert.match(mini, /text: "Remove from Mini"/);
  assert.match(mini, /type === "markdown" \? "MD"/);
  assert.match(store, /hideMiniStorageItems\(itemIds: string\[\]\)/);
  assert.match(store, /hiddenStorageItemIds = \[\.\.\.hidden\]/);
});
