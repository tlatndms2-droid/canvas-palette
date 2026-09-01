import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const main = readFileSync("src/main.ts", "utf8");
const adapter = readFileSync("src/canvas/canvas-adapter.ts", "utf8");
const side = readFileSync("src/side-palette/side-palette-view.ts", "utf8");

test("selected Outliner items export through a dedicated mind-map tree", () => {
  assert.match(main, /async exportItemsAsMindMap\(itemIds: string\[\]\)/);
  assert.match(main, /this\.canvas\.createTreeBundle\(tree, context\)/);
  assert.match(main, /private exportSelectedItemTree\(itemIds: string\[\]\)/);
  assert.match(main, /const hasSelectedAncestor = \(itemId: string\)/);
  assert.match(main, /for \(const itemId of selected\) if \(!hasSelectedAncestor\(itemId\)\) addItem\(itemId, null/);
  assert.match(side, /setTitle\("Export from MindMap to Canvas"\)[\s\S]{0,180}exportItemsAsMindMap\(targetIds\)/);
});

test("tree bundles retain hierarchy edges and apply depth-aware headings", () => {
  assert.match(adapter, /const depths = this\.treeDepths\(entries\)/);
  assert.match(adapter, /const headingLevel = Math\.min\(6, \(depths\.get\(entry\.id\) \?\? 0\) \+ 1\)/);
  assert.match(adapter, /text: `\$\{"#"\.repeat\(headingLevel\)\} \$\{name\}`/);
  assert.match(adapter, /const title = headingLevel \? `\$\{"#"\.repeat\(Math\.min\(6, headingLevel\)\)\} \$\{item\.displayTitle\}`/);
  assert.match(adapter, /if \(fromNode && toNode\) edges\.push/);
});

test("group exports choose a concrete internal anchor before falling back to the group container", () => {
  assert.match(adapter, /node\.parentId === outerGroup\?\.id && node\.type !== "group"/);
  assert.match(adapter, /snapshot\.nodes\.find\(\(node\) => node\.type !== "group"\)\?\.id/);
  assert.match(adapter, /outerGroup\?\.id/);
});
