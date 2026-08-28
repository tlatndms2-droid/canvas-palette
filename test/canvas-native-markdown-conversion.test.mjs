import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const canvas = await readFile(new URL("../src/canvas/canvas-adapter.ts", import.meta.url), "utf8");

test("native Canvas Convert to file promotes the same linked Palette Card to Markdown", () => {
  assert.match(canvas, /item\.type === "card"/);
  assert.match(canvas, /candidate\.type === "file" && candidate\.file\?\.toLocaleLowerCase\(\)\.endsWith\("\.md"\)/);
  assert.match(canvas, /item\.type = "markdown"/);
  assert.match(canvas, /item\.origin\.filePath = convertedNode\.file/);
  assert.match(canvas, /delete item\.origin\.textRange/);
  assert.match(canvas, /item\.content = await this\.app\.vault\.cachedRead\(source\)/);
});
