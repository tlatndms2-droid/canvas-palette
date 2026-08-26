import { App, Modal, Notice, Setting, setIcon } from "obsidian";
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
  private keydownHandler?: (event: KeyboardEvent) => void;

  constructor(app: App, private readonly plugin: CanvasPalettePlugin, private readonly itemId: string) { super(app); }

  onOpen(): void {
    const item = this.plugin.store.data.items[this.itemId];
    if (!item) { this.close(); return; }

    this.containerEl.addClass("cp-floating-editor-container");
    this.modalEl.addClass("canvas-palette", "cp-floating-editor", `cp-theme-${this.plugin.store.data.settings.theme}`);
    if (this.plugin.store.data.settings.accentMode === "custom") this.modalEl.style.setProperty("--cp-accent", this.plugin.store.data.settings.accentColor);
    this.contentEl.addClass("cp-floating-editor__content");

    const header = this.contentEl.createDiv({ cls: "cp-floating-editor__header" });
    const title = header.createEl("input", { cls: "cp-floating-editor__title", value: item.displayTitle, attr: { "aria-label": "Palette item title" } });
    const type = header.createSpan({ cls: "cp-chip cp-floating-editor__type", text: item.type.toUpperCase() });
    type.setAttribute("aria-label", `${item.type} item`);
    const headerActions = header.createDiv({ cls: "cp-floating-editor__actions" });

    const body = this.contentEl.createDiv({ cls: "cp-floating-editor__body" });
    const preview = body.createDiv({ cls: "cp-floating-editor__preview" });
    const editor = item.type === "card"
      ? body.createEl("textarea", { cls: "cp-floating-editor__textarea", text: item.content ?? "", attr: { "aria-label": "Card content", spellcheck: "true" } })
      : undefined;
    if (editor) editor.hidden = true;

    const properties = this.contentEl.createDiv({ cls: "cp-floating-editor__properties" });
    properties.hidden = true;
    const propertyGrid = properties.createDiv({ cls: "cp-floating-editor__property-grid" });
    const tags = this.field(propertyGrid, "Tags", item.tags.join(", "), "tag1, tag2");
    const label = this.field(propertyGrid, "Label", item.label, "e.g. Idea");
    const caption = this.area(propertyGrid, "Caption", item.caption);
    this.renderCanvasLinks(properties, item);
    const destructiveActions = properties.createDiv({ cls: "cp-floating-editor__property-actions" });
    destructiveActions.createEl("button", { text: "Delete Palette item", cls: "mod-warning" }).addEventListener("click", () => new ConfirmDeleteModal(this.app, 1, () => { this.plugin.store.removeItems([item.id]); this.close(); }).open());

    let editing = false;
    const renderPreview = (): void => {
      const current = { ...item, displayTitle: title.value.trim() || "Untitled", ...(editor ? { content: editor.value } : {}) };
      void this.plugin.preview.render(preview, current);
    };
    let editButton: HTMLButtonElement | undefined;
    if (editor) editButton = this.iconButton(headerActions, "pencil", "Edit card content", () => {
      const button = editButton;
      if (!button) return;
      editing = !editing;
      editor.hidden = !editing;
      preview.hidden = editing;
      button.toggleClass("is-active", editing);
      button.setAttribute("aria-label", editing ? "Preview card" : "Edit card content");
      setIcon(button, editing ? "book-open" : "pencil");
      if (editing) { editor.focus(); editor.setSelectionRange(editor.value.length, editor.value.length); }
      else renderPreview();
    });
    this.iconButton(headerActions, "sliders-horizontal", "Item properties", () => { properties.hidden = !properties.hidden; });
    if (item.origin.filePath) this.iconButton(headerActions, "external-link", "Open original", () => void this.plugin.openOriginal(item));
    this.iconButton(headerActions, "minus", "Minimize editor", () => this.modalEl.toggleClass("is-minimized", !this.modalEl.hasClass("is-minimized")));

    const save = (): void => {
      this.plugin.store.updateItem(item.id, {
        displayTitle: title.value.trim() || "Untitled",
        tags: this.parseTags(tags.value),
        label: label.value.trim(),
        caption: caption.value,
        ...(editor ? { content: editor.value } : {})
      });
      if (!editing) renderPreview();
      new Notice("Palette item saved");
    };
    this.iconButton(headerActions, "save", "Save item", save, "mod-cta");
    this.iconButton(headerActions, "x", "Close editor", () => this.close());

    this.keydownHandler = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); save(); }
    };
    this.modalEl.addEventListener("keydown", this.keydownHandler);
    this.makeDraggable(header);
    renderPreview();
  }

  onClose(): void {
    if (this.keydownHandler) this.modalEl.removeEventListener("keydown", this.keydownHandler);
    this.contentEl.empty();
  }

  private iconButton(parent: HTMLElement, icon: string, label: string, onClick: () => void, extraClass = ""): HTMLButtonElement {
    const button = parent.createEl("button", { cls: `cp-icon-button ${extraClass}`.trim(), attr: { "aria-label": label, type: "button" } });
    setIcon(button, icon);
    button.addEventListener("click", onClick);
    return button;
  }

  private field(parent: HTMLElement, labelText: string, value: string, placeholder = ""): HTMLInputElement {
    const field = parent.createDiv({ cls: "cp-floating-editor__field" });
    field.createEl("label", { text: labelText });
    return field.createEl("input", { value, attr: { placeholder } });
  }

  private area(parent: HTMLElement, labelText: string, value: string, placeholder = ""): HTMLTextAreaElement {
    const field = parent.createDiv({ cls: "cp-floating-editor__field cp-floating-editor__field--wide" });
    field.createEl("label", { text: labelText });
    return field.createEl("textarea", { text: value, attr: { placeholder } });
  }

  private parseTags(value: string): string[] { return [...new Set(value.split(",").map((tag) => tag.trim().replace(/^#/, "")).filter(Boolean))]; }

  private renderCanvasLinks(parent: HTMLElement, item: PaletteItem): void {
    const paths = [...new Set([item.origin.canvasPath, ...item.canvasPlacements.map((placement) => placement.canvasPath)].filter((path): path is string => Boolean(path)))];
    parent.createEl("h3", { text: "Linked canvases" });
    if (paths.length === 0) { parent.createDiv({ cls: "cp-empty cp-item-editor__empty", text: "Not linked to a Canvas yet." }); return; }
    const list = parent.createDiv({ cls: "cp-canvas-link-list" });
    for (const path of paths) list.createDiv({ cls: "cp-canvas-link", text: path });
  }

  private makeDraggable(handle: HTMLElement): void {
    handle.addEventListener("pointerdown", (event) => {
      const target = event.target as HTMLElement;
      if (target.closest("button, input, textarea")) return;
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      const rect = this.modalEl.getBoundingClientRect();
      this.modalEl.style.left = `${rect.left}px`;
      this.modalEl.style.top = `${rect.top}px`;
      this.modalEl.style.right = "auto";
      this.modalEl.style.bottom = "auto";
      this.modalEl.style.transform = "none";
      const start = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
      const move = (pointer: PointerEvent): void => {
        const maxLeft = Math.max(0, window.innerWidth - 240);
        const maxTop = Math.max(0, window.innerHeight - 52);
        this.modalEl.style.left = `${Math.min(maxLeft, Math.max(0, start.left + pointer.clientX - start.x))}px`;
        this.modalEl.style.top = `${Math.min(maxTop, Math.max(0, start.top + pointer.clientY - start.y))}px`;
      };
      const end = (): void => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", end);
        handle.removeEventListener("pointercancel", end);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", end);
      handle.addEventListener("pointercancel", end);
    });
  }
}
