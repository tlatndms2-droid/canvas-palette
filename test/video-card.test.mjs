import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "esbuild";

async function loadDefaults() {
  const directory = await mkdtemp(join(tmpdir(), "canvas-palette-video-test-"));
  const outfile = join(directory, "defaults.mjs");
  await build({ entryPoints: [join(process.cwd(), "src/core/defaults.ts")], outfile, bundle: true, format: "esm", platform: "node" });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { ...module, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

test("legacy video files stop being stored as Markdown text", async () => {
  const { migrateData, cleanup } = await loadDefaults();
  const data = migrateData({ items: { legacy: { id: "legacy", type: "markdown", displayTitle: "clip", tags: [], label: "", caption: "", createdAt: 1, modifiedAt: 1, origin: { filePath: "clips/demo.MP4" }, canvasPlacements: [], content: "binary data", backContent: "", facesEnabled: false } } });
  assert.equal(data.items.legacy.type, "video");
  assert.equal(data.items.legacy.content, undefined);
  assert.equal(data.items.legacy.origin.filePath, "clips/demo.MP4");
  await cleanup();
});

test("every supported Canvas video extension becomes a video card", async () => {
  const { migrateData, cleanup } = await loadDefaults();
  for (const extension of ["mp4", "webm", "mov", "m4v", "ogv"]) {
    const data = migrateData({ items: { clip: { id: "clip", type: "markdown", displayTitle: "clip", tags: [], label: "", caption: "", createdAt: 1, modifiedAt: 1, origin: { filePath: `clips/demo.${extension}` }, canvasPlacements: [], content: "must not render", backContent: "", facesEnabled: false } } });
    assert.equal(data.items.clip.type, "video");
    assert.equal(data.items.clip.content, undefined);
  }
  await cleanup();
});

test("video cards use a native silent thumbnail and controlled large player", async () => {
  const [types, adapter, preview, styles, side, mini, main, store] = await Promise.all([
    readFile(new URL("../src/core/types.ts", import.meta.url), "utf8"), readFile(new URL("../src/canvas/canvas-adapter.ts", import.meta.url), "utf8"), readFile(new URL("../src/preview/preview-service.ts", import.meta.url), "utf8"), readFile(new URL("../styles.css", import.meta.url), "utf8"), readFile(new URL("../src/side-palette/side-palette-view.ts", import.meta.url), "utf8"), readFile(new URL("../src/mini-palette/floating-mini-palette.ts", import.meta.url), "utf8"), readFile(new URL("../src/main.ts", import.meta.url), "utf8"), readFile(new URL("../src/core/store.ts", import.meta.url), "utf8")
  ]);
  assert.match(types, /"video"/);
  assert.match(adapter, /VIDEO_EXTENSIONS/);
  assert.match(adapter, /type: PaletteItemType = IMAGE_EXTENSIONS\.has\(extension\) \? "image" : VIDEO_EXTENSIONS\.has\(extension\) \? "video" : "markdown"/);
  assert.match(adapter, /item\.type === "image" \|\| item\.type === "video"/);
  assert.match(preview, /item\.type === "video"/);
  assert.match(preview, /preload: "metadata"/);
  assert.match(preview, /video\.muted = compact/);
  assert.match(preview, /video\.controls = !compact/);
  assert.match(styles, /\.cp-item--video/);
  assert.match(styles, /\.cp-preview-modal--video/);
  assert.match(side, /\["Video", "video"\]/);
  assert.match(side, /item\.type === "video" \? "video"/);
  assert.match(mini, /"video"/);
  assert.match(main, /item\.type === "markdown" \|\| item\.type === "image" \|\| item\.type === "video"/);
  assert.match(store, /item\.type === "markdown" \|\| item\.type === "video" \? item\.origin\.filePath/);
  assert.match(preview, /item\.origin\.filePath \|\| item\.sourceReferencePath/);
});
