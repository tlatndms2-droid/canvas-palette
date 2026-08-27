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
    settings: { theme: "obsidian", accentMode: "obsidian", accentColor: "#7c3aed", labelColorPresets: [], cardSize: 220, fontSize: 14, columns: 4 },
    items: {
      card: {
        id: "card", type: "card", displayTitle: "Card", tags: ["one"], label: "Shared", labelColor: "#7c3aed", caption: "Caption",
        createdAt: 1, modifiedAt: 1, origin: { canvasPath: "A.canvas", canvasNodeId: "origin", workspaceId: "workspace" }, canvasPlacements: [], content: "Body"
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
