import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Collection navigation requires two clicks within the explicit short interval", async () => {
  const source = await readFile(new URL("../src/side-palette/side-palette-view.ts", import.meta.url), "utf8");
  assert.match(source, /now - this\.lastCollectionClick\.at <= 220/);
  assert.match(source, /if \(entersCollection\) \{[\s\S]*layout\.focusedCollectionId = collection\.id;[\s\S]*layout\.selectedCollectionId = collection\.id;/);
  assert.doesNotMatch(source, /row\.addEventListener\("dblclick", \(\) => \{ layout\.focusedCollectionId/);
});

test("Viewport ignores Collection membership until a Collection is entered", async () => {
  const source = await readFile(new URL("../src/side-palette/side-palette-view.ts", import.meta.url), "utf8");
  assert.match(source, /const focusedId = workspace\.sideLayout\.focusedCollectionId;/);
  assert.match(source, /if \(!focusedId\) return this\.items\(workspaceId\);/);
  assert.match(source, /const collection = workspace\.sideLayout\.focusedCollectionId \? this\.plugin\.store\.data\.collections\[workspace\.sideLayout\.focusedCollectionId\] : null;/);
  assert.doesNotMatch(source, /if \(!selectedId\) return workspace\.looseItemIds/);
});

test("Collection collapse remains authoritative while Viewport filters are active", async () => {
  const source = await readFile(new URL("../src/side-palette/side-palette-view.ts", import.meta.url), "utf8");
  assert.match(source, /if \(!collapsed\) \{[\s\S]*this\.renderOutlineItem/);
  assert.doesNotMatch(source, /if \(!collapsed \|\| Boolean\(this\.query\)\)/);
});

test("Collection deletion preserves items and promotes nested Collections", async () => {
  const source = await readFile(new URL("../src/side-palette/side-palette-view.ts", import.meta.url), "utf8");
  const store = await readFile(new URL("../src/core/store.ts", import.meta.url), "utf8");
  const modal = await readFile(new URL("../src/ui/modal.ts", import.meta.url), "utf8");
  const removeCollection = store.match(/removeCollection\(id: string\): void \{[\s\S]*?\r?\n  \}\r?\n\r?\n  moveCollection/)?.[0] ?? "";
  assert.match(source, /iconButton\(row, "trash-2", "Delete collection"/);
  assert.match(source, /new ConfirmDeleteCollectionModal/);
  assert.match(store, /removeCollection\(id: string\)/);
  assert.match(removeCollection, /siblingIds\.splice\(index, 1, \.\.\.promotedChildren\)/);
  assert.match(removeCollection, /itemTarget\.push\(\.\.\.collection\.itemIds\.filter/);
  assert.match(removeCollection, /delete this\.data\.collections\[id\]/);
  assert.doesNotMatch(removeCollection, /delete this\.data\.items/);
  assert.match(modal, /No Palette items, Vault files, or Canvas nodes will be deleted/);
});

test("Outliner files support metadata, context menus, child files, and grouping selected items", async () => {
  const source = await readFile(new URL("../src/side-palette/side-palette-view.ts", import.meta.url), "utf8");
  const store = await readFile(new URL("../src/core/store.ts", import.meta.url), "utf8");
  const defaults = await readFile(new URL("../src/core/defaults.ts", import.meta.url), "utf8");
  assert.match(source, /row\.addEventListener\("contextmenu", \(event\) => \{ if \(!this\.outlineTargetSelected\(target\)\) this\.selectOutlineTarget\(target\); this\.itemMenu\(event, item, true\); \}\)/);
  assert.match(source, /cp-outline-item__metadata/);
  assert.match(source, /setTitle\("Group selected items…"\)/);
  assert.match(source, /zone === "inside"[\s\S]*targetId/);
  assert.match(store, /parentItemId: string \| null = null/);
  assert.match(store, /this\.isItemDescendant\(parentItemId, id\)/);
  assert.match(defaults, /schemaVersion: 22/);
});

test("Outliner selection uses one visible-row sequence while Viewport selection remains item-only", async () => {
  const source = await readFile(new URL("../src/side-palette/side-palette-view.ts", import.meta.url), "utf8");
  assert.match(source, /private outlineSelection: OutlineSelectionTarget\[\] = \[\]/);
  assert.match(source, /this\.outlineRows\.push\(target\)/);
  assert.match(source, /this\.outlineRows\.slice\(Math\.min\(start, end\), Math\.max\(start, end\) \+ 1\)/);
  assert.match(source, /this\.outlineSelection = next\.map\(\(itemId\) => \(\{ kind: "item" as const, id: itemId \}\)\)/);
});

test("Viewport renders Collection and file-parent groups as vertical card stacks", async () => {
  const source = await readFile(new URL("../src/side-palette/side-palette-view.ts", import.meta.url), "utf8");
  const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(source, /cp-viewport-group__header/);
  assert.match(source, /cp-viewport-group__body/);
  assert.match(source, /focusedCollectionId = collectionId/);
  assert.match(styles, /\.cp-viewport-group__body\{display:flex;flex-direction:column/);
});

test("multi-item Canvas drag payload restores every selected item", async () => {
  const render = await readFile(new URL("../src/ui/render.ts", import.meta.url), "utf8");
  const drop = await readFile(new URL("../src/canvas/palette-drop-controller.ts", import.meta.url), "utf8");
  const canvas = await readFile(new URL("../src/canvas/canvas-adapter.ts", import.meta.url), "utf8");
  assert.match(render, /application\/x-canvas-palette-items/);
  assert.match(drop, /restoreItemsFromDrop\(items, event\)/);
  assert.match(canvas, /async restoreItemsFromDrop\(items: PaletteItem\[\], event: DragEvent\)/);
  assert.match(canvas, /index % columns/);
});

test("Side search preserves Korean IME composition and renders guided suggestions", async () => {
  const source = await readFile(new URL("../src/side-palette/side-palette-view.ts", import.meta.url), "utf8");
  const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(source, /addEventListener\("compositionstart"/);
  assert.match(source, /addEventListener\("compositionend"/);
  assert.match(source, /if \(this\.searchComposing \|\| \(event as InputEvent\)\.isComposing\) return/);
  assert.match(source, /normalize\("NFC"\)/);
  assert.match(source, /renderSearchAssistant/);
  assert.match(source, /refreshSearchSurface/);
  assert.match(source, /if \(this\.activeBackEditor \|\| this\.searchComposing\) return/);
  assert.match(source, /root\.onpointerdown/);
  assert.match(source, /this\.searchAssistantOpen = false/);
  assert.match(source, /precedingQuery/);
  assert.doesNotMatch(source, /const refreshSearch = \(\): void => \{ this\.render\(\)/);
  assert.match(source, /\["group:", "Search group names"\]/);
  assert.match(source, /cp-search-chips/);
  assert.match(source, /searchContextForItem/);
  assert.match(styles, /\.cp-search-assistant\{/);
});
