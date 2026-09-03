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

test("Group snapshot migration preserves legacy Front Back metadata and new per-node metadata", async () => {
  const { PaletteStore, cleanup } = await loadStore();
  const raw = fixture();
  raw.items.group = {
    ...structuredClone(raw.items.card), id: "group", type: "group", displayTitle: "Group", origin: {}, canvasPlacements: [], facesEnabled: false,
    group: { bounds: { width: 300, height: 180 }, nodes: [{ id: "inside", type: "text", text: "Inside", x: 0, y: 0, width: 200, height: 100 }], edges: [], nodeBacks: { inside: "Legacy back" } }
  };
  raw.workspaces.workspace.looseItemIds.push("group");
  const store = new PaletteStore({ loadData: async () => raw, saveData: async () => {}, syncPaletteItemToCanvas: async () => {} });
  await store.load();
  assert.equal(store.data.schemaVersion, 25);
  assert.equal(store.data.items.group.group.nodeMetadata.inside.backContent, "Legacy back");
  assert.deepEqual(store.data.items.group.group.nodeMetadata.inside.tags, []);
  await cleanup();
});

test("restored Group metadata can be recorded in one store operation", async () => {
  const { PaletteStore, cleanup } = await loadStore();
  const store = new PaletteStore({ loadData: async () => null, saveData: async () => {}, syncPaletteItemToCanvas: async () => {} });
  store.data = fixture();
  store.restoreCanvasNodeMetadata("B.canvas", [{ nodeId: "group-child", metadata: { tags: ["group"], label: "Nested", labelColor: "#22c55e", caption: "Inside", backContent: "Back", currentFace: "back", facesEnabled: true, modifiedAt: 7 } }]);
  assert.deepEqual(store.getCanvasNodeMetadata("B.canvas", "group-child"), { tags: ["group"], label: "Nested", labelColor: "#22c55e", caption: "Inside", backContent: "Back", currentFace: "back", facesEnabled: true, modifiedAt: 7 });
  await cleanup();
});

test("collecting one linked Canvas node again reuses its canonical Palette item in Collect", async () => {
  const { PaletteStore, cleanup } = await loadStore();
  const store = new PaletteStore({ loadData: async () => null, saveData: async () => {}, syncPaletteItemToCanvas: async () => {} });
  store.data = fixture();
  store.data.uiState.miniPalette.storageItemIds = [];
  const duplicate = { ...structuredClone(store.data.items.card), id: "duplicate", createdAt: 2, modifiedAt: 2 };

  assert.equal(store.existingCollectedItem(duplicate)?.id, "card");
  assert.deepEqual(store.collectCanvasItems([duplicate]), ["card"]);
  assert.equal(store.data.items.duplicate, undefined);
  assert.deepEqual(store.data.pendingItemIds, ["card"]);
  assert.deepEqual(store.data.uiState.miniPalette.storageItemIds, []);

  store.removePendingItems(["card"]);
  assert.deepEqual(store.data.pendingItemIds, []);
  assert.equal(store.data.items.card.id, "card");
  assert.deepEqual(store.data.workspaces.workspace.looseItemIds, ["card"]);

  await cleanup();
});

test("loading repairs duplicate Canvas-linked IDs across Side, Collect, and Mini Storage", async () => {
  const { PaletteStore, cleanup } = await loadStore();
  const raw = fixture();
  raw.items.duplicate = { ...structuredClone(raw.items.card), id: "duplicate", displayTitle: "Newest", content: "Newest body", createdAt: 2, modifiedAt: 5 };
  raw.workspaces.workspace.looseItemIds.push("duplicate");
  raw.pendingItemIds.push("duplicate");
  raw.uiState.miniPalette.storageItemIds = ["card", "duplicate"];
  const saved = [];
  const store = new PaletteStore({ loadData: async () => raw, saveData: async (data) => saved.push(structuredClone(data)), syncPaletteItemToCanvas: async () => {} });

  await store.load();

  assert.deepEqual(Object.keys(store.data.items), ["card"]);
  assert.equal(store.data.items.card.displayTitle, "Newest");
  assert.equal(store.data.items.card.content, "Newest body");
  assert.deepEqual(store.data.workspaces.workspace.looseItemIds, ["card"]);
  assert.deepEqual(store.data.pendingItemIds, []);
  assert.deepEqual(store.data.uiState.miniPalette.storageItemIds, ["card"]);
  assert.equal(saved.length, 1);

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

test("replacing a linked Card on the same Canvas keeps one link and all shared metadata", async () => {
  const { PaletteStore, cleanup } = await loadStore();
  const plugin = { loadData: async () => null, saveData: async () => {}, syncPaletteItemToCanvas: async () => {} };
  const store = new PaletteStore(plugin);
  store.data = fixture();
  store.data.items.card.backContent = "Shared back";
  store.data.items.card.facesEnabled = true;

  store.replaceCanvasPlacement("card", "A.canvas", ["origin"], ["new-position"], new Set(["new-position"]));

  assert.deepEqual(store.linkedCanvasNodes(store.data.items.card), [{ canvasPath: "A.canvas", nodeId: "new-position" }]);
  assert.equal(store.data.items.card.origin.canvasNodeId, "new-position");
  assert.equal(store.getCanvasNodeMetadata("A.canvas", "origin"), undefined);
  assert.equal(store.getCanvasNodeMetadata("A.canvas", "new-position")?.caption, "Caption");
  assert.equal(store.getCanvasNodeMetadata("A.canvas", "new-position")?.backContent, "Shared back");
  assert.equal(store.getCanvasNodeMetadata("A.canvas", "new-position")?.facesEnabled, true);
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

test("removing Front Back disables the linked material without deleting its Back", async () => {
  const { PaletteStore, cleanup } = await loadStore();
  const plugin = { loadData: async () => null, saveData: async () => {}, syncPaletteItemToCanvas: async () => {} };
  const store = new PaletteStore(plugin);
  store.data = fixture();
  store.recordCanvasPlacement("card", "B.canvas", ["drop"]);
  store.enableCanvasNodeFaces("A.canvas", "origin");
  store.setCanvasNodeBack("A.canvas", "origin", "Back to remove");
  store.setCanvasNodeFace("B.canvas", "drop", "back");

  store.disableCanvasNodeFaces("B.canvas", "drop");

  assert.equal(store.data.items.card.facesEnabled, false);
  assert.equal(store.data.items.card.backContent, "Back to remove");
  for (const [canvasPath, nodeId] of [["A.canvas", "origin"], ["B.canvas", "drop"]]) {
    const state = store.getCanvasNodeMetadata(canvasPath, nodeId);
    assert.equal(state?.facesEnabled, false);
    assert.equal(state?.backContent, "Back to remove");
    assert.equal(state?.currentFace, "front");
  }
  store.enableCanvasNodeFaces("A.canvas", "origin");
  assert.equal(store.getCanvasNodeMetadata("A.canvas", "origin")?.backContent, "Back to remove");
  await cleanup();
});

test("Palette Front Back commands update every linked Canvas placement", async () => {
  const { PaletteStore, cleanup } = await loadStore();
  const plugin = { loadData: async () => null, saveData: async () => {}, syncPaletteItemToCanvas: async () => {} };
  const store = new PaletteStore(plugin);
  store.data = fixture();
  store.data.items.card.backContent = "Preserved palette back";
  store.recordCanvasPlacement("card", "B.canvas", ["drop"]);

  store.enableItemFaces("card");
  assert.equal(store.data.items.card.facesEnabled, true);
  assert.equal(store.getCanvasNodeMetadata("A.canvas", "origin")?.facesEnabled, true);
  assert.equal(store.getCanvasNodeMetadata("B.canvas", "drop")?.facesEnabled, true);

  store.setCanvasNodeFace("B.canvas", "drop", "back");
  store.setPaletteFace("side", "card", "back");
  store.setPaletteFace("mini", "card", "back");
  store.disableItemFaces("card");

  assert.equal(store.data.items.card.facesEnabled, false);
  assert.equal(store.data.items.card.backContent, "Preserved palette back");
  assert.equal(store.data.uiState.sideItemFaces.card, undefined);
  assert.equal(store.data.uiState.miniItemFaces.card, undefined);
  for (const [canvasPath, nodeId] of [["A.canvas", "origin"], ["B.canvas", "drop"]]) {
    const state = store.getCanvasNodeMetadata(canvasPath, nodeId);
    assert.equal(state?.facesEnabled, false);
    assert.equal(state?.currentFace, "front");
    assert.equal(state?.backContent, "Preserved palette back");
  }
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

test("Outliner moves multiple items and safely reparents collections", async () => {
  const { PaletteStore, cleanup } = await loadStore();
  const plugin = { loadData: async () => null, saveData: async () => {}, syncPaletteItemToCanvas: async () => {} };
  const store = new PaletteStore(plugin);
  store.data = fixture();
  store.data.items.second = { ...store.data.items.card, id: "second", displayTitle: "Second", origin: {}, canvasPlacements: [] };
  store.data.workspaces.workspace.looseItemIds = ["card", "second"];
  store.data.collections.parent = { id: "parent", workspaceId: "workspace", parentId: null, name: "Parent", childCollectionIds: [], itemIds: [] };
  store.data.collections.child = { id: "child", workspaceId: "workspace", parentId: null, name: "Child", childCollectionIds: [], itemIds: [] };
  store.data.workspaces.workspace.rootCollectionIds = ["parent", "child"];

  store.assignItemsToCollection("workspace", ["card", "second"], "parent");
  assert.deepEqual(store.data.collections.parent.itemIds, ["card", "second"]);
  assert.deepEqual(store.data.workspaces.workspace.looseItemIds, []);
  store.data.items.third = { ...store.data.items.card, id: "third", displayTitle: "Third", origin: {}, canvasPlacements: [] };
  store.data.workspaces.workspace.looseItemIds = ["third"];
  store.moveItems("workspace", ["card", "second"], null, "third", true);
  assert.deepEqual(store.data.workspaces.workspace.looseItemIds, ["third", "card", "second"]);
  assert.deepEqual(store.data.collections.parent.itemIds, []);
  store.moveCollection("child", "parent");
  assert.equal(store.data.collections.child.parentId, "parent");
  assert.deepEqual(store.data.collections.parent.childCollectionIds, ["child"]);
  store.moveCollection("parent", "child");
  assert.equal(store.data.collections.parent.parentId, null);
  assert.deepEqual(store.data.collections.child.childCollectionIds, []);
  await cleanup();
});

test("Card to Markdown conversion preserves one item identity and all Canvas links", async () => {
  const { PaletteStore, cleanup } = await loadStore();
  const plugin = { loadData: async () => null, saveData: async () => {}, syncPaletteItemToCanvas: async () => {} };
  const store = new PaletteStore(plugin);
  store.data = fixture();
  store.recordCanvasPlacement("card", "B.canvas", ["drop"]);
  const before = store.data.items.card;

  assert.equal(store.convertCardToMarkdown("card", "Notes/Card.md"), true);
  const converted = store.data.items.card;
  assert.equal(converted, before);
  assert.equal(converted.type, "markdown");
  assert.equal(converted.origin.filePath, "Notes/Card.md");
  assert.equal(converted.content, "Body");
  assert.deepEqual(converted.tags, ["one"]);
  assert.equal(converted.label, "Shared");
  assert.equal(converted.caption, "Caption");
  assert.deepEqual(store.linkedCanvasNodes(converted), [
    { canvasPath: "A.canvas", nodeId: "origin" },
    { canvasPath: "B.canvas", nodeId: "drop" }
  ]);
  await cleanup();
});

test("Palette reveal resolves the item's preferred containing Workspace", async () => {
  const { PaletteStore, cleanup } = await loadStore();
  const plugin = { loadData: async () => null, saveData: async () => {}, syncPaletteItemToCanvas: async () => {} };
  const store = new PaletteStore(plugin);
  store.data = fixture();
  store.data.workspaces.older = { ...store.data.workspaces.workspace, id: "older", name: "Older", looseItemIds: ["card"] };
  store.data.items.card.origin.workspaceId = "workspace";

  assert.equal(store.workspaceForItem("card")?.id, "workspace");
  store.data.workspaces.workspace.looseItemIds = [];
  assert.equal(store.workspaceForItem("card")?.id, "older");
  await cleanup();
});

test("numbered Canvas links retain every node and restart numbering in every Canvas", async () => {
  const { PaletteStore, cleanup } = await loadStore();
  const plugin = { loadData: async () => null, saveData: async () => {}, syncPaletteItemToCanvas: async () => {} };
  const store = new PaletteStore(plugin);
  store.data = fixture();
  store.recordCanvasPlacement("card", "A.canvas", ["second", "third"]);
  store.recordCanvasPlacement("card", "B.canvas", ["drop", "legacy-extra"]);

  assert.deepEqual(store.numberedCanvasLinks(store.data.items.card), [
    { canvasPath: "A.canvas", nodeId: "origin", number: 1, total: 3 },
    { canvasPath: "A.canvas", nodeId: "second", number: 2, total: 3 },
    { canvasPath: "A.canvas", nodeId: "third", number: 3, total: 3 },
    { canvasPath: "B.canvas", nodeId: "drop", number: 1, total: 2 },
    { canvasPath: "B.canvas", nodeId: "legacy-extra", number: 2, total: 2 }
  ]);
  assert.deepEqual(store.numberedCanvasLinkForNode("A.canvas", "second")?.link, { canvasPath: "A.canvas", nodeId: "second", number: 2, total: 3 });

  store.unlinkCanvasNode("A.canvas", "second");
  assert.deepEqual(store.numberedCanvasLinks(store.data.items.card).filter((link) => link.canvasPath === "A.canvas"), [
    { canvasPath: "A.canvas", nodeId: "origin", number: 1, total: 2 },
    { canvasPath: "A.canvas", nodeId: "third", number: 2, total: 2 }
  ]);
  await cleanup();
});

test("replacing a linked node keeps its numbered slot", async () => {
  const { PaletteStore, cleanup } = await loadStore();
  const store = new PaletteStore({ loadData: async () => null, saveData: async () => {}, syncPaletteItemToCanvas: async () => {} });
  store.data = fixture();
  store.recordCanvasPlacement("card", "A.canvas", ["second", "third"]);

  store.replaceCanvasPlacement("card", "A.canvas", ["second"], ["replacement"], new Set(["origin", "replacement", "third"]));
  assert.deepEqual(store.numberedCanvasLinks(store.data.items.card).filter((link) => link.canvasPath === "A.canvas"), [
    { canvasPath: "A.canvas", nodeId: "origin", number: 1, total: 3 },
    { canvasPath: "A.canvas", nodeId: "replacement", number: 2, total: 3 },
    { canvasPath: "A.canvas", nodeId: "third", number: 3, total: 3 }
  ]);
  await cleanup();
});
