import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

async function loadCollision() {
  const directory = await mkdtemp(join(tmpdir(), "canvas-palette-placement-collision-"));
  const outfile = join(directory, "collision.mjs");
  await build({ entryPoints: [join(process.cwd(), "src/canvas/placement-collision.ts")], outfile, bundle: true, format: "esm", platform: "node" });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { bundleContentCollides: module.bundleContentCollides, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

const content = (id, x, y, width = 100, height = 80, type = "text") => ({ id, type, x, y, width, height });
const group = (id, x, y, width = 500, height = 400) => ({ id, type: "group", x, y, width, height });

test("groups and bundle gaps do not block a multi-item export", async () => {
  const { bundleContentCollides, cleanup } = await loadCollision();
  try {
    assert.equal(bundleContentCollides([group("container", 0, 0)], [content("left", 0, 0), content("right", 300, 0)], { x: 50, y: 50 }), false);
    assert.equal(bundleContentCollides([content("between", 170, 50)], [content("left", 0, 0), content("right", 300, 0)], { x: 50, y: 50 }), false);
  } finally { await cleanup(); }
});

test("only real content overlap blocks a multi-item export and replacement IDs stay ignored", async () => {
  const { bundleContentCollides, cleanup } = await loadCollision();
  try {
    const bundle = [group("new-group", 0, 0), content("card", 40, 40)];
    assert.equal(bundleContentCollides([group("container", 0, 0), content("occupied", 100, 100)], bundle, { x: 60, y: 60 }), true);
    assert.equal(bundleContentCollides([content("replaced", 100, 100)], bundle, { x: 60, y: 60 }, new Set(["replaced"])), false);
  } finally { await cleanup(); }
});
