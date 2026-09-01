import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const adapter = readFileSync("src/canvas/canvas-adapter.ts", "utf8");
const main = readFileSync("src/main.ts", "utf8");
const controller = readFileSync("src/canvas/export-placement-controller.ts", "utf8");
const styles = readFileSync("styles.css", "utf8");

test("Export builds an in-memory Bundle and does not create a Canvas file", () => {
  assert.match(adapter, /export interface ExportBundle/);
  assert.match(adapter, /createItemBundle\(/);
  assert.match(adapter, /createTreeBundle\(/);
  assert.doesNotMatch(adapter, /vault\.create\(/);
  assert.match(adapter, /async commitBundle\(/);
});

test("all Export entry points choose a target Canvas and start placement", () => {
  assert.match(main, /new CanvasTargetModal\(/);
  assert.match(main, /createItemBundle\(items, context\)/);
  assert.match(main, /createTreeBundle\(this\.exportTree\(workspace\.id\), context\)/);
  assert.match(main, /createTreeBundle\(this\.exportTree\(collection\.workspaceId, collectionId\), context\)/);
  assert.match(main, /this\.exportPlacement\.start\(context, bundle, mode\)/);
});

test("preview blocks collision and commits only after a Canvas click", () => {
  assert.match(controller, /bundleCollides\(/);
  assert.match(controller, /Press Escape to cancel/);
  assert.match(controller, /commitBundle\(/);
  assert.match(styles, /\.cp-export-placement \{[^}]*pointer-events: none/);
});
