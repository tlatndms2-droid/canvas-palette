import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadDensityModule() {
  const source = await readFile(new URL("../src/ui/asset-density.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

test("Side and Mini palettes share the Explorer density model", async () => {
  const density = await readFile(new URL("../src/ui/asset-density.ts", import.meta.url), "utf8");
  const side = await readFile(new URL("../src/side-palette/side-palette-view.ts", import.meta.url), "utf8");
  const mini = await readFile(new URL("../src/mini-palette/floating-mini-palette.ts", import.meta.url), "utf8");
  const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(density, /ASSET_DENSITY_MAX = 6/);
  assert.match(density, /PREVIEW_FONT_SIZE_MIN = 11/);
  assert.match(density, /PREVIEW_FONT_SIZE_MAX = 14/);
  assert.match(density, /clampAssetDensity\(value\) === 0 \? "list" : "grid"/);
  assert.match(side, /applyAssetDensity\(listEl[\s\S]*settings\.fontSize/);
  assert.match(mini, /applyAssetDensity\(grid[\s\S]*settings\.fontSize/);
  assert.match(styles, /repeat\(auto-fill,minmax\(min\(var\(--cp-density-card-width/);
  assert.match(styles, /@container \(max-width:179px\)/);
  assert.match(styles, /--cp-density-title-size/);
  assert.match(styles, /--cp-density-preview-size/);
  assert.match(styles, /Text previews in List\/Details must use the readable full-width row/);
  assert.match(styles, /\.cp-grid--list :is\(\.cp-item--card,\.cp-item--markdown,\.cp-item--link\) \.cp-item__body/);
});

test("Density profiles keep titles readable and previews at or above 11px", async () => {
  const { applyAssetDensity, clampAssetDensity, clampPreviewFontSize } = await loadDensityModule();
  assert.equal(clampAssetDensity(-1), 0);
  assert.equal(clampAssetDensity(99), 6);
  assert.equal(clampPreviewFontSize(8), 11);
  assert.equal(clampPreviewFontSize(15), 14);
  assert.equal(clampPreviewFontSize(undefined), 14);

  const element = { classList: { remove() {}, add() {} }, dataset: {}, style: { values: new Map(), setProperty(key, value) { this.values.set(key, value); } } };
  for (let density = 0; density <= 6; density += 1) applyAssetDensity(element, density, "cp-grid", 14);
  assert.equal(element.style.values.get("--cp-density-title-size"), "16px");
  assert.equal(element.style.values.get("--cp-density-preview-size"), "14px");
  applyAssetDensity(element, 2, "cp-grid", 11);
  assert.equal(element.style.values.get("--cp-density-title-size"), "13px");
  assert.equal(element.style.values.get("--cp-density-preview-size"), "11px");
  assert.equal(element.style.values.get("--cp-density-preview-lines"), "2");
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
