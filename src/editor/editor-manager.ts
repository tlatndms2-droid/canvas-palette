import { App, Notice, TFile } from "obsidian";
import type CanvasPalettePlugin from "../main";
import { FloatingEditor } from "./floating-editor";
import type { PaletteEditorTarget } from "./native-markdown-editor";

export class PaletteEditorManager {
  private activeEditor: FloatingEditor | null = null;
  constructor(private readonly app: App, private readonly plugin: CanvasPalettePlugin) {}

  async openItem(itemId: string): Promise<boolean> {
    const target = await this.buildTarget(itemId);
    if (!target) return false;
    return this.openTarget(target, (text) => {
      const item = this.plugin.store.data.items[itemId];
      if (!item) return;
      this.plugin.store.updateItem(itemId, { displayTitle: item.displayTitle, tags: item.tags, label: item.label, caption: item.caption, content: text });
    });
  }

  async openBack(itemId: string): Promise<boolean> {
    const item = this.plugin.store.data.items[itemId];
    if (!item) return false;
    return this.openTarget({ itemId, kind: "card", file: null, title: `${item.displayTitle} — Back`, initialText: item.backContent }, (text) => this.plugin.store.setItemBack(itemId, text));
  }

  async openCanvasBack(canvasPath: string, nodeId: string, title: string): Promise<boolean> {
    const state = this.plugin.store.getCanvasNodeMetadata(canvasPath, nodeId);
    return this.openTarget({ itemId: `${canvasPath}:${nodeId}`, kind: "card", file: null, title: `${title} — Back`, initialText: state?.backContent ?? "" }, (text) => this.plugin.store.setCanvasNodeBack(canvasPath, nodeId, text));
  }

  private async openTarget(target: PaletteEditorTarget, onSave: (text: string) => void): Promise<boolean> {
    if (this.activeEditor) await this.activeEditor.close(true);
    const editor = new FloatingEditor(
      this.app,
      target,
      this.plugin.store.data.uiState.quickEditor,
      onSave,
      () => this.plugin.store.changed(),
      () => { if (this.activeEditor === editor) this.activeEditor = null; }
    );
    this.activeEditor = editor;
    try { await editor.open(); }
    catch (error) {
      this.activeEditor = null;
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Could not open the Obsidian editor: ${message}`);
    }
    return true;
  }

  async close(): Promise<void> { await this.activeEditor?.close(true); }

  private async buildTarget(itemId: string): Promise<PaletteEditorTarget | null> {
    const item = this.plugin.store.data.items[itemId];
    if (!item || (item.type !== "card" && item.type !== "markdown")) return null;
    if (item.type === "markdown") {
      const file = item.origin.filePath ? this.app.vault.getAbstractFileByPath(item.origin.filePath) : null;
      if (!(file instanceof TFile) || file.extension.toLowerCase() !== "md") {
        new Notice("The original Markdown file is unavailable.");
        return null;
      }
      return { itemId, kind: "file", file, title: item.displayTitle, initialText: await this.app.vault.cachedRead(file) };
    }
    return { itemId, kind: "card", file: null, title: item.displayTitle, initialText: item.content ?? "" };
  }
}
