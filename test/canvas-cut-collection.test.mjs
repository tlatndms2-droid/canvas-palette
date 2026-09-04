import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [types, defaults, adapter, main, toolbar, render, preview, styles] = await Promise.all([
  readFile(new URL("../src/core/types.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/core/defaults.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/canvas/canvas-adapter.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/main.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/canvas/canvas-node-toolbar-controller.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/render.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/preview/preview-service.ts", import.meta.url), "utf8"),
  readFile(new URL("../styles.css", import.meta.url), "utf8")
]);

test("Canvas cut snapshots are explicit Group items and legacy items default to ordinary Groups", () => {
  assert.match(types, /cutFromCanvas\?: boolean/);
  assert.match(defaults, /cutFromCanvas: repairedType === "group" && item\.cutFromCanvas === true/);
  assert.match(adapter, /displayTitle: cutFromCanvas \? "잘라낸 묶음"/);
  assert.match(adapter, /origin: cutFromCanvas \? \{\} : \{ canvasPath, canvasNodeId: nodeId \}/);
});

test("Canvas cut captures selected Groups, removes every touching edge, and only reports success after Canvas save", () => {
  const start = adapter.indexOf("async cutSelection()");
  const end = adapter.indexOf("\n  async collectNode", start);
  const cut = adapter.slice(start, end);
  assert.match(cut, /expandGroupNodes\(document\.nodes, \[group\.id\]\)/);
  assert.match(cut, /groupItem\(cutNodes, document\.edges, context\.file\.path, selectedNodes\[0\]\.id, true\)/);
  assert.match(cut, /nodes: document\.nodes\.filter\(\(node\) => !cutNodeIds\.has\(node\.id\)\)/);
  assert.match(cut, /edges: document\.edges\.filter\(\(edge\) => !cutNodeIds\.has\(edge\.fromNode\) && !cutNodeIds\.has\(edge\.toNode\)\)/);
  assert.match(cut, /await context\.runtime\.setData\(next\)/);
  assert.match(cut, /catch \(error\)[\s\S]*return null/);
  assert.match(cut, /return \{ item, canvasPath: context\.file\.path, remainingNodeIds/);
});

test("Cut collection opens Collect only after success and reconciles old Canvas links", () => {
  const start = main.indexOf("async cutCanvasSelection()");
  const end = main.indexOf("\n  sendItemsToMini", start);
  const cut = main.slice(start, end);
  assert.match(cut, /const cut = await this\.canvas\.cutSelection\(\)/);
  assert.match(cut, /if \(!cut\) return/);
  assert.match(cut, /store\.reconcileCanvasLinks\(cut\.canvasPath, cut\.remainingNodeIds\)/);
  assert.match(cut, /store\.collectCanvasItems\(\[cut\.item\]\)/);
  assert.match(cut, /miniPalette\.tab = "collect"/);
});

test("Cut collection has a dedicated scissors toolbar action and approved orange presentation", () => {
  assert.match(toolbar, /cutToMini/);
  assert.match(toolbar, /"scissors", "잘라내어 Mini Palette에 수집"/);
  assert.match(toolbar, /cp-canvas-toolbar-action--cut/);
  assert.match(render, /cutFromCanvas = item\.type === "group" && item\.cutFromCanvas === true/);
  assert.match(render, /if \(cutFromCanvas\) \{ setIcon\(icon, "scissors"\)/);
  assert.match(preview, /cp-cut-collection__details/);
  assert.match(preview, /cp-cut-collection__status", text: "Canvas에서 잘라냄"/);
  assert.match(styles, /\.cp-item--cut\{border-top:3px solid #f59e0b/);
  assert.match(styles, /\.cp-canvas-toolbar-action--cut\{[^}]*background:#f59e0b/);
});
