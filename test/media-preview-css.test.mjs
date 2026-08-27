import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");

test("selected card media previews snap as complete contained blocks", () => {
  assert.match(styles, /scroll-snap-type:y proximity/);
  assert.match(styles, /:is\(\.external-embed,\.video-embed\):has\(iframe,video\),[^{}]*\.mx-video-view\{[^}]*width:min\(100%,[^}]*height:auto!important[^}]*min-width:0!important[^}]*aspect-ratio:16 \/ 9[^}]*overflow:visible[^}]*scroll-snap-align:start/);
  assert.match(styles, /:is\(iframe,video\),[^{}]*\.mx-video-view>\.mx-player-shadow-root\{[^}]*width:100%!important[^}]*height:100%!important[^}]*max-height:100%!important/);
});
