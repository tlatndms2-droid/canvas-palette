import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "esbuild";

globalThis.window = globalThis;

test("edited Palette titles survive Canvas refresh, content changes, persistence, and Markdown conversion", async () => {
  const directory = await mkdtemp(join(tmpdir(), "palette-title-sync-"));
  try {
    const outfile = join(directory, "fixture.mjs");
    await build({ stdin: { contents: 'export { PaletteStore } from "./src/core/store"; export { CanvasAdapter } from "./src/canvas/canvas-adapter"; export { TFile } from "obsidian";', resolveDir: process.cwd() }, outfile, bundle: true, format: "esm", platform: "node", plugins: [{ name: "obsidian-stub", setup(build) {
      build.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "stub" }));
      build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export class TFile {} export class App {} export class Notice {} export const requestUrl = () => {};" }));
    } }] });
    const { PaletteStore, CanvasAdapter, TFile } = await import(pathToFileURL(outfile).href);
    let saved;
    const store = new PaletteStore({ saveData: async data => { saved = structuredClone(data); }, syncPaletteItemToCanvas: async () => {} });
    const original = { id: "renamed", type: "card", displayTitle: "Original", content: "Original\nBody", tags: [], label: "", caption: "", backContent: "", facesEnabled: false, createdAt: 1, modifiedAt: 1, origin: { canvasPath: "Title.canvas", canvasNodeId: "node" }, canvasPlacements: [] };
    store.data.items.renamed = structuredClone(original);
    const source = Object.assign(new TFile(), { basename: "Converted", path: "Converted.md" });
    const adapter = new CanvasAdapter({ vault: { getAbstractFileByPath: () => source, cachedRead: async () => "Converted body" } }, () => {}, () => undefined, () => {});
    let node = { id: "node", type: "text", text: original.content };
    adapter.read = async () => ({ nodes: [node], edges: [] });
    const file = { path: "Title.canvas" };
    store.updateItem("renamed", { displayTitle: "내가 정한 제목", tags: [], label: "", caption: "" });
    assert.equal(store.data.items.renamed.customDisplayTitle, true);
    assert.equal((await adapter.syncItemsFromCanvas(file, store.allItems())).changedItems, 0);
    assert.equal(store.data.items.renamed.displayTitle, "내가 정한 제목");
    node.text = "Changed first line\nChanged body";
    await adapter.syncItemsFromCanvas(file, store.allItems());
    assert.equal(store.data.items.renamed.content, node.text);
    assert.equal(store.data.items.renamed.displayTitle, "내가 정한 제목");
    await store.flush();
    const reloaded = new PaletteStore({ loadData: async () => saved, saveData: async () => {}, syncPaletteItemToCanvas: async () => {} });
    await reloaded.load();
    await adapter.syncItemsFromCanvas(file, reloaded.allItems());
    assert.equal(reloaded.data.items.renamed.displayTitle, "내가 정한 제목");
    assert.equal(reloaded.data.items.renamed.customDisplayTitle, true);
    node = { id: "node", type: "file", file: source.path };
    await adapter.syncItemsFromCanvas(file, reloaded.allItems());
    assert.equal(reloaded.data.items.renamed.type, "markdown");
    assert.equal(reloaded.data.items.renamed.displayTitle, "내가 정한 제목");
    assert.equal(reloaded.data.items.renamed.content, "Converted body");
    node = { id: "node", type: "text", text: "Automatic new title\nBody" };
    const automatic = structuredClone(original);
    await adapter.syncItemsFromCanvas(file, [automatic]);
    assert.equal(automatic.displayTitle, "Automatic new title");
    assert.equal(automatic.content, node.text);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
