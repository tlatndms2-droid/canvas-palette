import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Collection navigation requires two clicks within the explicit short interval", async () => {
  const source = await readFile(new URL("../src/side-palette/side-palette-view.ts", import.meta.url), "utf8");
  assert.match(source, /now - this\.lastCollectionClick\.at <= 220/);
  assert.match(source, /if \(entersCollection\) \{[\s\S]*layout\.focusedCollectionId = collection\.id;[\s\S]*layout\.selectedCollectionId = collection\.id;/);
  assert.doesNotMatch(source, /row\.addEventListener\("dblclick", \(\) => \{ layout\.focusedCollectionId/);
});

