import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const main = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
const modal = await readFile(new URL("../src/ui/modal.ts", import.meta.url), "utf8");
const canvas = await readFile(new URL("../src/canvas/canvas-adapter.ts", import.meta.url), "utf8");

test("Card conversion creates a new Markdown file without overwriting an existing path", () => {
  assert.match(main, /async convertCardToMarkdown\(itemId: string, requestedName: string, requestedFolder: string\)/);
  assert.match(main, /if \(this\.app\.vault\.getAbstractFileByPath\(path\)\)/);
  assert.match(main, /await this\.ensureVaultFolder\(folder\)/);
  assert.match(main, /await this\.app\.vault\.create\(path, item\.content \?\? ""\)/);
  assert.match(main, /await this\.canvas\.convertLinkedCardsToMarkdown\(this\.store\.linkedCanvasNodes\(item\), path\)/);
  assert.match(main, /this\.store\.convertCardToMarkdown\(item\.id, path\)/);
  assert.match(canvas, /node\.type = "file"/);
  assert.match(canvas, /node\.file = filePath/);
  assert.match(canvas, /delete node\.text/);
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

test("Card conversion dialog collects file name and folder and only closes after success", () => {
  assert.match(modal, /class CardToMarkdownModal extends Modal/);
  assert.match(modal, /text: "File name"/);
  assert.match(modal, /text: "Folder"/);
  assert.match(modal, /if \(await this\.onConvert\(fileName\.value, folder\.value\)\) this\.close\(\)/);
  assert.match(modal, /Existing Canvas Card nodes will remain unchanged/);
});
