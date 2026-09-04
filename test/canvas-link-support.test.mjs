import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const source = async (path) => readFile(new URL(path, root), "utf8");

test("native Canvas links are captured as Link items and restored as link nodes", async () => {
  const adapter = await source("src/canvas/canvas-adapter.ts");
  const types = await source("src/core/types.ts");
  assert.match(types, /PaletteItemType = "card" \| "markdown" \| "image" \| "video" \| "link" \| "group"/);
  assert.match(adapter, /node\.type === "link"/);
  assert.match(adapter, /type: "link", url: link\.url/);
  assert.match(adapter, /width: link\.width/);
  assert.match(adapter, /height: link\.height/);
});

test("Link items have explicit opening and no Front Back control", async () => {
  const render = await source("src/ui/render.ts");
  const mini = await source("src/mini-palette/floating-mini-palette.ts");
  const side = await source("src/side-palette/side-palette-view.ts");
  assert.match(render, /item\.type !== "group" && item\.type !== "link"/);
  assert.match(mini, /Open web link/);
  assert.match(side, /\["Link", "link"\]/);
});

test("YouTube Link preview provides an in-palette player and retains the external open action", async () => {
  const adapter = await source("src/canvas/canvas-adapter.ts");
  const preview = await source("src/preview/preview-service.ts");
  const modal = await source("src/ui/item-preview-modal.ts");
  assert.match(adapter, /youtube\.com\/oembed/);
  assert.match(preview, /youtube-nocookie\.com\/embed/);
  assert.match(modal, /renderYouTubePlayer/);
  assert.match(modal, /Open web link/);
});
