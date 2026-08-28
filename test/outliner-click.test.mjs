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
