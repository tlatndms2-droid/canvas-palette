import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

async function loadPresence() {
  const directory = await mkdtemp(join(tmpdir(), "canvas-palette-presence-test-"));
  const outfile = join(directory, "presence.mjs");
  await build({ entryPoints: [join(process.cwd(), "src/core/canvas-node-presence.ts")], outfile, bundle: true, format: "esm", platform: "node" });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { mergeCanvasNodeIds: module.mergeCanvasNodeIds, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

test("a freshly restored runtime node survives reconciliation before disk save", async () => {
  const { mergeCanvasNodeIds, cleanup } = await loadPresence();
  const saved = new Set(["already-saved"]);
  const open = new Set(["already-saved", "fresh-runtime-node"]);

  const present = mergeCanvasNodeIds(saved, open);

  assert.deepEqual([...present].sort(), ["already-saved", "fresh-runtime-node"]);
  await cleanup();
});
