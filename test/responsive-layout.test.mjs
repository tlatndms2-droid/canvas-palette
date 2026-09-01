import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import ts from "typescript";

async function loadLayoutModule() {
  const source = await readFile(new URL("../src/ui/responsive-layout.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

async function loadDefaults() {
  const directory = await mkdtemp(join(tmpdir(), "canvas-palette-responsive-defaults-"));
  const outfile = join(directory, "defaults.mjs");
  await build({ entryPoints: [join(process.cwd(), "src/core/defaults.ts")], outfile, bundle: true, format: "esm", platform: "node" });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { ...module, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

test("Mini responsive modes honor every one-pixel boundary", async () => {
  const { miniLayoutMode } = await loadLayoutModule();
  assert.equal(miniLayoutMode(900), "wide");
  assert.equal(miniLayoutMode(899), "medium");
  assert.equal(miniLayoutMode(680), "medium");
  assert.equal(miniLayoutMode(679), "narrow");
  assert.equal(miniLayoutMode(480), "narrow");
  assert.equal(miniLayoutMode(479), "minimum");
  assert.equal(miniLayoutMode(360), "minimum");
  assert.equal(miniLayoutMode(359), "minimum");
});

test("Side responsive modes honor every one-pixel boundary", async () => {
  const { sideLayoutMode } = await loadLayoutModule();
  assert.equal(sideLayoutMode(520), "wide");
  assert.equal(sideLayoutMode(519), "medium");
  assert.equal(sideLayoutMode(360), "medium");
  assert.equal(sideLayoutMode(359), "very-narrow");
  assert.equal(sideLayoutMode(300), "very-narrow");
  assert.equal(sideLayoutMode(299), "very-narrow");
});

test("Attached flyouts prefer their requested side and stay within the host", async () => {
  const { attachedFlyoutPlacement } = await loadLayoutModule();
  assert.deepEqual(attachedFlyoutPlacement(1200, 80, 360, "right", 320), { side: "right", width: 320, panelLeft: 80 });
  assert.deepEqual(attachedFlyoutPlacement(900, 520, 360, "right", 320), { side: "left", width: 320, panelLeft: 520 });
  const shifted = attachedFlyoutPlacement(700, 300, 360, "right", 300);
  assert.equal(shifted.side, "left");
  assert.ok(shifted.panelLeft + shifted.width + 8 <= 700);
  const constrained = attachedFlyoutPlacement(500, 0, 360, "right", 300);
  assert.ok(constrained.panelLeft + 360 + 8 + constrained.width <= 500);
});

test("Side migration defaults responsive tab but keeps a Workspace choice", async () => {
  const { migrateData, cleanup } = await loadDefaults();
  const legacy = migrateData({ workspaces: { legacy: { id: "legacy", name: "Legacy", sideLayout: { viewportRatio: 0.5, topRatio: 0.5, indexRatio: 0.5, viewMode: "grid" } } } });
  assert.equal(legacy.workspaces.legacy.sideLayout.responsiveTab, "viewport");
  const saved = migrateData({ workspaces: { saved: { id: "saved", name: "Saved", sideLayout: { responsiveTab: "outliner" } } } });
  assert.equal(saved.workspaces.saved.sideLayout.responsiveTab, "outliner");
  await cleanup();
});
