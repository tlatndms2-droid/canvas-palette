import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

globalThis.window = globalThis;

async function loadStore() {
  const directory = await mkdtemp(join(tmpdir(), "canvas-palette-test-"));
  const outfile = join(directory, "store.mjs");
  await build({ entryPoints: [join(process.cwd(), "src/core/store.ts")], outfile, bundle: true, format: "esm", platform: "node" });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { PaletteStore: module.PaletteStore, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

function fixture() {
  return {
    schemaVersion: 6,
    settings: { theme: "obsidian", accentMode: "obsidian", accentColor: "#7c3aed", labelColorPresets: [], cardHeight: 220, fontSize: 14, columns: 4 },
    items: {
      card: {
        id: "card", type: "card", displayTitle: "Card", tags: ["one"], label: "Shared", labelColor: "#7c3aed", caption: "Caption",
        createdAt: 1, modifiedAt: 1, origin: { canvasPath: "A.canvas", canvasNodeId: "origin", workspaceId: "workspace" }, canvasPlacements: [], content: "Body", backContent: "", facesEnabled: false
      }
    },
    workspaces: {
      workspace: { id: "workspace", name: "Workspace", canvasPaths: ["A.canvas"], representativeCanvasPath: "A.canvas", rootCollectionIds: [], looseItemIds: ["card"], sideLayout: { viewportRatio: 0.52, topRatio: 0.69, indexRatio: 0.5, viewMode: "grid" } }
    },
    collections: {}, pendingItemIds: [],
    canvasNodeMetadata: { "A.canvas": { origin: { tags: ["one"], label: "Shared", labelColor: "#7c3aed", caption: "Caption", modifiedAt: 1 } } },
    uiState: { activeWorkspaceId: "workspace", selectedItemId: null, sideSelectedItemIds: [], quickEditor: { x: null, y: null, width: null, height: null }, miniPalette: { tab: "storage", isOpen: false, position: { x: 0, y: 0 }, size: { width: 100, height: 100 }, leftPaneOpen: true, rightPaneOpen: true, leftPaneWidth: 100, rightPaneWidth: 100, viewMode: "grid", sort: "modified-desc", selectedItemIds: [] } }
  };
}

test("a dropped Card becomes a linked placement with shared metadata", async () => {
  const { PaletteStore, cleanup } = await loadStore();
  const synchronized = [];
  const plugin = { loadData: async () => null, saveData: async () => {}, syncPaletteItemToCanvas: async (item) => synchronized.push(item.id) };
  const store = new PaletteStore(plugin);
  store.data = fixture();

  store.recordCanvasPlacement("card", "B.canvas", ["drop"]);
  assert.deepEqual(store.linkedCanvasNodes(store.data.items.card), [
    { canvasPath: "A.canvas", nodeId: "origin" },
    { canvasPath: "B.canvas", nodeId: "drop" }
  ]);
  assert.deepEqual(store.getCanvasNodeMetadata("B.canvas", "drop")?.tags, ["one"]);
  assert.equal(store.getCanvasNodeMetadata("B.canvas", "drop")?.caption, "Caption");

  store.setCanvasNodeMetadata("B.canvas", "drop", { tags: ["two"], label: "Changed", labelColor: "#ef4444", caption: "Changed caption" });
  assert.deepEqual(store.data.items.card.tags, ["two"]);
  assert.equal(store.getCanvasNodeMetadata("A.canvas", "origin")?.label, "Changed");
  assert.equal(store.getCanvasNodeMetadata("B.canvas", "drop")?.caption, "Changed caption");
  assert.deepEqual(synchronized, ["card"]);

  await cleanup();
});

test("Palette edits propagate metadata to every linked Card node", async () => {
  const { PaletteStore, cleanup } = await loadStore();
  const synchronized = [];
  const plugin = { loadData: async () => null, saveData: async () => {}, syncPaletteItemToCanvas: async (item) => synchronized.push({ id: item.id, content: item.content }) };
  const store = new PaletteStore(plugin);
  store.data = fixture();
  store.recordCanvasPlacement("card", "B.canvas", ["drop-1", "drop-2"]);

  store.updateItem("card", { displayTitle: "Updated", tags: ["shared"], label: "Everywhere", labelColor: "#22c55e", caption: "All nodes", content: "Updated body" });
  for (const nodeId of ["drop-1", "drop-2"]) assert.equal(store.getCanvasNodeMetadata("B.canvas", nodeId)?.label, "Everywhere");
  assert.equal(store.getCanvasNodeMetadata("A.canvas", "origin")?.caption, "All nodes");
  assert.deepEqual(synchronized, [{ id: "card", content: "Updated body" }]);

  await cleanup();
});

test("Back content synchronizes while each placement keeps its own current face", async () => {
  const { PaletteStore, cleanup } = await loadStore();
  const plugin = { loadData: async () => null, saveData: async () => {}, syncPaletteItemToCanvas: async () => {} };
  const store = new PaletteStore(plugin);
  store.data = fixture();
  store.recordCanvasPlacement("card", "B.canvas", ["drop"]);
  assert.equal(store.getCanvasNodeMetadata("A.canvas", "origin")?.facesEnabled, false);
  store.enableCanvasNodeFaces("A.canvas", "origin");
  store.setCanvasNodeFace("A.canvas", "origin", "back");
  store.setCanvasNodeBack("B.canvas", "drop", "## Shared back");

  assert.equal(store.data.items.card.backContent, "## Shared back");
  assert.equal(store.getCanvasNodeMetadata("A.canvas", "origin")?.backContent, "## Shared back");
  assert.equal(store.getCanvasNodeMetadata("B.canvas", "drop")?.backContent, "## Shared back");
  assert.equal(store.getCanvasNodeMetadata("A.canvas", "origin")?.currentFace, "back");
  assert.equal(store.getCanvasNodeMetadata("A.canvas", "origin")?.facesEnabled, true);
  assert.equal(store.getCanvasNodeMetadata("B.canvas", "drop")?.currentFace, "front");
  assert.equal(store.getCanvasNodeMetadata("B.canvas", "drop")?.facesEnabled, true);
  assert.equal(store.data.items.card.facesEnabled, true);
  await cleanup();
});

test("Unlink from Palette preserves the node snapshot and stops later synchronization", async () => {
  const { PaletteStore, cleanup } = await loadStore();
  const plugin = { loadData: async () => null, saveData: async () => {}, syncPaletteItemToCanvas: async () => {} };
  const store = new PaletteStore(plugin);
  store.data = fixture();
  store.data.items.card.backContent = "Before unlink";
  store.recordCanvasPlacement("card", "B.canvas", ["drop"]);
  store.enableCanvasNodeFaces("B.canvas", "drop");
  store.setCanvasNodeFace("B.canvas", "drop", "back");

  assert.equal(store.unlinkCanvasNode("B.canvas", "drop"), true);
  store.setItemBack("card", "After unlink");
  const detached = store.getCanvasNodeMetadata("B.canvas", "drop");
  assert.equal(detached?.backContent, "Before unlink");
  assert.equal(detached?.currentFace, "back");
  assert.equal(detached?.facesEnabled, true);
  assert.equal(store.linkedItemForNode("B.canvas", "drop"), undefined);
  await cleanup();
});

test("deleted Canvas nodes are removed from links and another placement becomes the origin", async () => {
  const { PaletteStore, cleanup } = await loadStore();
  const plugin = { loadData: async () => null, saveData: async () => {}, syncPaletteItemToCanvas: async () => {} };
  const store = new PaletteStore(plugin);
  store.data = fixture();
  store.recordCanvasPlacement("card", "B.canvas", ["replacement", "missing"]);

  assert.equal(store.reconcileCanvasLinks("A.canvas", new Set()), true);
  assert.equal(store.data.items.card.origin.canvasPath, "B.canvas");
  assert.equal(store.data.items.card.origin.canvasNodeId, "replacement");
  assert.deepEqual(store.data.items.card.canvasPlacements, [{ canvasPath: "B.canvas", nodeIds: ["missing"], placedAt: store.data.items.card.canvasPlacements[0].placedAt }]);

  assert.equal(store.reconcileCanvasLinks("B.canvas", new Set(["replacement"])), true);
  assert.deepEqual(store.linkedCanvasNodes(store.data.items.card), [{ canvasPath: "B.canvas", nodeId: "replacement" }]);
  await cleanup();
});

test("unlinking a Canvas keeps the Palette item and other linked spaces", async () => {
  const { PaletteStore, cleanup } = await loadStore();
  const plugin = { loadData: async () => null, saveData: async () => {}, syncPaletteItemToCanvas: async () => {} };
  const store = new PaletteStore(plugin);
  store.data = fixture();
  store.recordCanvasPlacement("card", "B.canvas", ["drop"]);

  store.unlinkItemsFromCanvas(["card"], "A.canvas");
  assert.ok(store.data.items.card);
  assert.equal(store.data.items.card.content, "Body");
  assert.deepEqual(store.linkedCanvasNodes(store.data.items.card), [{ canvasPath: "B.canvas", nodeId: "drop" }]);
  await cleanup();
});

test("drag reordering inserts an item before or after the highlighted gap", async () => {
  const { PaletteStore, cleanup } = await loadStore();
  const plugin = { loadData: async () => null, saveData: async () => {}, syncPaletteItemToCanvas: async () => {} };
  const store = new PaletteStore(plugin);
  store.data = fixture();
  store.data.items.second = { ...store.data.items.card, id: "second", displayTitle: "Second", origin: {}, canvasPlacements: [] };
  store.data.items.third = { ...store.data.items.card, id: "third", displayTitle: "Third", origin: {}, canvasPlacements: [] };
  store.data.workspaces.workspace.looseItemIds = ["card", "second", "third"];

  store.reorderItems("workspace", "third", "card", false);
  assert.deepEqual(store.data.workspaces.workspace.looseItemIds, ["third", "card", "second"]);
  store.reorderItems("workspace", "third", "second", true);
  assert.deepEqual(store.data.workspaces.workspace.looseItemIds, ["card", "second", "third"]);
  await cleanup();
});
