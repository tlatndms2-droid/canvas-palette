import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Canvas metadata exposes a per-item caption size and linked file rename", async () => {
  const modal = await readFile(new URL("../src/ui/modal.ts", import.meta.url), "utf8");
  const main = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
  const controller = await readFile(new URL("../src/canvas/canvas-metadata-controller.ts", import.meta.url), "utf8");
  const render = await readFile(new URL("../src/ui/render.ts", import.meta.url), "utf8");
  const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(modal, /Caption font size \(Canvas\)/);
  assert.match(modal, /type: "number", min: "8", max: "32"/);
  assert.match(modal, /text: "File name"/);
  assert.match(main, /linkedItem && \(linkedItem\.type === "markdown" \|\| linkedItem\.type === "image"\)/);
  assert.match(main, /source instanceof TFile \? \{ name: source\.basename, rename: \(name: string\) => this\.renameCanvasSourceFile/);
  assert.match(main, /renameLinkedItem\(linkedItem\.id, name\)/);
  assert.match(controller, /--cp-caption-font-size/);
  assert.match(render, /--cp-caption-font-size/);
  assert.match(styles, /\.cp-item__caption\{position:static/);
});
