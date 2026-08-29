import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/side-palette/side-palette-view.ts", import.meta.url), "utf8");
const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");

test("Viewport uses one compact filter menu and removable active chips", () => {
  assert.match(source, /cp-filter-menu-button/);
  assert.match(source, /setTitle\("종류"\)\.setIsLabel\(true\)/);
  assert.match(source, /setTitle\("상태"\)\.setIsLabel\(true\)/);
  assert.match(source, /cp-active-filter-chip/);
  assert.match(source, /aria-label": `Remove \$\{label\} filter`/);
  assert.doesNotMatch(source, /const filters = parent\.createDiv\(\{ cls: "cp-viewport-filters"/);
});

test("Viewport keeps Memo and view modes while compacting selected-item deletion", () => {
  assert.match(source, /iconButton\(header, "trash-2", `Delete \$\{selectedIds\.length\} selected item/);
  assert.match(source, /cls: "cp-viewport-memo"/);
  assert.match(source, /const viewSwitch = controls\.createDiv\(\{ cls: "cp-view-switch" \}\)/);
  assert.match(source, /this\.setSideView\("grid"\)/);
  assert.match(source, /this\.setSideView\("list"\)/);
  assert.match(styles, /\.cp-viewport-tools\{display:flex;align-items:flex-start/);
});

test("Outliner rows use compact aligned hierarchy controls without removing actions", () => {
  assert.match(source, /iconButton\(row, "plus", "Add nested collection"/);
  assert.match(source, /iconButton\(row, "pencil", "Rename collection"/);
  assert.match(source, /iconButton\(row, "trash-2", "Delete collection"/);
  assert.match(styles, /\.cp-outliner \.cp-outline-arrow\{flex:0 0 19px;width:19px;height:19px\}/);
  assert.match(styles, /\.cp-outliner \.cp-outline-row>\.cp-icon-button\{flex:0 0 22px;width:22px;height:22px/);
});
