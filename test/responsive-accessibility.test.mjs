import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("responsive Mini and Side expose keyboard tabs, labelled flyouts, and focus return", async () => {
  const [mini, side, render, styles] = await Promise.all([
    readFile(new URL("../src/mini-palette/floating-mini-palette.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/side-palette/side-palette-view.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/ui/render.ts", import.meta.url), "utf8"),
    readFile(new URL("../styles.css", import.meta.url), "utf8")
  ]);
  assert.match(mini, /role: "tablist"/);
  assert.match(mini, /aria-selected/);
  assert.match(mini, /ArrowLeft/);
  assert.match(mini, /role: "tabpanel"/);
  assert.match(mini, /data-cp-flyout-trigger/);
  assert.match(side, /role: "tablist"/);
  assert.match(side, /aria-expanded/);
  assert.match(side, /setIndexesFlyoutOpen\(false\)/);
  assert.match(render, /title: label/);
  assert.match(styles, /prefers-reduced-motion:reduce/);
  assert.match(styles, /focus-visible/);
});

test("Side layout mode is a single data attribute and responsive tabs own their selected colors", async () => {
  const [side, styles] = await Promise.all([
    readFile(new URL("../src/side-palette/side-palette-view.ts", import.meta.url), "utf8"),
    readFile(new URL("../styles.css", import.meta.url), "utf8")
  ]);

  assert.match(side, /root\.dataset\.layoutMode = this\.layoutMode/);
  assert.doesNotMatch(side, /root\.addClass\(`cp-side-layout--/);
  assert.match(styles, /\[data-layout-mode="medium"\]/);
  assert.match(styles, /\[data-layout-mode="very-narrow"\]/);
  assert.doesNotMatch(styles, /cp-side-layout--(?:medium|very-narrow)/);
  assert.match(styles, /\.cp-tabs button\[role="tab"\]\[aria-selected="true"\]\{border-color:var\(--cp-accent\);background:var\(--cp-accent\);color:var\(--text-on-accent,#fff\)\}/);
  assert.match(styles, /\.cp-side-tab\[role="tab"\]\[aria-selected="true"\]\{border-color:var\(--cp-border\);background:var\(--cp-accent-tint\);color:var\(--cp-accent\)\}/);
  assert.doesNotMatch(styles, /\.canvas-palette \[role="tab"\]\[aria-selected="true"\]\{border-color:var\(--cp-accent\);color:var\(--cp-accent\)\}/);
});
