import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const runExtractor = (source) => JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "--eval", `import { extractHighlights } from './src/core/highlight-export.ts'; console.log(JSON.stringify(extractHighlights(${JSON.stringify(source)})));`], { encoding: "utf8" }));

test("highlight extractor keeps both supported syntaxes in source order", () => {
  assert.deepEqual(runExtractor("==첫 번째==\n<mark>둘째\n줄</mark>\n==첫 번째=="), ["첫 번째", "둘째\n줄", "첫 번째"]);
  assert.deepEqual(runExtractor("==**굵게**== <mark></mark> ==열리지 않음"), ["**굵게**"]);
  assert.deepEqual(runExtractor("<mark>바깥 <mark>안쪽</mark></mark>"), []);
});

test("Export Highlight uses a compact two-step chooser and existing destination paths", () => {
  const main = readFileSync("src/main.ts", "utf8");
  const side = readFileSync("src/side-palette/side-palette-view.ts", "utf8");
  const modal = readFileSync("src/ui/highlight-export-modal.ts", "utf8");
  assert.match(side, /setTitle\("Export Highlight"\)[\s\S]{0,180}exportCardHighlights/);
  assert.match(main, /extractHighlights\(source\.content \?\? ""\)/);
  assert.match(main, /new HighlightExportModal/);
  assert.match(main, /new HighlightCanvasLayoutModal/);
  assert.match(main, /createItemBundle\(items, context\)/);
  assert.match(main, /createTreeBundle\(entries, context\)/);
  assert.match(main, /new TextScrapWorkspaceModal/);
  assert.match(main, /store\.addToWorkspaceAsUnlinked\(workspaceId, item\)/);
  assert.match(main, /store\.collectCanvasItems\(items\)/);
  assert.match(main, /miniPalette\.tab = "collect"/);
  assert.match(modal, /한 번에 하나만 선택/);
  assert.match(modal, /연결 없는 묶음/);
  assert.match(modal, /MindMap 연결/);
});
