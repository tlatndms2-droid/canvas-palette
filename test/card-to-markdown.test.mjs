import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const main = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
const modal = await readFile(new URL("../src/ui/modal.ts", import.meta.url), "utf8");
const canvas = await readFile(new URL("../src/canvas/canvas-adapter.ts", import.meta.url), "utf8");

test("Card export creates a separate Markdown file without overwriting or changing links", () => {
  assert.match(main, /async createMarkdownFromCard\(itemId: string, requestedName: string, requestedFolder: string\)/);
  assert.match(main, /if \(this\.app\.vault\.getAbstractFileByPath\(path\)\)/);
  assert.match(main, /await this\.ensureVaultFolder\(folder\)/);
  assert.match(main, /await this\.app\.vault\.create\(path, item\.content \?\? ""\)/);
  assert.doesNotMatch(main, /convertLinkedCardsToMarkdown/);
  assert.doesNotMatch(main, /store\.convertCardToMarkdown/);
  assert.doesNotMatch(canvas, /async convertLinkedCardsToMarkdown/);
});

test("linked renames propagate source file paths and Group labels through CanvasAdapter", () => {
  assert.match(main, /async renameLinkedItem\(itemId: string, requestedTitle: string\)/);
  assert.match(main, /this\.app\.fileManager\.renameFile\(source, nextPath\)/);
  assert.match(main, /this\.canvas\.renameLinkedFileNodes\(locations, nextPath\)/);
  assert.match(main, /rootGroup\.label = title/);
  assert.match(main, /this\.canvas\.renameLinkedGroupNodes\(locations, title\)/);
  assert.match(canvas, /async renameLinkedFileNodes/);
  assert.match(canvas, /async renameLinkedGroupNodes/);
  assert.match(canvas, /for \(const node of document\.nodes\) if \(nodeIds\.has\(node\.id\)\) changed = mutate\(node\) \|\| changed/);
});

test("Card Markdown creation dialog collects file name and folder and only closes after success", () => {
  assert.match(modal, /class CardMarkdownExportModal extends Modal/);
  assert.match(modal, /text: "File name"/);
  assert.match(modal, /text: "Folder"/);
  assert.match(modal, /if \(await this\.onCreate\(fileName\.value, folder\.value\)\) this\.close\(\)/);
  assert.match(modal, /Palette Card and every linked Canvas Card will remain unchanged/);
});
