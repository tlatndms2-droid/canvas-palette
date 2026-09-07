import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const runExtractor = (source) => JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "--eval", `import { extractHighlights } from './src/core/highlight-export.ts'; console.log(JSON.stringify(extractHighlights(${JSON.stringify(source)})));`], { encoding: "utf8" }));

test("highlight extractor groups structurally connected Markdown into one Card block", () => {
  assert.deepEqual(runExtractor("## ==6. UI 기능의 완료 기준==\n\n==화면에 보이는 기능은 다음만 통과했다고 완료 처리하지 않는다.==\n\n- ==코드 작성 완료==\n- <mark>테스트 통과</mark>\n- ==빌드 성공==\n\n==UI 기능은 반드시 실제 앱에서 확인해야 한다.=="), [{ title: "6. UI 기능의 완료 기준", content: "## 6. UI 기능의 완료 기준\n\n화면에 보이는 기능은 다음만 통과했다고 완료 처리하지 않는다.\n\n- 코드 작성 완료\n- 테스트 통과\n- 빌드 성공\n\nUI 기능은 반드시 실제 앱에서 확인해야 한다." }]);
  assert.deepEqual(runExtractor("==첫 번째==\n\n일반 본문입니다.\n\n==두 번째=="), [{ title: "첫 번째", content: "첫 번째" }, { title: "두 번째", content: "두 번째" }]);
  assert.deepEqual(runExtractor("==**굵게**== <mark></mark> ==열리지 않음"), [{ title: "**굵게**", content: "**굵게**" }]);
  assert.deepEqual(runExtractor("<mark>바깥 <mark>안쪽</mark></mark>"), []);
});

test("Highlight Export is available from one Canvas text card with the Korean menu and destination cards", () => {
  const main = readFileSync("src/main.ts", "utf8");
  const side = readFileSync("src/side-palette/side-palette-view.ts", "utf8");
  const modal = readFileSync("src/ui/highlight-export-modal.ts", "utf8");
  assert.match(main, /workspaceEvents\.on\("canvas:node-menu", \(menu, node\) => this\.addCanvasHighlightMenu\(menu as Menu, node as CanvasRuntimeNodeLike\)\)/);
  assert.match(main, /exportCanvasHighlights\(node: CanvasRuntimeNodeLike\)/);
  assert.match(main, /extractHighlights\(source\.text \?\? ""\)/);
  assert.match(main, /private highlightItems[\s\S]*?caption: ""/);
  assert.match(main, /addCanvasHighlightMenu\(menu: Menu, node: CanvasRuntimeNodeLike\)[\s\S]{0,150}node\.getData\?\.\(\)\.type !== "text"/);
  assert.match(main, /setTitle\(this\.highlightMenuTitle\(\)\)[\s\S]{0,180}exportCanvasHighlights\(node\)/);
  assert.match(main, /강조한 문장을 Card로 묶습니다/);
  assert.doesNotMatch(main, /setTitle\("Export Highlight"\)/);
  assert.doesNotMatch(side, /setTitle\("Export Highlight"\)/);
  assert.match(main, /new HighlightExportModal/);
  assert.match(main, /new HighlightCanvasLayoutModal/);
  assert.match(main, /createItemBundle\(items, context\)/);
  assert.match(main, /createTreeBundle\(entries, context\)/);
  assert.match(main, /new TextScrapWorkspaceModal/);
  assert.match(main, /store\.addToWorkspaceAsUnlinked\(workspaceId, item\)/);
  assert.match(main, /store\.collectCanvasItems\(items\)/);
  assert.match(main, /miniPalette\.tab = "collect"/);
  assert.match(modal, /하이라이트 내보내기/);
  assert.match(modal, /내보낼 위치를 하나 선택하세요/);
  assert.match(modal, /현재 Canvas에 배치/);
  assert.match(modal, /Workspace에 저장/);
  assert.match(modal, /Mini에서 검토/);
  assert.match(modal, /연결 없는 묶음/);
  assert.match(modal, /MindMap 연결/);
  assert.match(readFileSync("styles.css", "utf8"), /height:150px!important/);
  assert.match(modal, /cp-highlight-export-modal-shell/);
  assert.match(readFileSync("styles.css", "utf8"), /max-width:540px/);
  assert.match(readFileSync("styles.css", "utf8"), /@media\(max-width:600px\)/);
});
