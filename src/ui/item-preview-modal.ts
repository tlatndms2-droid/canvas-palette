import { App, Modal, TFile } from "obsidian";
import type CanvasPalettePlugin from "../main";
import type { PaletteItem } from "../core/types";

export class ItemPreviewModal extends Modal {
  private previewClosed = false;

  constructor(app: App, private readonly plugin: CanvasPalettePlugin, private readonly itemId: string) { super(app); }

  onOpen(): void {
    const item = this.plugin.store.data.items[this.itemId];
    if (!item) { this.close(); return; }
    this.modalEl.addClass("canvas-palette", "cp-preview-modal", `cp-preview-modal--${item.type}`);
    this.contentEl.addClass("cp-large-preview");
    const header = this.contentEl.createDiv({ cls: "cp-large-preview__header" });
    header.createEl("h2", { text: item.displayTitle || "Untitled" });
    header.createSpan({ cls: "cp-chip", text: item.type.toUpperCase() });
    const body = this.contentEl.createDiv({ cls: "cp-large-preview__body" });
    if (item.type === "markdown") void this.renderCurrentMarkdown(body, item);
    else void this.plugin.preview.render(body, item, false);
  }

  onClose(): void { this.previewClosed = true; this.contentEl.empty(); }

  private async renderCurrentMarkdown(body: HTMLElement, item: PaletteItem): Promise<void> {
    const file = item.origin.filePath ? this.app.vault.getAbstractFileByPath(item.origin.filePath) : null;
    if (!(file instanceof TFile) || file.extension.toLowerCase() !== "md") {
      body.createDiv({ cls: "cp-empty", text: "The original Markdown file is unavailable." });
      return;
    }
    const content = await this.app.vault.cachedRead(file);
    if (this.previewClosed) return;
    await this.plugin.preview.render(body, { ...item, content }, false);
  }
}
