import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Group previews use Canvas layout instead of the simplified subgraph", async () => {
  const source = await readFile(new URL("../src/preview/preview-service.ts", import.meta.url), "utf8");
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");

  assert.match(source, /renderCanvasGroup/);
  assert.match(source, /cp-canvas-snapshot__group/);
  assert.match(source, /cp-canvas-snapshot__node/);
  assert.match(source, /cp-canvas-snapshot__edges/);
  assert.match(css, /aspect-ratio:var\(--cp-canvas-aspect\)/);
  assert.match(css, /cp-canvas-snapshot__node--image/);
  assert.doesNotMatch(source, /createDiv\(\{ cls: "cp-subgraph"/);
});
