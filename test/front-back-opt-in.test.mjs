import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

async function loadDefaults() {
  const directory = await mkdtemp(join(tmpdir(), "canvas-palette-defaults-test-"));
  const outfile = join(directory, "defaults.mjs");
  await build({ entryPoints: [join(process.cwd(), "src/core/defaults.ts")], outfile, bundle: true, format: "esm", platform: "node" });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { ...module, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

test("Image Front Back remains opt-in instead of being enabled by item type", async () => {
  const { migrateData, cleanup } = await loadDefaults();
  const data = migrateData({
    schemaVersion: 10,
    items: {
      ordinary: { id: "ordinary", type: "image", backContent: "", facesEnabled: false },
      chosen: { id: "chosen", type: "image", backContent: "Image notes", facesEnabled: true },
      group: { id: "group", type: "group", backContent: "stale", facesEnabled: true }
    }
  });

  assert.equal(data.schemaVersion, 16);
  assert.equal(data.items.ordinary.facesEnabled, false);
  assert.equal(data.items.chosen.facesEnabled, true);
  assert.equal(data.items.chosen.backContent, "Image notes");
  assert.equal(data.items.group.facesEnabled, false);
  assert.equal(data.items.group.backContent, "");
  await cleanup();
});
