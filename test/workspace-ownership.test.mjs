import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

globalThis.window = globalThis;

async function loadStore() {
  const directory = await mkdtemp(join(tmpdir(), "canvas-palette-workspace-"));
  const outfile = join(directory, "store.mjs");
  await build({ entryPoints: [join(process.cwd(), "src/core/store.ts")], outfile, bundle: true, format: "esm", platform: "node" });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { PaletteStore: module.PaletteStore, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

function item(id, canvasPath) {
  return { id, type: "card", displayTitle: id, tags: [], label: "", caption: "", createdAt: 1, modifiedAt: 1, origin: { canvasPath }, canvasPlacements: [], content: id, backContent: "", facesEnabled: false };
}

test("one Canvas supports unlimited dedicated Workspaces with exactly one representative", async () => {
  const { PaletteStore, cleanup } = await loadStore();
  const store = new PaletteStore({ loadData: async () => null, saveData: async () => {}, syncPaletteItemToCanvas: async () => {} });
  const first = store.ensureCanvasWorkspace("EP01.canvas", "EP01");
  const second = store.createWorkspace("EP01 Characters", "canvas", "EP01.canvas");
  const third = store.createWorkspace("EP01 References", "canvas", "EP01.canvas");
  assert.equal(store.canvasWorkspaces("EP01.canvas").length, 3);
  assert.equal(store.representativeWorkspaceForCanvas("EP01.canvas")?.id, first.id);
  assert.equal(store.setRepresentativeWorkspace(third.id, "EP01.canvas"), true);
  assert.equal(store.representativeWorkspaceForCanvas("EP01.canvas")?.id, third.id);
  assert.equal(store.canvasWorkspaces("EP01.canvas").filter((workspace) => workspace.representativeCanvasPath === "EP01.canvas").length, 1);
  assert.equal(store.setRepresentativeWorkspace(second.id, "EP02.canvas"), false);
  await cleanup();
});

test("dedicated Workspaces accept only own-Canvas items while general Workspaces accept all", async () => {
  const { PaletteStore, cleanup } = await loadStore();
  const store = new PaletteStore({ loadData: async () => null, saveData: async () => {}, syncPaletteItemToCanvas: async () => {} });
  const dedicated = store.createWorkspace("EP01", "canvas", "EP01.canvas", true);
  const general = store.createWorkspace("Shared", "general");
  assert.equal(store.addToWorkspace(dedicated.id, item("own", "EP01.canvas")), true);
  assert.equal(store.addToWorkspace(dedicated.id, item("foreign", "EP02.canvas")), false);
  assert.equal(store.addToWorkspaceAsUnlinked(dedicated.id, item("confirmed-foreign", "EP02.canvas")), true);
  assert.equal(store.data.items["confirmed-foreign"].origin.workspaceId, dedicated.id);
  assert.equal(dedicated.looseItemIds.includes("confirmed-foreign"), true);
  assert.equal(store.addToWorkspace(general.id, item("shared", "EP02.canvas")), true);
  const placed = item("placed", "EP02.canvas"); placed.canvasPlacements.push({ canvasPath: "EP01.canvas", nodeIds: ["node"], placedAt: 1 });
  assert.equal(store.canStoreItem(dedicated.id, placed), true);
  await cleanup();
});

test("reviewed pending import moves ownership and reports target-Canvas link state", async () => {
  const { PaletteStore, cleanup } = await loadStore();
  const store = new PaletteStore({ loadData: async () => null, saveData: async () => {}, syncPaletteItemToCanvas: async () => {} });
  const previous = store.createWorkspace("Previous", "general");
  const dedicated = store.createWorkspace("EP01", "canvas", "folder/EP01.canvas", true);
  store.addToWorkspace(previous.id, item("foreign", "EP02.canvas"));
  store.addPending(store.data.items.foreign);
  const result = store.importPending(dedicated.id, ["foreign"]);
  assert.deepEqual(result, { imported: ["foreign"], rejected: [] });
  assert.deepEqual(store.data.pendingItemIds, []);
  assert.equal(store.data.items.foreign.origin.workspaceId, dedicated.id);
  assert.equal(store.data.items.foreign.origin.canvasPath, "EP02.canvas");
  assert.equal(previous.looseItemIds.includes("foreign"), false);
  assert.equal(dedicated.looseItemIds.includes("foreign"), true);
  assert.equal(dedicated.canvasPaths.includes("EP02.canvas"), false);
  assert.equal(store.itemLinkedToWorkspace(store.data.items.foreign, dedicated.id), false);
  store.data.items.foreign.canvasPlacements.push({ canvasPath: "folder/EP01.canvas", nodeIds: ["node"], placedAt: 1 });
  assert.equal(store.itemLinkedToWorkspace(store.data.items.foreign, dedicated.id), true);
  store.renameCanvasPath("folder/EP01.canvas", "story/EP01.canvas");
  assert.equal(dedicated.ownerCanvasPath, "story/EP01.canvas");
  assert.equal(dedicated.representativeCanvasPath, "story/EP01.canvas");
  await cleanup();
});

test("Side and Mini Palette expose Workspace ownership controls and restrictions", async () => {
  const main = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
  const side = await readFile(new URL("../src/side-palette/side-palette-view.ts", import.meta.url), "utf8");
  const mini = await readFile(new URL("../src/mini-palette/floating-mini-palette.ts", import.meta.url), "utf8");
  assert.match(main, /ensureCurrentCanvasWorkspace/);
  assert.match(main, /Create Workspace for current Canvas/);
  assert.match(main, /Set as representative/);
  assert.match(main, /representativePath === currentPath \? "★ " : "☆ "/);
  assert.match(main, /ConfirmForeignCanvasWorkspaceModal/);
  assert.match(main, /isOtherCanvasRepresentativeWorkspace/);
  assert.match(main, /addToWorkspaceAsUnlinked/);
  assert.match(mini, /confirmWorkspaceSave\(select\.value/);
  assert.match(main, /const changedCanvas = context\.file\.path !== this\.lastCanvasPath/);
  assert.match(main, /if \(changedCanvas\) this\.selectRepresentativeWorkspace\(context\.file\.path\)/);
  assert.match(main, /activeContext\(\)\?\.file\.path \?\? this\.lastCanvasPath/);
  assert.match(main, /this\.lastCanvasPath = this\.store\.data\.uiState\.lastCanvasPath/);
  assert.match(main, /this\.store\.data\.uiState\.lastCanvasPath = context\.file\.path/);
  assert.doesNotMatch(main, /else this\.miniPalette\.destroy\(\);\s*this\.selectRepresentativeWorkspace\(\)/);
  assert.match(side, /Open current Canvas Workspace/);
  assert.match(side, /Open Workspace Explorer/);
  assert.match(side, /openWorkspaceExplorer/);
  assert.doesNotMatch(mini, /option\.disabled = Boolean\(workspace/);
  assert.doesNotMatch(mini, /only accepts items that exist in its own Canvas/);
});

test("Workspace Explorer prioritizes the current Canvas and offers search, dates, and Explorer views", async () => {
  const explorer = await readFile(new URL("../src/ui/workspace-explorer-modal.ts", import.meta.url), "utf8");
  const render = await readFile(new URL("../src/ui/render.ts", import.meta.url), "utf8");
  const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(explorer, /Search Canvas or Workspace/);
  assert.match(explorer, /Current Canvas ·/);
  assert.match(explorer, /workspace\.ownerCanvasPath === currentCanvas/);
  assert.match(explorer, /type: "date"/);
  assert.match(explorer, /"icons"[\s\S]*"list"[\s\S]*"details"/);
  assert.match(explorer, /Created: newest/);
  assert.match(render, /Number\(bCurrent\) - Number\(aCurrent\)/);
  assert.match(styles, /\.cp-workspace-explorer__body\.is-icons/);
  assert.match(styles, /\.cp-workspace-explorer__columns/);
});

test("deleting a Workspace preserves its Palette items in Mini Palette storage", async () => {
  const { PaletteStore, cleanup } = await loadStore();
  const store = new PaletteStore({ loadData: async () => null, saveData: async () => {}, syncPaletteItemToCanvas: async () => {} });
  const target = store.createWorkspace("Delete me", "general");
  store.createWorkspace("Keep me", "general");
  store.addToWorkspace(target.id, item("preserved", "EP01.canvas"));
  assert.equal(store.removeWorkspace(target.id), true);
  assert.equal(store.data.items.preserved.displayTitle, "preserved");
  assert.equal(store.data.items.preserved.origin.workspaceId, undefined);
  assert.ok(store.data.pendingItemIds.includes("preserved"));
  await cleanup();
});

test("Side explicitly adds and removes a Mini relay link without changing Workspace ownership", async () => {
  const { PaletteStore, cleanup } = await loadStore();
  const store = new PaletteStore({ loadData: async () => null, saveData: async () => {}, syncPaletteItemToCanvas: async () => {} });
  const workspace = store.createWorkspace("Owned by Side", "general");
  store.addToWorkspace(workspace.id, item("linked", "EP01.canvas"));
  assert.equal(store.miniStorageHas("linked"), false);
  assert.deepEqual(store.addMiniStorageItems(["linked"]), ["linked"]);
  assert.deepEqual(store.addMiniStorageItems(["linked"]), []);
  assert.equal(store.miniStorageHas("linked"), true);
  store.removeMiniStorageItems(["linked"]);
  assert.equal(store.data.items.linked.displayTitle, "linked");
  assert.ok(workspace.looseItemIds.includes("linked"));
  assert.equal(store.data.items.linked.origin.workspaceId, workspace.id);
  assert.deepEqual(store.data.uiState.miniPalette.storageItemIds, []);
  await cleanup();
});
