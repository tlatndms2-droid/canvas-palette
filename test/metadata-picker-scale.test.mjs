import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const modal = await readFile(new URL("../src/ui/modal.ts", import.meta.url), "utf8");
const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");

test("metadata picker keeps large Tag and Label collections inside virtualized search panels", () => {
  assert.match(modal, /knownTags\.filter\(\(tag\) => !query \|\| tag\.toLocaleLowerCase\(\)\.includes\(query\)\)/);
  assert.match(modal, /labelChoices\(\)\.filter/);
  assert.match(modal, /const start = Math\.max\(0, Math\.floor\(host\.scrollTop \/ rowHeight\) - overscan\)/);
  assert.match(modal, /const end = Math\.min\(values\.length/);
  assert.match(modal, /spacer\.style\.height = `\$\{values\.length \* rowHeight\}px`/);
  assert.match(modal, /row\.tabIndex = 0/);
  assert.match(modal, /event\.key === "Enter" \|\| event\.key === " "/);
  assert.match(styles, /\.cp-metadata-picker-list\{[^}]*height:216px[^}]*overflow-y:auto/);
  assert.match(styles, /\.modal\.cp-tag-label-shell\{[^}]*height:min\(650px/);
});

test("metadata picker keeps summaries, creation, Caption, and actions available", () => {
  assert.match(modal, /Selected \$\{selected\.length\} \/ Total \$\{knownTags\.length\}/);
  assert.match(modal, /placeholder: "New tag"/);
  assert.match(modal, /placeholder: "New label"/);
  assert.match(modal, /cls: "cp-tag-label-caption"/);
  assert.match(styles, /\.cp-tag-label-modal>\.cp-modal-actions\{[^}]*position:sticky/);
});
