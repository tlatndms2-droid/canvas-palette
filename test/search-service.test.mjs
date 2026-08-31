import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

async function loadSearch() {
  const directory = await mkdtemp(join(tmpdir(), "canvas-palette-search-test-"));
  const outfile = join(directory, "search.mjs");
  await build({ entryPoints: [join(process.cwd(), "src/search/search-service.ts")], outfile, bundle: true, format: "esm", platform: "node" });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { SearchService: module.SearchService, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

const item = (tags, label, title = "Planning note") => ({
  id: title, type: "card", displayTitle: title, tags, label, caption: "", createdAt: 1, modifiedAt: 1,
  origin: { canvasPath: "Projects/Planning.canvas" }, canvasPlacements: [{ canvasPath: "Archive.canvas", nodeIds: ["one"], placedAt: 1 }], content: "Meeting details", backContent: "Private synthesis"
});

test("Obsidian-like tag, label, AND, OR, and parentheses filter palette items", async () => {
  const { SearchService, cleanup } = await loadSearch();
  const search = new SearchService();
  const work = item(["작업"], "진행 중");
  const important = item(["중요"], "보류", "Important note");

  assert.equal(search.matches(work, '#작업 label:"진행 중"'), true);
  assert.equal(search.matches(work, 'tag:작업 label:"진행 중"'), true);
  assert.equal(search.matches(work, 'tag:#작업 label:"진행 중"'), true);
  assert.equal(search.matches({ ...work, tags: ["#작업"] }, 'tag:작업'), true);
  assert.equal(search.matches(important, '#작업 label:"진행 중"'), false);
  assert.equal(search.matches(important, "#작업 OR #중요"), true);
  assert.equal(search.matches(work, '(#작업 OR #중요) label:"진행 중"'), true);
  assert.equal(search.matches(important, '(#작업 OR #중요) label:"진행 중"'), false);
  assert.equal(search.matches(work, "Meeting #작업"), true);
  assert.equal(search.matches(work, "type:card"), true);
  assert.equal(search.matches(work, 'space:"Projects/Planning.canvas"'), true);
  assert.equal(search.matches(work, 'space:"Other.canvas"'), false);
  assert.equal(search.matches(work, "unlinked"), false);
  assert.equal(search.matches(work, "unlinked", { unlinked: true }), true);
  assert.equal(search.matches(work, "unlinked", { unlinked: false }), false);
  const unlinked = { ...work, origin: {}, canvasPlacements: [] };
  assert.equal(search.matches(unlinked, "unlinked"), true);
  assert.equal(search.matches({ ...unlinked, canvasPlacements: [{ canvasPath: "A.canvas", nodeIds: [], placedAt: 1 }] }, "unlinked"), true);
  assert.equal(search.matches(work, "synthesis"), true);
  assert.equal(search.matches(work, "file:Planning"), true);
  assert.equal(search.matches(work, "path:Projects"), false);
  assert.equal(search.matches(work, "group:프로젝트", { groupNames: ["프로젝트 자료"] }), true);
  assert.equal(search.matches(work, "프로젝트", { groupNames: ["프로젝트 자료"] }), true);

  await cleanup();
});

test("guided search exposes reusable tokens for chips and quoted facets", async () => {
  const { SearchService, cleanup } = await loadSearch();
  const search = new SearchService();
  assert.deepEqual(search.tokens('tag:request group:"하나의 그룹" path:inbox'), ["tag:request", 'group:"하나의 그룹"', "path:inbox"]);
  assert.equal(search.toggleToken('tag:request group:"하나의 그룹"', 'group:"하나의 그룹"'), "tag:request");
  await cleanup();
});

test("index tokens are added to and removed from the visible search query", async () => {
  const { SearchService, cleanup } = await loadSearch();
  const search = new SearchService();
  const withTag = search.toggleToken("meeting", "#작업");
  assert.equal(withTag, "meeting #작업");
  assert.equal(search.hasToken(withTag, "#작업"), true);
  assert.equal(search.toggleToken(withTag, "#작업"), "meeting");
  assert.equal(search.setFacet("meeting type:image", "type", "type:card"), "meeting type:card");
  assert.equal(search.setFacet('meeting space:"Archive.canvas"', "space", null), "meeting");
  assert.equal(search.toggleToken("type:image", "unlinked"), "type:image unlinked");
  assert.equal(search.toggleToken("type:image unlinked", "unlinked"), "type:image");

  await cleanup();
});
