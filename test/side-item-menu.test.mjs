import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Side item menu uses focused metadata, move, and original actions", async () => {
  const source = await readFile(new URL("../src/side-palette/side-palette-view.ts", import.meta.url), "utf8");
  const main = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");

  assert.match(source, /setTitle\("Edit tags & label"\)/);
  assert.match(source, /setTitle\("Move to…"\)/);
  assert.doesNotMatch(source, /setTitle\(`Move to \$\{collection\.name\}`\)/);
  assert.doesNotMatch(source, /setTitle\("Locate on Canvas"\)/);
  assert.match(main, /await this\.canvas\.revealNode\(item\.origin\.canvasPath, item\.origin\.canvasNodeId\)/);
});
