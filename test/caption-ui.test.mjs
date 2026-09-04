import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Canvas captions use one Canvas-local control while Palette captions keep a fixed display size", async () => {
  const modal = await readFile(new URL("../src/ui/modal.ts", import.meta.url), "utf8");
  const main = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
  const controller = await readFile(new URL("../src/canvas/canvas-metadata-controller.ts", import.meta.url), "utf8");
  const captionControl = await readFile(new URL("../src/canvas/canvas-caption-control.ts", import.meta.url), "utf8");
  const render = await readFile(new URL("../src/ui/render.ts", import.meta.url), "utf8");
  const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.doesNotMatch(modal, /Caption font size \(Canvas\)/);
  assert.match(modal, /text: "File name"/);
  assert.ok(modal.indexOf('text: "File name"') < modal.indexOf('text: "Tags"'));
  assert.match(main, /linkedItem && \(linkedItem\.type === "markdown" \|\| linkedItem\.type === "image" \|\| linkedItem\.type === "video"\)/);
  assert.match(main, /source instanceof TFile \? \{ name: source\.basename, rename: \(name: string\) => this\.renameCanvasSourceFile/);
  assert.match(main, /renameLinkedItem\(linkedItem\.id, name\)/);
  assert.match(controller, /settings\.canvasCaptionFontSize/);
  assert.match(captionControl, /모든 Canvas Item 캡션에 적용됩니다/);
  assert.match(captionControl, /setCanvasCaptionFontSize/);
  assert.doesNotMatch(render, /--cp-caption-font-size/);
  assert.match(styles, /\.cp-item__caption\{position:static[^}]*border-top:1px/);
  assert.match(styles, /\.cp-canvas-caption-control\{/);
});
