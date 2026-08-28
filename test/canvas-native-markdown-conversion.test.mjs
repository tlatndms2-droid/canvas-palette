import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

async function loadMatcher() {
  const directory = await mkdtemp(join(tmpdir(), "canvas-palette-replacement-test-"));
  const outfile = join(directory, "replacement.mjs");
  await build({ entryPoints: [join(process.cwd(), "src/core/canvas-node-replacement.ts")], outfile, bundle: true, format: "esm", platform: "node" });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { findMarkdownNodeReplacement: module.findMarkdownNodeReplacement, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

test("native Canvas Convert to file matches the replacement Markdown node with its new ID", async () => {
  const { findMarkdownNodeReplacement, cleanup } = await loadMatcher();
  const previous = new Map([
    ["linked-text", { id: "linked-text", type: "text", text: "tag index", x: 100, y: 200, width: 280, height: 180 }],
    ["unrelated", { id: "unrelated", type: "text", text: "keep", x: 800, y: 900, width: 280, height: 180 }]
  ]);
  const current = new Map([
    ["generated-file", { id: "generated-file", type: "file", file: "Untitled 3.md", x: 100, y: 200, width: 280, height: 180 }],
    ["unrelated", previous.get("unrelated")]
  ]);

  const replacement = findMarkdownNodeReplacement(previous, current, ["linked-text"]);

  assert.equal(replacement?.removedNode.id, "linked-text");
  assert.equal(replacement?.replacementNode.id, "generated-file");
  assert.equal(replacement?.replacementNode.file, "Untitled 3.md");
  await cleanup();
});
