import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const main = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
const store = await readFile(new URL("../src/core/store.ts", import.meta.url), "utf8");
const side = await readFile(new URL("../src/side-palette/side-palette-view.ts", import.meta.url), "utf8");
const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");

test("Canvas link reveal resolves the linked item and its actual Workspace", () => {
  assert.match(main, /linkedItemForNode\(canvasPath, nodeId\)/);
  assert.match(main, /workspaceForItem\(item\.id\)/);
  assert.match(main, /activeWorkspaceId = workspace\.id/);
  assert.match(main, /view\.revealItem\(item\.id\)/);
  assert.match(store, /workspaceForItem\(itemId: string\)/);
  assert.match(store, /workspace\.looseItemIds\.includes\(itemId\)/);
  assert.match(store, /collection\.workspaceId === workspace\.id && collection\.itemIds\.includes\(itemId\)/);
});

test("Side Palette reveal clears filters, selects, scrolls, and highlights one card", () => {
  assert.match(side, /revealItem\(itemId: string\)/);
  assert.match(side, /this\.query = ""/);
  assert.match(side, /sideSelectedItemIds = \[itemId\]/);
  assert.match(side, /scrollIntoView\(\{ block: "center", inline: "nearest" \}\)/);
  assert.match(side, /addClass\("is-link-revealed"\)/);
  assert.match(styles, /\.cp-item\.is-link-revealed\{animation:cp-link-reveal 1\.6s ease-out\}/);
});
