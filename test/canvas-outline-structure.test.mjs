import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Canvas selection structure is saved independently from regular Outliner placement", async () => {
  const main = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
  const store = await readFile(new URL("../src/core/store.ts", import.meta.url), "utf8");
  const toolbar = await readFile(new URL("../src/canvas/canvas-node-toolbar-controller.ts", import.meta.url), "utf8");
  const modal = await readFile(new URL("../src/ui/modal.ts", import.meta.url), "utf8");
  assert.match(toolbar, /선택한 구조를 Side Palette로 내보내기/);
  assert.match(main, /new OutlineStructureRuleModal/);
  assert.match(main, /collectOutlineSelection/);
  assert.match(store, /saveOutlineStructure/);
  assert.match(store, /workspace\.outlineStructures/);
  assert.doesNotMatch(store.match(/saveOutlineStructure[\s\S]*?return "saved"/)?.[0] ?? "", /detachWorkspaceLinks/);
  assert.match(modal, /Outliner 구조를 읽는 기준/);
});
