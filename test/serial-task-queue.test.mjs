import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

async function loadQueue() {
  const directory = await mkdtemp(join(tmpdir(), "canvas-palette-queue-test-"));
  const outfile = join(directory, "queue.mjs");
  await build({ entryPoints: [join(process.cwd(), "src/core/serial-task-queue.ts")], outfile, bundle: true, format: "esm", platform: "node" });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { SerialTaskQueue: module.SerialTaskQueue, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

test("rapid Canvas restores for one file finish in submission order", async () => {
  const { SerialTaskQueue, cleanup } = await loadQueue();
  const queue = new SerialTaskQueue();
  const events = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });

  const first = queue.enqueue("Board.canvas", async () => {
    events.push("first-start");
    await firstGate;
    events.push("first-end");
  });
  const second = queue.enqueue("Board.canvas", async () => {
    events.push("second-start");
    events.push("second-end");
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ["first-start"]);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(events, ["first-start", "first-end", "second-start", "second-end"]);
  await cleanup();
});

test("a failed restore does not block the next drop", async () => {
  const { SerialTaskQueue, cleanup } = await loadQueue();
  const queue = new SerialTaskQueue();
  const failed = queue.enqueue("Board.canvas", async () => { throw new Error("failed"); });
  const next = queue.enqueue("Board.canvas", async () => "restored");

  await assert.rejects(failed, /failed/);
  assert.equal(await next, "restored");
  await cleanup();
});
