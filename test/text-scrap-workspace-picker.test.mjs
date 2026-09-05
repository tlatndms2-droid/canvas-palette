import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("selected Canvas text uses one Workspace-picker menu item", async () => {
  const main = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
  assert.match(main, /Save text directly to Side Palette…/);
  assert.match(main, /new TextScrapWorkspaceModal\(this\.app, workspaces, currentWorkspaceId/);
  assert.doesNotMatch(main, /Save text directly to Side Palette — \$\{currentWorkspace\.name\}/);
});

test("text Workspace picker defaults the active Canvas or general Workspace and requires a choice for Archive", async () => {
  const modal = await readFile(new URL("../src/ui/modal.ts", import.meta.url), "utf8");
  assert.match(modal, /export class TextScrapWorkspaceModal extends Modal/);
  assert.match(modal, /workspace\.id === this\.currentWorkspaceId && workspace\.kind !== "archive"/);
  assert.match(modal, /Workspace를 선택하세요/);
  assert.match(modal, /현재 사용 중/);
  assert.match(modal, /save\.disabled = !select\.value/);
  assert.match(modal, /text: "취소"/);
  assert.match(modal, /text: "저장", cls: "mod-cta"/);
});
