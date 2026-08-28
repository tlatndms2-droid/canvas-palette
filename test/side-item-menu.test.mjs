import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Side item menu uses focused metadata, move, and Find link actions", async () => {
  const source = await readFile(new URL("../src/side-palette/side-palette-view.ts", import.meta.url), "utf8");
  const main = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");

  assert.match(source, /setTitle\("Edit tags & label"\)/);
  assert.match(source, /setTitle\("Move to…"\)/);
  assert.doesNotMatch(source, /setTitle\(`Move to \$\{collection\.name\}`\)/);
  assert.doesNotMatch(source, /setTitle\("Locate on Canvas"\)/);
  assert.match(source, /setTitle\("Find link"\)/);
  assert.doesNotMatch(source, /setTitle\("Open original"\)/);
  assert.match(source, /setTitle\("Open source file"\)/);
  assert.match(main, /new FindLinkModal\(this\.app, item\.displayTitle, locations/);
});
