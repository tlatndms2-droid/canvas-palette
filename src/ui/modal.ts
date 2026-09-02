import { App, Modal, Setting, TFile } from "obsidian";
import type CanvasPalettePlugin from "../main";
import type { Collection, PaletteItem, PaletteMetadata } from "../core/types";
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
  constructor(app: App, private readonly title: string, initial: string, private readonly onSubmit: (value: string) => unknown | Promise<unknown>, private readonly placeholder = "") { super(app); this.value = initial; }
  onOpen(): void {
    this.contentEl.createEl("h2", { text: this.title });
    new Setting(this.contentEl).addText((text) => text.setValue(this.value).setPlaceholder(this.placeholder).onChange((value) => { this.value = value; }));
    new Setting(this.contentEl).addButton((button) => button.setButtonText("Save").setCta().onClick(async () => {
      const value = this.value.trim();
      if (!value) return;
      button.setDisabled(true);
      try { if (await this.onSubmit(value) !== false) this.close(); }
      finally { button.setDisabled(false); }
    }));
  }
  onClose(): void { this.contentEl.empty(); }
}

export class CanvasWorkspaceModal extends Modal {
  private value = "";
  constructor(app: App, private readonly canvasName: string, private readonly onSubmit: (value: string) => void) { super(app); }
  onOpen(): void {
    this.contentEl.addClass("canvas-palette", "cp-canvas-workspace-modal");
    this.contentEl.createEl("h2", { text: "New Canvas Workspace" });
    this.contentEl.createEl("label", { text: "Workspace name" });
    const input = this.contentEl.createEl("input", { attr: { type: "text", placeholder: "예: 튜토리얼 링크", "aria-label": "Workspace name" } });
    input.addEventListener("input", () => { this.value = input.value; });
    const owner = this.contentEl.createDiv({ cls: "cp-canvas-workspace-modal__owner" });
    owner.createSpan({ text: "소속 Canvas" });
    owner.createSpan({ text: `· ${this.canvasName}` });
    const actions = this.contentEl.createDiv({ cls: "cp-modal-actions" });
    actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    actions.createEl("button", { text: "Save", cls: "mod-cta" }).addEventListener("click", () => {
      const value = this.value.trim();
      if (!value) { input.focus(); return; }
      this.onSubmit(value); this.close();
    });
    window.setTimeout(() => input.focus(), 0);
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

export class ConfirmMiniStorageRemovalModal extends Modal {
  constructor(app: App, private readonly count: number, private readonly onConfirm: () => void) { super(app); }
  onOpen(): void {
    this.contentEl.addClass("canvas-palette", "cp-confirm-modal");
    this.contentEl.createEl("h2", { text: "Remove from Mini Palette?" });
    this.contentEl.createEl("p", { text: `${this.count} selected link${this.count === 1 ? "" : "s"} will be removed from Mini Palette only. Side Palette, Workspace items, original Vault files, and Canvas nodes will remain unchanged.` });
    const actions = this.contentEl.createDiv({ cls: "cp-modal-actions" });
    actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    actions.createEl("button", { text: "Remove from Mini", cls: "mod-warning" }).addEventListener("click", () => { this.onConfirm(); this.close(); });
  }
  onClose(): void { this.contentEl.empty(); }
}

export class ConfirmForeignCanvasWorkspaceModal extends Modal {
  constructor(app: App, private readonly workspaceName: string, private readonly onConfirm: () => void) { super(app); }
  onOpen(): void {
    this.contentEl.addClass("canvas-palette", "cp-confirm-modal");
    this.contentEl.createEl("h2", { text: "다른 Canvas의 대표 Workspace에 저장할까요?" });
    this.contentEl.createEl("p", { text: `“${this.workspaceName}”은 현재 Canvas가 아닌 다른 Canvas의 대표 Workspace입니다.` });
    this.contentEl.createEl("p", { text: "선택한 항목은 현재 Canvas와 연결되지 않은 상태로 저장됩니다." });
    const actions = this.contentEl.createDiv({ cls: "cp-modal-actions" });
    actions.createEl("button", { text: "취소" }).addEventListener("click", () => this.close());
    actions.createEl("button", { text: "저장", cls: "mod-cta" }).addEventListener("click", () => { this.onConfirm(); this.close(); });
  }
  onClose(): void { this.contentEl.empty(); }
}

export class AlreadySavedToWorkspaceModal extends Modal {
  constructor(app: App, private readonly workspaceName: string, private readonly savedCount: number, private readonly alreadySavedCount: number) { super(app); }
  onOpen(): void {
    this.contentEl.addClass("canvas-palette", "cp-confirm-modal");
    this.contentEl.createEl("h2", { text: "이미 Side Palette에 저장된 항목입니다" });
    this.contentEl.createEl("p", { text: `“${this.workspaceName}”에 이미 저장된 항목 ${this.alreadySavedCount}개는 중복 저장하지 않았습니다.` });
    if (this.savedCount > 0) this.contentEl.createEl("p", { text: `${this.savedCount}개 항목은 새로 저장되었습니다.` });
    const actions = this.contentEl.createDiv({ cls: "cp-modal-actions" });
    actions.createEl("button", { text: "확인", cls: "mod-cta" }).addEventListener("click", () => this.close());
  }
  onClose(): void { this.contentEl.empty(); }
}

export class ConfirmDeleteCollectionModal extends Modal {
  constructor(app: App, private readonly name: string, private readonly destination: string, private readonly itemCount: number, private readonly childCount: number, private readonly onConfirm: () => void) { super(app); }
  onOpen(): void {
    this.contentEl.addClass("canvas-palette", "cp-confirm-modal");
    this.contentEl.createEl("h2", { text: "Delete Collection?" });
    this.contentEl.createEl("p", { text: `“${this.name}” will be removed. Its ${this.itemCount} item${this.itemCount === 1 ? "" : "s"} and ${this.childCount} nested Collection${this.childCount === 1 ? "" : "s"} will move to ${this.destination}. No Palette items, Vault files, or Canvas nodes will be deleted.` });
    const actions = this.contentEl.createDiv({ cls: "cp-modal-actions" });
    actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    actions.createEl("button", { text: "Delete Collection", cls: "mod-warning" }).addEventListener("click", () => { this.onConfirm(); this.close(); });
  }
  onClose(): void { this.contentEl.empty(); }
}

export class ConfirmCanvasReplacementModal extends Modal {
  private resolved = false;
  constructor(app: App, private readonly onResolve: (confirmed: boolean) => void) { super(app); }
  onOpen(): void {
    this.contentEl.addClass("canvas-palette", "cp-confirm-modal");
    this.contentEl.createEl("h2", { text: "같은 카드가 이미 있습니다" });
    this.contentEl.createEl("p", { text: "현재 캔버스에 같은 카드가 이미 있습니다. 계속하면 기존 카드를 삭제하고 지금 지정한 위치에 다시 배치합니다." });
    const actions = this.contentEl.createDiv({ cls: "cp-modal-actions" });
    actions.createEl("button", { text: "취소" }).addEventListener("click", () => this.finish(false));
    actions.createEl("button", { text: "새 위치에 배치", cls: "mod-cta" }).addEventListener("click", () => this.finish(true));
  }
  onClose(): void {
    if (!this.resolved) { this.resolved = true; this.onResolve(false); }
    this.contentEl.empty();
  }
  private finish(confirmed: boolean): void {
    if (this.resolved) return;
    this.resolved = true;
    this.onResolve(confirmed);
    this.close();
  }
}

export class CanvasTargetModal extends Modal {
  private selectedPath: string | null;
  private resolved = false;
  constructor(app: App, private readonly files: TFile[], activePath: string | null, private readonly onResolve: (file: TFile | null) => void) { super(app); this.selectedPath = activePath && files.some((file) => file.path === activePath) ? activePath : files[0]?.path ?? null; }
  onOpen(): void {
    this.contentEl.addClass("canvas-palette", "cp-canvas-target-modal");
    this.contentEl.createEl("h2", { text: "Choose Canvas" });
    this.contentEl.createEl("p", { text: "Choose an existing Canvas, then click an empty area to place the export." });
    const search = this.contentEl.createEl("input", { attr: { type: "search", placeholder: "Search Canvas files…", "aria-label": "Search Canvas files" } });
    const list = this.contentEl.createDiv({ cls: "cp-canvas-target-list" });
    const render = (): void => {
      list.empty(); const query = search.value.trim().toLocaleLowerCase();
      for (const file of this.files.filter((candidate) => !query || candidate.path.toLocaleLowerCase().includes(query))) {
        const row = list.createEl("button", { cls: "cp-canvas-target-row", text: file.path, attr: { type: "button", "aria-pressed": String(file.path === this.selectedPath) } });
        if (file.path === this.selectedPath) row.addClass("is-active");
        row.addEventListener("click", () => { this.selectedPath = file.path; render(); });
      }
      if (list.childElementCount === 0) list.createDiv({ cls: "cp-empty", text: "No matching Canvas files." });
    };
    search.addEventListener("input", render); render();
    const actions = this.contentEl.createDiv({ cls: "cp-modal-actions" });
    actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.finish(null));
    actions.createEl("button", { text: "Choose Canvas", cls: "mod-cta" }).addEventListener("click", () => this.finish(this.files.find((file) => file.path === this.selectedPath) ?? null));
    window.requestAnimationFrame(() => search.focus());
  }
  onClose(): void { if (!this.resolved) this.finish(null); this.contentEl.empty(); }
  private finish(file: TFile | null): void { if (this.resolved) return; this.resolved = true; this.onResolve(file); this.close(); }
}

export class ConfirmExportDuplicateModal extends Modal {
  private resolved = false;
  constructor(app: App, private readonly count: number, private readonly onResolve: (choice: "replace" | "copy" | null) => void) { super(app); }
  onOpen(): void {
    this.contentEl.addClass("canvas-palette", "cp-confirm-modal");
    this.contentEl.createEl("h2", { text: "Some exported items are already on this Canvas" });
    this.contentEl.createEl("p", { text: `${this.count} linked item${this.count === 1 ? " is" : "s are"} already placed on the target Canvas.` });
    const actions = this.contentEl.createDiv({ cls: "cp-modal-actions" });
    actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.finish(null));
    actions.createEl("button", { text: "Keep existing and add", cls: "mod-cta" }).addEventListener("click", () => this.finish("copy"));
    actions.createEl("button", { text: "Replace existing", cls: "mod-warning" }).addEventListener("click", () => this.finish("replace"));
  }
  onClose(): void { if (!this.resolved) this.finish(null); this.contentEl.empty(); }
  private finish(choice: "replace" | "copy" | null): void { if (this.resolved) return; this.resolved = true; this.onResolve(choice); this.close(); }
}

export class TagLabelModal extends Modal {
  private outsideClick: ((event: PointerEvent) => void) | null = null;

  constructor(app: App, private readonly plugin: CanvasPalettePlugin, private readonly itemIds: string[]) { super(app); }

  onOpen(): void {
    const items = this.itemIds.map((id) => this.plugin.store.data.items[id]).filter((item): item is PaletteItem => Boolean(item));
    if (items.length === 0) { this.close(); return; }
    const workspaceItems = this.plugin.store.itemsForWorkspace(this.plugin.store.data.uiState.activeWorkspaceId);
    const knownTags = [...new Set([...workspaceItems.flatMap((item) => item.tags), ...items.flatMap((item) => item.tags)])].sort((a, b) => a.localeCompare(b));
    const knownLabels = [...new Set([...workspaceItems.map((item) => item.label), ...items.map((item) => item.label)].filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const labelColors = new Map<string, string>();
    for (const item of [...workspaceItems, ...items]) if (item.label && item.labelColor && !labelColors.has(item.label)) labelColors.set(item.label, item.labelColor);
    this.modalEl.addClass("cp-tag-label-shell");
    this.contentEl.addClass("canvas-palette", "cp-tag-label-modal");
    this.contentEl.createEl("h2", { text: items.length === 1 ? "Tags, label & caption" : `Tags, label & caption · ${items.length} items` });
    const tagSection = this.contentEl.createDiv({ cls: "cp-metadata-picker-section" });
    const tagHeading = tagSection.createDiv({ cls: "cp-metadata-picker-heading" });
    tagHeading.createEl("h3", { text: "Tags" });
    const tagCount = tagHeading.createSpan({ cls: "cp-metadata-picker-count" });
    const tagPicker = tagSection.createDiv({ cls: "cp-metadata-picker" });
    const tagSummary = tagPicker.createEl("button", { cls: "cp-metadata-picker-summary", attr: { type: "button", "aria-haspopup": "listbox", "aria-expanded": "false" } });
    const tagPanel = tagPicker.createDiv({ cls: "cp-metadata-picker-panel" });
    tagPanel.hidden = true;
    const tagSearch = tagPanel.createEl("input", { cls: "cp-metadata-picker-search", attr: { type: "search", placeholder: "Search tags", "aria-label": "Search tags" } });
    const tagStates = new Map<string, "all" | "mixed" | "none">();
    const touchedTags = new Set<string>();
    for (const tag of knownTags) {
      const count = items.filter((item) => item.tags.includes(tag)).length;
      tagStates.set(tag, count === items.length ? "all" : count > 0 ? "mixed" : "none");
    }
    const tagListHost = tagPanel.createDiv({ cls: "cp-metadata-picker-list" });
    const updateTagSummary = (): void => {
      const selected = knownTags.filter((tag) => tagStates.get(tag) !== "none");
      tagCount.setText(`Selected ${selected.length} / Total ${knownTags.length}`);
      tagSummary.empty();
      const visible = selected.slice(0, 2);
      for (const tag of visible) tagSummary.createSpan({ cls: "cp-metadata-picker-chip", text: `#${tag}` });
      if (selected.length > visible.length) tagSummary.createSpan({ cls: "cp-metadata-picker-more", text: `+${selected.length - visible.length}` });
      if (selected.length === 0) tagSummary.createSpan({ cls: "cp-metadata-picker-placeholder", text: "Select tags" });
      tagSummary.createSpan({ cls: "cp-metadata-picker-chevron", text: "⌄" });
    };
    const renderTags = this.virtualList<string>(tagListHost, (tag) => {
      const row = createDiv({ cls: "cp-metadata-picker-row" });
      row.setAttribute("role", "option");
      row.tabIndex = 0;
      const checkbox = row.createEl("input", { attr: { type: "checkbox", tabindex: "-1" } });
      const state = tagStates.get(tag) ?? "none";
      checkbox.checked = state === "all";
      checkbox.indeterminate = state === "mixed";
      row.createSpan({ text: `#${tag}` });
      const toggleTag = (): void => {
        tagStates.set(tag, state === "all" ? "none" : "all");
        touchedTags.add(tag);
        updateTagSummary();
        filterTags();
      };
      row.addEventListener("click", toggleTag);
      row.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggleTag(); } });
      return row;
    });
    const filterTags = (): void => {
      const query = tagSearch.value.trim().toLocaleLowerCase();
      renderTags(knownTags.filter((tag) => !query || tag.toLocaleLowerCase().includes(query)));
    };
    tagSearch.addEventListener("input", filterTags);
    const newTagRow = tagPanel.createDiv({ cls: "cp-metadata-picker-create" });
    const newTag = newTagRow.createEl("input", { attr: { placeholder: "New tag", "aria-label": "New tag" } });
    const addTag = newTagRow.createEl("button", { text: "Add", attr: { type: "button" } });
    const createTag = (): void => {
      const tag = newTag.value.trim().replace(/^#/, "");
      if (!tag) return;
      if (!tagStates.has(tag)) { knownTags.push(tag); knownTags.sort((a, b) => a.localeCompare(b)); }
      tagStates.set(tag, "all"); touchedTags.add(tag); newTag.value = ""; tagSearch.value = "";
      updateTagSummary(); filterTags();
    };
    addTag.addEventListener("click", createTag);
    newTag.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); createTag(); } });
    updateTagSummary(); filterTags();

    const labelSection = this.contentEl.createDiv({ cls: "cp-metadata-picker-section" });
    labelSection.createEl("h3", { text: "Label" });
    const currentLabels = new Set(items.map((item) => item.label));
    let selectedLabel = currentLabels.size === 1 ? items[0].label : "__keep__";
    let labelTouched = false;
    const labelPicker = labelSection.createDiv({ cls: "cp-metadata-picker" });
    const labelSummary = labelPicker.createEl("button", { cls: "cp-metadata-picker-summary", attr: { type: "button", "aria-haspopup": "listbox", "aria-expanded": "false" } });
    const labelPanel = labelPicker.createDiv({ cls: "cp-metadata-picker-panel" });
    labelPanel.hidden = true;
    const labelSearch = labelPanel.createEl("input", { cls: "cp-metadata-picker-search", attr: { type: "search", placeholder: "Search labels", "aria-label": "Search labels" } });
    const labelListHost = labelPanel.createDiv({ cls: "cp-metadata-picker-list" });
    const sharedColors = new Set(items.map((item) => item.labelColor ?? ""));
    const labelCreate = labelPanel.createDiv({ cls: "cp-metadata-picker-create" });
    const newLabel = labelCreate.createEl("input", { attr: { placeholder: "New label", "aria-label": "New label" } });
    const labelColor = labelCreate.createEl("input", { cls: "cp-metadata-picker-color", attr: { type: "color", "aria-label": "Label color" } });
    labelColor.value = sharedColors.size === 1 && items[0].labelColor ? items[0].labelColor : "#8b5cf6";
    let colorTouched = false;
    labelColor.addEventListener("input", () => { colorTouched = true; });
    const addLabel = labelCreate.createEl("button", { text: "Add", attr: { type: "button" } });
    const updateLabelSummary = (): void => {
      labelSummary.empty();
      if (selectedLabel === "__keep__") labelSummary.createSpan({ cls: "cp-metadata-picker-placeholder", text: "Keep current labels" });
      else if (!selectedLabel) labelSummary.createSpan({ cls: "cp-metadata-picker-placeholder", text: "No label" });
      else {
        const swatch = labelSummary.createSpan({ cls: "cp-metadata-picker-swatch" });
        swatch.style.backgroundColor = labelColors.get(selectedLabel) ?? labelColor.value;
        labelSummary.createSpan({ cls: "cp-metadata-picker-value", text: selectedLabel });
      }
      labelSummary.createSpan({ cls: "cp-metadata-picker-chevron", text: "⌄" });
    };
    const labelChoices = (): string[] => [...(currentLabels.size > 1 ? ["__keep__"] : []), "", ...knownLabels];
    const renderLabels = this.virtualList<string>(labelListHost, (label) => {
      const row = createDiv({ cls: "cp-metadata-picker-row" });
      row.setAttribute("role", "option");
      row.tabIndex = 0;
      const radio = row.createEl("input", { attr: { type: "radio", tabindex: "-1" } });
      radio.checked = label === selectedLabel;
      if (label && label !== "__keep__") { const swatch = row.createSpan({ cls: "cp-metadata-picker-swatch" }); swatch.style.backgroundColor = labelColors.get(label) ?? "#8b5cf6"; }
      row.createSpan({ text: label === "__keep__" ? "Keep current labels" : label || "No label" });
      const chooseLabel = (): void => {
        selectedLabel = label; labelTouched = true;
        const knownColor = labelColors.get(label);
        if (knownColor) labelColor.value = knownColor;
        updateLabelSummary(); filterLabels(); closePanel(labelPanel, labelSummary);
      };
      row.addEventListener("click", chooseLabel);
      row.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); chooseLabel(); } });
      return row;
    });
    const filterLabels = (): void => {
      const query = labelSearch.value.trim().toLocaleLowerCase();
      renderLabels(labelChoices().filter((label) => label === "__keep__" || !query || label.toLocaleLowerCase().includes(query)));
    };
    labelSearch.addEventListener("input", filterLabels);
    const createLabel = (): void => {
      const label = newLabel.value.trim();
      if (!label) return;
      if (!knownLabels.includes(label)) { knownLabels.push(label); knownLabels.sort((a, b) => a.localeCompare(b)); }
      labelColors.set(label, labelColor.value); selectedLabel = label; labelTouched = true; colorTouched = true;
      newLabel.value = ""; labelSearch.value = ""; updateLabelSummary(); filterLabels(); closePanel(labelPanel, labelSummary);
    };
    addLabel.addEventListener("click", createLabel);
    newLabel.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); createLabel(); } });
    updateLabelSummary(); filterLabels();

    const closePanel = (panel: HTMLElement, summary: HTMLButtonElement): void => { panel.hidden = true; summary.setAttribute("aria-expanded", "false"); };
    const togglePanel = (panel: HTMLElement, summary: HTMLButtonElement, otherPanel: HTMLElement, otherSummary: HTMLButtonElement, search: HTMLInputElement): void => {
      const opening = panel.hidden;
      closePanel(otherPanel, otherSummary);
      panel.hidden = !opening; summary.setAttribute("aria-expanded", opening ? "true" : "false");
      if (opening) { search.focus(); search.select(); }
    };
    tagSummary.addEventListener("click", () => togglePanel(tagPanel, tagSummary, labelPanel, labelSummary, tagSearch));
    labelSummary.addEventListener("click", () => togglePanel(labelPanel, labelSummary, tagPanel, tagSummary, labelSearch));
    this.outsideClick = (event) => {
      const target = event.target as Node | null;
      if (target && !tagPicker.contains(target)) closePanel(tagPanel, tagSummary);
      if (target && !labelPicker.contains(target)) closePanel(labelPanel, labelSummary);
    };
    document.addEventListener("pointerdown", this.outsideClick);

    this.contentEl.createEl("h3", { text: "Caption" });
    const sharedCaptions = new Set(items.map((item) => item.caption));
    const caption = this.contentEl.createEl("textarea", {
      cls: "cp-tag-label-caption",
      text: sharedCaptions.size === 1 ? items[0].caption : "",
      attr: { placeholder: sharedCaptions.size === 1 ? "Short description" : "Keep current captions unless changed" }
    });
    let captionTouched = false;
    caption.addEventListener("input", () => { captionTouched = true; });
    const actions = this.contentEl.createDiv({ cls: "cp-modal-actions" });
    actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    actions.createEl("button", { text: "Apply", cls: "mod-cta" }).addEventListener("click", () => {
      for (const item of items) {
        const tags = new Set(item.tags);
        for (const tag of touchedTags) {
          if (tagStates.get(tag) === "all") tags.add(tag); else tags.delete(tag);
        }
        const label = selectedLabel === "__keep__" ? item.label : selectedLabel;
        const labelChanged = labelTouched && selectedLabel !== "__keep__";
        const labelColorValue = !label ? "" : colorTouched || labelChanged ? labelColor.value : item.labelColor ?? "";
        this.plugin.store.updateItem(item.id, { displayTitle: item.displayTitle, tags: [...tags], label, labelColor: labelColorValue, caption: captionTouched || sharedCaptions.size === 1 ? caption.value.trim() : item.caption, ...(item.type === "card" ? { content: item.content ?? "" } : {}) });
      }
      this.close();
    });
  }

  onClose(): void {
    if (this.outsideClick) document.removeEventListener("pointerdown", this.outsideClick);
    this.outsideClick = null;
    this.contentEl.empty();
  }

  private virtualList<T>(host: HTMLElement, createRow: (value: T) => HTMLElement): (values: T[]) => void {
    const rowHeight = 36;
    const overscan = 4;
    const spacer = host.createDiv({ cls: "cp-virtual-list-spacer" });
    let values: T[] = [];
    const render = (): void => {
      const viewportHeight = host.clientHeight || 216;
      const start = Math.max(0, Math.floor(host.scrollTop / rowHeight) - overscan);
      const end = Math.min(values.length, Math.ceil((host.scrollTop + viewportHeight) / rowHeight) + overscan);
      spacer.empty(); spacer.style.height = `${values.length * rowHeight}px`;
      for (let index = start; index < end; index += 1) {
        const row = createRow(values[index]);
        row.style.position = "absolute"; row.style.top = `${index * rowHeight}px`; row.style.height = `${rowHeight}px`;
        spacer.appendChild(row);
      }
    };
    host.addEventListener("scroll", render);
    return (nextValues) => { values = nextValues; host.scrollTop = 0; render(); };
  }
}

export class CardToMarkdownModal extends Modal {
  constructor(app: App, private readonly initialName: string, private readonly initialFolder: string, private readonly onConvert: (fileName: string, folder: string) => Promise<boolean>) { super(app); }

  onOpen(): void {
    this.contentEl.addClass("canvas-palette", "cp-card-to-markdown-modal");
    this.contentEl.createEl("h2", { text: "Convert Card to shared Markdown" });
    this.contentEl.createEl("p", { text: "Create one real Markdown file in the Vault. This Palette Card and every linked Canvas Card will both become Markdown references to that same file." });
    this.contentEl.createEl("label", { text: "File name" });
    const fileName = this.contentEl.createEl("input", { value: this.initialName, attr: { placeholder: "Card title.md" } });
    this.contentEl.createEl("label", { text: "Folder" });
    const folder = this.contentEl.createEl("input", { value: this.initialFolder, attr: { placeholder: "Vault root" } });
    const actions = this.contentEl.createDiv({ cls: "cp-modal-actions" });
    actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    const convert = actions.createEl("button", { text: "Convert", cls: "mod-cta" });
    convert.addEventListener("click", async () => {
      convert.disabled = true;
      try { if (await this.onConvert(fileName.value, folder.value)) this.close(); }
      finally { convert.disabled = false; }
    });
    window.requestAnimationFrame(() => { fileName.focus(); fileName.select(); });
  }

  onClose(): void { this.contentEl.empty(); }
}

export class MoveItemsModal extends Modal {
  private query = "";

  constructor(app: App, private readonly workspaceName: string, private readonly collections: Collection[], private readonly count: number, private readonly onMove: (collectionId: string | null) => void) { super(app); }

  onOpen(): void {
    this.contentEl.addClass("canvas-palette", "cp-move-items-modal");
    this.contentEl.createEl("h2", { text: this.count === 1 ? "Move to…" : `Move ${this.count} items to…` });
    const search = this.contentEl.createEl("input", { cls: "cp-move-items-search", attr: { type: "search", placeholder: "Search collections…", "aria-label": "Search collections" } });
    const list = this.contentEl.createDiv({ cls: "cp-move-items-list" });
    const paths = this.collectionPaths();
    const render = (): void => {
      list.empty();
      const needle = this.query.trim().toLocaleLowerCase();
      const destinations = [{ id: null, name: `${this.workspaceName} / Workspace root`, depth: 0 }, ...paths]
        .filter((destination) => !needle || destination.name.toLocaleLowerCase().includes(needle));
      for (const destination of destinations) {
        const row = list.createEl("button", { cls: "cp-move-items-row", attr: { type: "button" } });
        row.style.setProperty("--cp-depth", String(destination.depth));
        row.createSpan({ cls: "cp-move-items-row__icon", text: destination.id ? "▸" : "⌂" });
        row.createSpan({ cls: "cp-move-items-row__name", text: destination.name });
        row.addEventListener("click", () => { this.onMove(destination.id); this.close(); });
      }
      if (destinations.length === 0) list.createDiv({ cls: "cp-empty", text: "No matching collections." });
    };
    search.addEventListener("input", () => { this.query = search.value; render(); });
    render();
    window.requestAnimationFrame(() => search.focus());
  }

  onClose(): void { this.contentEl.empty(); }

  private collectionPaths(): Array<{ id: string; name: string; depth: number }> {
    const byParent = new Map<string | null, Collection[]>();
    for (const collection of this.collections) byParent.set(collection.parentId, [...(byParent.get(collection.parentId) ?? []), collection]);
    const rows: Array<{ id: string; name: string; depth: number }> = [];
    const walk = (parentId: string | null, parents: string[], depth: number): void => {
      for (const collection of byParent.get(parentId) ?? []) {
        const path = [...parents, collection.name];
        rows.push({ id: collection.id, name: path.join(" / "), depth });
        walk(collection.id, path, depth + 1);
      }
    };
    walk(null, [], 0);
    return rows;
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
    if (this.plugin.store.numberedCanvasLinks(item).length > 0) actions.createEl("button", { text: "Locate on Canvas" }).addEventListener("click", () => void this.plugin.locateItemOnCanvas(item));
    if (item.type === "link" && /^https?:\/\//i.test(item.webLink?.url ?? "")) actions.createEl("button", { text: "Open web link" }).addEventListener("click", () => this.plugin.openWebLink(item));
    else if (item.origin.filePath) actions.createEl("button", { text: "Open source file" }).addEventListener("click", () => void this.plugin.openOriginal(item));
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
    const grouped = new Map<string, number[]>();
    for (const link of this.plugin.store.numberedCanvasLinks(item)) grouped.set(link.canvasPath, [...(grouped.get(link.canvasPath) ?? []), link.number]);
    const paths = [...grouped.keys()];
    this.contentEl.createEl("h3", { text: "Linked canvases" });
    if (paths.length === 0) { this.contentEl.createDiv({ cls: "cp-empty cp-item-editor__empty", text: "Not linked to a Canvas yet." }); return; }
    const list = this.contentEl.createDiv({ cls: "cp-canvas-link-list" });
    for (const path of paths) list.createDiv({ cls: "cp-canvas-link", text: `${path} · 링크 ${(grouped.get(path) ?? []).join(", ")}` });
  }
}
