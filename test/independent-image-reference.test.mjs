import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("independent structure images retain a reference-only source path and render from it", async () => {
  const store = await readFile(new URL("../src/core/store.ts", import.meta.url), "utf8");
  const preview = await readFile(new URL("../src/preview/preview-service.ts", import.meta.url), "utf8");
  const [render, main] = await Promise.all([readFile(new URL("../src/ui/render.ts", import.meta.url), "utf8"), readFile(new URL("../src/main.ts", import.meta.url), "utf8")]);
  assert.match(store, /const sourceReferencePath = item\.origin\.filePath \?\? item\.sourceReferencePath/);
  assert.match(store, /repairIndependentImageReferences/);
  assert.match(store, /matches\.length !== 1/);
  assert.match(preview, /item\.origin\.filePath \|\| item\.sourceReferencePath/);
  assert.match(render, /item\.origin\.filePath \|\| item\.sourceReferencePath/);
  assert.match(main, /onLayoutReady/);
  assert.match(main, /repairIndependentImageReferences/);
});
