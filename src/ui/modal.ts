import { App, Modal, Setting } from "obsidian";
import type CanvasPalettePlugin from "../main";
import type { PaletteItem } from "../core/types";

export class TextPromptModal extends Modal {
  private value: string;
  constructor(app: App, private readonly title: string, initial: string, private readonly onSubmit: (value: string) => void, private readonly placeholder = "") { super(app); this.value = initial; }
  onOpen(): void {
    this.contentEl.createEl("h2", { text: this.title });
    new Setting(this.contentEl).addText((text) => text.setValue(this.value).setPlaceholder(this.placeholder).onChange((value) => { this.value = value; }));
    new Setting(this.contentEl).addButton((button) => button.setButtonText("Save").setCta().onClick(() => { if (this.value.trim()) this.onSubmit(this.value.trim()); this.close(); }));
  }
  onClose(): void { this.contentEl.empty(); }
}

export class ConfirmDeleteModal extends Modal {
  constructor(app: App, private readonly count: number, private readonly onConfirm: () => void) { super(app); }
  onOpen(): void {
    this.contentEl.addClass("canvas-palette", "cp-confirm-modal");
    this.contentEl.createEl("h2", { text: "Delete Palette items?" });
    this.contentEl.createEl("p", { text: `${this.count} selected item${this.count === 1 ? "" : "s"} will be removed from Canvas Palette. Original Vault files and Canvas nodes will not be deleted.` });
    const actions = this.contentEl.createDiv({ cls: "cp-modal-actions" });
    actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    actions.createEl("button", { text: "Delete", cls: "mod-warning" }).addEventListener("click", () => { this.onConfirm(); this.close(); });
  }
  onClose(): void { this.contentEl.empty(); }
}

export class ItemEditorModal extends Modal {
  constructor(app: App, private readonly plugin: CanvasPalettePlugin, private readonly itemId: string) { super(app); }
  onOpen(): void {
    const item = this.plugin.store.data.items[this.itemId];
    if (!item) { this.close(); return; }
    this.contentEl.addClass("canvas-palette", "cp-item-editor");
    const heading = this.contentEl.createDiv({ cls: "cp-item-editor__heading" });
    heading.createEl("h2", { text: "Palette item" });
    heading.createSpan({ cls: "cp-chip", text: item.type.toUpperCase() });
    const title = this.field("Title", item.displayTitle);
    const tags = this.field("Tags", item.tags.join(", "), "tag1, tag2");
    const label = this.field("Label", item.label, "e.g. Idea");
    const caption = this.area("Caption", item.caption);
    let content: HTMLTextAreaElement | undefined;
    if (item.type === "card") content = this.area("Content", item.content ?? "", "Write card content…");
    this.contentEl.createEl("h3", { text: "Preview" });
    const preview = this.contentEl.createDiv({ cls: "cp-preview cp-item-editor__preview" });
    void this.plugin.preview.render(preview, item);
    this.renderCanvasLinks(item);
    const actions = this.contentEl.createDiv({ cls: "cp-modal-actions" });
    actions.createEl("button", { text: "Delete", cls: "mod-warning" }).addEventListener("click", () => new ConfirmDeleteModal(this.app, 1, () => { this.plugin.store.removeItems([item.id]); this.close(); }).open());
    actions.createEl("button", { text: "Open original" }).addEventListener("click", () => void this.plugin.openOriginal(item));
    actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    actions.createEl("button", { text: "Save", cls: "mod-cta" }).addEventListener("click", () => {
      this.plugin.store.updateItem(item.id, { displayTitle: title.value.trim() || "Untitled", tags: this.parseTags(tags.value), label: label.value.trim(), caption: caption.value, ...(content ? { content: content.value } : {}) });
      this.close();
    });
  }
  onClose(): void { this.contentEl.empty(); }
  private field(labelText: string, value: string, placeholder = ""): HTMLInputElement {
    this.contentEl.createEl("label", { text: labelText });
    return this.contentEl.createEl("input", { value, attr: { placeholder } });
  }
  private area(labelText: string, value: string, placeholder = ""): HTMLTextAreaElement {
    this.contentEl.createEl("label", { text: labelText });
    return this.contentEl.createEl("textarea", { text: value, attr: { placeholder } });
  }
  private parseTags(value: string): string[] { return [...new Set(value.split(",").map((tag) => tag.trim().replace(/^#/, "")).filter(Boolean))]; }
  private renderCanvasLinks(item: PaletteItem): void {
    const paths = [...new Set([item.origin.canvasPath, ...item.canvasPlacements.map((placement) => placement.canvasPath)].filter((path): path is string => Boolean(path)))];
    this.contentEl.createEl("h3", { text: "Linked canvases" });
    if (paths.length === 0) { this.contentEl.createDiv({ cls: "cp-empty cp-item-editor__empty", text: "Not linked to a Canvas yet." }); return; }
    const list = this.contentEl.createDiv({ cls: "cp-canvas-link-list" });
    for (const path of paths) list.createDiv({ cls: "cp-canvas-link", text: path });
  }
}
