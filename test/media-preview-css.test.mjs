import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");

test("selected card media previews snap as complete contained blocks", () => {
  assert.match(styles, /scroll-snap-type:y proximity/);
  assert.match(styles, /:is\(\.external-embed,\.video-embed\):has\(iframe,video\),[^{}]*\.mx-video-view\{[^}]*width:min\(100%,[^}]*height:auto!important[^}]*min-width:0!important[^}]*aspect-ratio:16 \/ 9[^}]*overflow:visible[^}]*scroll-snap-align:start/);
  assert.match(styles, /:is\(iframe,video\),[^{}]*\.mx-video-view>\.mx-player-shadow-root\{[^}]*width:100%!important[^}]*height:100%!important[^}]*max-height:100%!important/);
});

test("Canvas Back editor stays top-aligned with its rendered Back", () => {
  assert.match(styles, /\.cp-canvas-back-editor \.cm-scroller\{padding:0!important\}/);
  assert.match(styles, /\.cp-canvas-back-editor \.inline-title\{display:none!important\}/);
  assert.match(styles, /\.cp-canvas-back-editor \.markdown-source-view[^{}]*\.cp-canvas-back-editor \.cm-scroller\{[^}]*height:100%[^}]*min-height:0/);
  assert.match(styles, /\.cp-canvas-back-editor \.cm-scroller\{[^}]*align-items:flex-start/);
  assert.match(styles, /\.cp-canvas-back-editor \.cm-content\{[^}]*min-height:100%[^}]*padding:calc\(34px \* var\(--cp-canvas-meta-scale,1\)\) calc\(14px \* var\(--cp-canvas-meta-scale,1\)\)[^}]*align-content:flex-start/);
});
