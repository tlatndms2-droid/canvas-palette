import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

async function loadCore(entry) {
  const directory = await mkdtemp(join(tmpdir(), "canvas-palette-source-test-"));
  const outfile = join(directory, `${entry}.mjs`);
  await build({ entryPoints: [join(process.cwd(), `src/core/${entry}.ts`)], outfile, bundle: true, format: "esm", platform: "node" });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { ...module, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

function markdownItem(id, path) {
  return {
    id, type: "markdown", displayTitle: id, tags: [], label: "", caption: "", createdAt: 1, modifiedAt: 1,
    origin: { workspaceId: "workspace", filePath: path }, canvasPlacements: [], content: `# ${id}`,
    backContent: "", facesEnabled: false, parentItemId: null, childItemIds: []
  };
}

test("Markdown source deletion preserves the last path and remains restorable", async () => {
  globalThis.window = globalThis;
  const { PaletteStore, cleanup } = await loadCore("store");
  const store = new PaletteStore({ saveData: async () => {} });
  store.data.items.note = markdownItem("note", "Old folder/Note.md");

  store.reconcileDeletedFile("Old folder/Note.md");
  assert.equal(store.data.items.note.origin.filePath, "Old folder/Note.md");
  assert.equal(typeof store.data.items.note.sourceDeletedAt, "number");

  const restored = store.restoreSource("note", "Old folder/Note.md");
  assert.equal(restored.origin.filePath, "Old folder/Note.md");
  assert.equal(restored.sourceDeletedAt, undefined);
  await cleanup();
});

test("Markdown and folder renames update every stored source path", async () => {
  globalThis.window = globalThis;
  const { PaletteStore, cleanup } = await loadCore("store");
  const store = new PaletteStore({ saveData: async () => {} });
  store.data.items.first = markdownItem("first", "Old/First.md");
  store.data.items.second = markdownItem("second", "Old/Nested/Second.md");
  store.data.items.first.sourceDeletedAt = 10;

  const changed = store.renameSourcePath("Old", "New", true);
  assert.equal(changed.length, 2);
  assert.equal(store.data.items.first.origin.filePath, "New/First.md");
  assert.equal(store.data.items.second.origin.filePath, "New/Nested/Second.md");
  assert.equal(store.data.items.first.sourceDeletedAt, undefined);
  await cleanup();
});

test("folder renames also update Canvas links, placements, workspace paths, and metadata", async () => {
  globalThis.window = globalThis;
  const { PaletteStore, cleanup } = await loadCore("store");
  const store = new PaletteStore({ saveData: async () => {} });
  const item = markdownItem("linked", "Old/Note.md");
  item.origin.canvasPath = "Old/Board.canvas";
  item.origin.canvasNodeId = "node";
  item.canvasPlacements = [{ canvasPath: "Old/Other.canvas", nodeIds: ["other"], placedAt: 1 }];
  store.data.items.linked = item;
  store.data.workspaces.workspace = { id: "workspace", name: "Workspace", canvasPaths: ["Old/Board.canvas", "Old/Other.canvas"], representativeCanvasPath: "Old/Board.canvas", rootCollectionIds: [], looseItemIds: ["linked"], sideLayout: store.data.uiState.sideLayout };
  store.data.canvasNodeMetadata["Old/Board.canvas"] = { node: { tags: [], label: "", caption: "", backContent: "", currentFace: "front", facesEnabled: false, modifiedAt: 1 } };

  store.renameCanvasPath("Old", "New", true);
  assert.equal(item.origin.canvasPath, "New/Board.canvas");
  assert.equal(item.canvasPlacements[0].canvasPath, "New/Other.canvas");
  assert.deepEqual(store.data.workspaces.workspace.canvasPaths, ["New/Board.canvas", "New/Other.canvas"]);
  assert.equal(store.data.workspaces.workspace.representativeCanvasPath, "New/Board.canvas");
  assert.ok(store.data.canvasNodeMetadata["New/Board.canvas"]);
  assert.equal(store.data.canvasNodeMetadata["Old/Board.canvas"], undefined);
  await cleanup();
});

test("restoring one source reconnects every Markdown item sharing its path", async () => {
  globalThis.window = globalThis;
  const { PaletteStore, cleanup } = await loadCore("store");
  const store = new PaletteStore({ saveData: async () => {} });
  store.data.items.first = markdownItem("first", "Deleted/Shared.md");
  store.data.items.second = markdownItem("second", "Deleted/Shared.md");
  store.data.items.first.sourceDeletedAt = 10;
  store.data.items.second.sourceDeletedAt = 11;
  store.restoreSource("first", "Deleted/Shared.md");
  assert.equal(store.data.items.first.sourceDeletedAt, undefined);
  assert.equal(store.data.items.second.sourceDeletedAt, undefined);
  await cleanup();
});

test("legacy Markdown without a source path becomes a normal Card", async () => {
  const { migrateData, cleanup } = await loadCore("defaults");
  const data = migrateData({ items: { orphan: markdownItem("orphan", undefined) } });
  assert.equal(data.items.orphan.type, "card");
  assert.equal(data.items.orphan.sourceDeletedAt, undefined);
  await cleanup();
});

test("cards expose only the three approved source states with icon-sized controls", async () => {
  const main = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
  const render = await readFile(new URL("../src/ui/render.ts", import.meta.url), "utf8");
  const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(render, /"linked" \| "deleted" \| "canvas-unlinked"/);
  assert.doesNotMatch(render, /path-missing/);
  assert.match(render, /linked: "link"/);
  assert.match(render, /deleted: "file-x-2"/);
  assert.match(render, /"canvas-unlinked": "unlink"/);
  assert.match(styles, /\.cp-source-state\{[^}]*width:22px;height:22px/);
  assert.match(styles, /\.cp-source-state svg\{width:13px;height:13px\}/);
  assert.match(main, /for \(const related of relatedItems\) await this\.canvas\.convertLinkedCardsToMarkdown/);
  assert.match(main, /previousPaths\.length !== 1/);
});
