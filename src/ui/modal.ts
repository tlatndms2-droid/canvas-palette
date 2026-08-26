import { App, Modal, Setting } from "obsidian";
import type CanvasPalettePlugin from "../main";
import type { PaletteItem, PaletteMetadata } from "../core/types";
import { createLabelColorPicker } from "./label-color-picker";

export class MetadataEditorModal extends Modal {
  constructor(app: App, private readonly plugin: CanvasPalettePlugin, private readonly initial: Pick<PaletteMetadata, "tags" | "label" | "labelColor" | "caption">, private readonly onSave: (metadata: Pick<PaletteMetadata, "tags" | "label" | "labelColor" | "caption">) => void) { super(app); }
  onOpen(): void {
    this.contentEl.addClass("canvas-palette", "cp-metadata-editor");
    this.contentEl.createEl("h2", { text: "Palette metadata" });
    this.contentEl.createEl("label", { text: "Tags" });
    const tags = this.contentEl.createEl("input", { value: this.initial.tags.join(", "), attr: { placeholder: "tag1, tag2" } });
    this.contentEl.createEl("label", { text: "Label" });
    const label = this.contentEl.createEl("input", { value: this.initial.label, attr: { placeholder: "e.g. In progress" } });
    this.contentEl.createEl("label", { text: "Label color" });
    const labelColor = createLabelColorPicker(this.contentEl, this.initial.labelColor, this.plugin.store.data.settings.labelColorPresets, (color) => this.plugin.store.addLabelColorPreset(color));
    this.contentEl.createEl("label", { text: "Caption" });
    const caption = this.contentEl.createEl("textarea", { text: this.initial.caption, attr: { placeholder: "Short description" } });
    const actions = this.contentEl.createDiv({ cls: "cp-modal-actions" });
    actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    actions.createEl("button", { text: "Save", cls: "mod-cta" }).addEventListener("click", () => {
      const labelValue = label.value.trim();
      this.onSave({ tags: [...new Set(tags.value.split(",").map((tag) => tag.trim().replace(/^#/, "")).filter(Boolean))], label: labelValue, labelColor: labelValue ? labelColor.value : "", caption: caption.value.trim() });
      this.close();
    });
  }
  onClose(): void { this.contentEl.empty(); }
}

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

export class TagLabelModal extends Modal {
  constructor(app: App, private readonly plugin: CanvasPalettePlugin, private readonly itemIds: string[]) { super(app); }

  onOpen(): void {
    const items = this.itemIds.map((id) => this.plugin.store.data.items[id]).filter((item): item is PaletteItem => Boolean(item));
    if (items.length === 0) { this.close(); return; }
    const workspaceItems = this.plugin.store.itemsForWorkspace(this.plugin.store.data.uiState.activeWorkspaceId);
    const knownTags = [...new Set([...workspaceItems.flatMap((item) => item.tags), ...items.flatMap((item) => item.tags)])].sort((a, b) => a.localeCompare(b));
    const knownLabels = [...new Set([...workspaceItems.map((item) => item.label), ...items.map((item) => item.label)].filter(Boolean))].sort((a, b) => a.localeCompare(b));
    this.contentEl.addClass("canvas-palette", "cp-tag-label-modal");
    this.contentEl.createEl("h2", { text: items.length === 1 ? "Metadata" : `Metadata · ${items.length} items` });
    this.contentEl.createEl("h3", { text: "Tags" });
    const tagControls = new Map<string, HTMLInputElement>();
    const tagList = this.contentEl.createDiv({ cls: "cp-toggle-list" });
    for (const tag of knownTags) {
      const count = items.filter((item) => item.tags.includes(tag)).length;
      const row = tagList.createEl("label", { cls: "cp-toggle-row" });
      const checkbox = row.createEl("input", { attr: { type: "checkbox" } });
      checkbox.checked = count === items.length;
      checkbox.indeterminate = count > 0 && count < items.length;
      checkbox.addEventListener("change", () => { checkbox.indeterminate = false; checkbox.dataset.touched = "true"; });
      row.createSpan({ text: `#${tag}` });
      tagControls.set(tag, checkbox);
    }
    if (knownTags.length === 0) tagList.createDiv({ cls: "cp-empty", text: "No existing tags." });
    const newTags = this.contentEl.createEl("input", { attr: { placeholder: "Add tags, separated by commas" } });
    this.contentEl.createEl("h3", { text: "Label" });
    const currentLabels = new Set(items.map((item) => item.label));
    const radioName = `cp-label-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const labelList = this.contentEl.createDiv({ cls: "cp-toggle-list" });
    let selectedLabel = currentLabels.size === 1 ? items[0].label : "__keep__";
    if (currentLabels.size > 1) this.radio(labelList, radioName, "__keep__", "Keep current labels", true, (value) => { selectedLabel = value; });
    this.radio(labelList, radioName, "", "No label", currentLabels.size === 1 && items[0].label === "", (value) => { selectedLabel = value; });
    for (const label of knownLabels) this.radio(labelList, radioName, label, label, currentLabels.size === 1 && items[0].label === label, (value) => { selectedLabel = value; });
    const newLabel = this.contentEl.createEl("input", { attr: { placeholder: "New label" } });
    this.contentEl.createEl("label", { text: "Label color" });
    const sharedColors = new Set(items.map((item) => item.labelColor ?? ""));
    const labelColor = this.contentEl.createEl("input", { attr: { type: "color", "aria-label": "Label color" } });
    labelColor.value = sharedColors.size === 1 && items[0].labelColor ? items[0].labelColor : "#8b5cf6";
    let colorTouched = false;
    labelColor.addEventListener("input", () => { colorTouched = true; });
    this.contentEl.createEl("h3", { text: "Caption" });
    const currentCaptions = new Set(items.map((item) => item.caption));
    const caption = this.contentEl.createEl("textarea", { text: currentCaptions.size === 1 ? items[0].caption : "", attr: { placeholder: currentCaptions.size > 1 ? "Keep current captions unless edited" : "Short description" } });
    let captionTouched = false;
    caption.addEventListener("input", () => { captionTouched = true; });
    const actions = this.contentEl.createDiv({ cls: "cp-modal-actions" });
    actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    actions.createEl("button", { text: "Apply", cls: "mod-cta" }).addEventListener("click", () => {
      const additions = newTags.value.split(",").map((tag) => tag.trim().replace(/^#/, "")).filter(Boolean);
      const explicitLabel = newLabel.value.trim();
      for (const item of items) {
        const tags = new Set(item.tags);
        for (const [tag, control] of tagControls) {
          if (control.dataset.touched !== "true") continue;
          if (control.checked) tags.add(tag); else tags.delete(tag);
        }
        for (const tag of additions) tags.add(tag);
        const label = explicitLabel || (selectedLabel === "__keep__" ? item.label : selectedLabel);
        const labelChanged = explicitLabel.length > 0 || selectedLabel !== "__keep__";
        const labelColorValue = !label ? "" : colorTouched || labelChanged ? labelColor.value : item.labelColor ?? "";
        this.plugin.store.updateItem(item.id, { displayTitle: item.displayTitle, tags: [...tags], label, labelColor: labelColorValue, caption: captionTouched || currentCaptions.size === 1 ? caption.value.trim() : item.caption, ...(item.type === "card" ? { content: item.content ?? "" } : {}) });
      }
      this.close();
    });
  }

  onClose(): void { this.contentEl.empty(); }

  private radio(parent: HTMLElement, name: string, value: string, title: string, checked: boolean, onSelect: (value: string) => void): void {
    const row = parent.createEl("label", { cls: "cp-toggle-row" });
    const input = row.createEl("input", { attr: { type: "radio", name, value } });
    input.checked = checked;
    input.addEventListener("change", () => { if (input.checked) onSelect(value); });
    row.createSpan({ text: title });
  }
}

/** Metadata/details editor used for non-Markdown Palette items. */
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
    this.contentEl.createEl("label", { text: "Label color" });
    const labelColor = this.contentEl.createEl("input", { attr: { type: "color", "aria-label": "Label color" } });
    labelColor.value = item.labelColor || "#8b5cf6";
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
      const labelValue = label.value.trim();
      this.plugin.store.updateItem(item.id, { displayTitle: title.value.trim() || "Untitled", tags: this.parseTags(tags.value), label: labelValue, labelColor: labelValue ? labelColor.value : "", caption: caption.value, ...(content ? { content: content.value } : {}) });
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
