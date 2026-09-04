import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("stored Canvas Groups can be safely replaced with independent Outliner contents", async () => {
  const store = await readFile(new URL("../src/core/store.ts", import.meta.url), "utf8");
  const canvas = await readFile(new URL("../src/canvas/canvas-adapter.ts", import.meta.url), "utf8");
  const side = await readFile(new URL("../src/side-palette/side-palette-view.ts", import.meta.url), "utf8");
  const modal = await readFile(new URL("../src/ui/modal.ts", import.meta.url), "utf8");
  assert.match(canvas, /async groupDecomposition\(item: PaletteItem\)/);
  assert.match(canvas, /snapshot\.nodes\.filter\(\(node\) => node\.type !== "group"\)/);
  assert.match(canvas, /material\.type = "card"/);
  assert.match(store, /decomposeGroupItem\(workspaceId: string, groupItemId: string, input: GroupDecompositionInput\)/);
  assert.match(store, /const createBranch/);
  assert.match(store, /if \(path\.has\(nodeId\)\) return/);
  assert.match(store, /copy\.origin = \{ workspaceId/);
  assert.match(store, /this\.removeItems\(\[groupItemId\]\)/);
  assert.match(side, /그룹 분해…/);
  assert.match(side, /this\.plugin\.canvas\.groupDecomposition/);
  assert.match(modal, /export class GroupDecompositionModal/);
  assert.match(modal, /분해 후 원래 그룹 아이템은 제거됩니다/);
});
