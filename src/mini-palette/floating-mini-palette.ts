import { Menu, Notice, setIcon } from "obsidian";
import type CanvasPalettePlugin from "../main";
import type { PaletteItem, PaletteItemType } from "../core/types";
import { TagLabelModal } from "../ui/modal";
import { makeHorizontalDivider } from "../ui/resizable";
import { iconButton, renderItem, workspaceSelect } from "../ui/render";

type TypeFilter = "all" | PaletteItemType;

export class FloatingMiniPalette {
  private host?: HTMLElement;
  private panel?: HTMLElement;
  private unsubscribe?: () => void;
  private search = "";
  private typeFilter: TypeFilter = "all";
  private tagFilter = "";
  private labelFilter = "";
  private inspectorItemId: string | null = null;
  private hoverItemId: string | null = null;
  private detachDrop?: () => void;

  constructor(private readonly plugin: CanvasPalettePlugin) {}

  mount(): void {
    const canvas = this.plugin.canvas.activeContainer();
    if (!canvas) return;
    this.attach(canvas);
    if (this.plugin.store.data.uiState.miniPalette.isOpen) this.render();
  }

  open(): void {
    const canvas = this.plugin.canvas.activeContainer();
    if (!canvas) { new Notice("Open a Canvas to use Mini Palette."); return; }
    this.attach(canvas); this.plugin.store.data.uiState.miniPalette.isOpen = true; this.plugin.store.changed(); this.render();
  }

  close(): void { this.plugin.store.data.uiState.miniPalette.isOpen = false; this.plugin.store.changed(); this.destroyPanel(); }
  refresh(): void { if (this.panel) this.render(); }
  destroy(): void { this.destroyPanel(); this.host?.remove(); this.host = undefined; this.unsubscribe?.(); this.unsubscribe = undefined; this.detachDrop?.(); this.detachDrop = undefined; }

  private attach(canvas: HTMLElement): void {
    if (this.host?.parentElement === canvas) return;
    this.destroy();
    canvas.addClass("cp-canvas-host");
    this.host = canvas.createDiv({ cls: "cp-mini-host" });
    const trigger = this.host.createDiv({ cls: "cp-mini-trigger", attr: { "aria-label": "Open Mini Palette" } });
    setIcon(trigger, "panels-top-left"); trigger.createSpan({ text: "Mini Palette" });
    trigger.addEventListener("mouseenter", () => this.open()); trigger.addEventListener("click", () => this.open());
    this.unsubscribe = this.plugin.store.subscribe(() => this.refresh());
    const onDragOver = (event: DragEvent) => { if (event.dataTransfer?.types.includes("application/x-canvas-palette-item")) { event.preventDefault(); event.stopPropagation(); if (event.dataTransfer) event.dataTransfer.dropEffect = "copy"; } };
    const onDrop = (event: DragEvent) => { const id = event.dataTransfer?.getData("application/x-canvas-palette-item"); if (!id) return; event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); const item = this.plugin.store.data.items[id]; if (item) void this.plugin.canvas.restoreItem(item, event.clientX, event.clientY); };
    canvas.addEventListener("dragover", onDragOver, true); canvas.addEventListener("drop", onDrop, true);
    this.detachDrop = () => { canvas.removeEventListener("dragover", onDragOver, true); canvas.removeEventListener("drop", onDrop, true); canvas.removeClass("cp-canvas-host"); };
  }

  private destroyPanel(): void { this.panel?.remove(); this.panel = undefined; this.inspectorItemId = null; this.hoverItemId = null; }

  private render(): void {
    if (!this.host || !this.plugin.store.data.uiState.miniPalette.isOpen) return;
    this.panel?.remove();
    const state = this.plugin.store.data.uiState.miniPalette;
    const panel = this.host.createDiv({ cls: `canvas-palette cp-mini-float cp-theme-${this.plugin.store.data.settings.theme}` });
    this.panel = panel;
    panel.style.left = `${state.position.x}px`; panel.style.top = `${state.position.y}px`; panel.style.width = `${state.size.width}px`; panel.style.height = `${state.size.height}px`;
    panel.style.setProperty("--cp-left-pane-width", `${state.leftPaneWidth}px`); panel.style.setProperty("--cp-right-pane-width", `${state.rightPaneWidth}px`);
    this.applyAccent(panel);
    const header = panel.createDiv({ cls: "cp-mini-float__header" });
    const handle = header.createDiv({ cls: "cp-window-handle" }); setIcon(handle, "grip-vertical"); handle.createSpan({ text: "Mini Palette" }); this.makeDraggable(handle, panel);
    const tabs = header.createDiv({ cls: "cp-tabs" }); this.tabButton(tabs, "collect", `Collect (${this.plugin.store.data.pendingItemIds.length})`); this.tabButton(tabs, "storage", `Storage (${this.plugin.store.allItems().length})`);
    const actions = header.createDiv({ cls: "cp-window-actions" });
    iconButton(actions, "settings", "Canvas Palette settings", () => this.plugin.openSettings());
    iconButton(actions, "pin", "Pin Mini Palette", () => new Notice("Mini Palette position is saved for this session."));
    iconButton(actions, "x", "Close Mini Palette", () => this.close());
    if (state.tab === "collect") this.renderCollect(panel); else this.renderStorage(panel);
    const resize = panel.createDiv({ cls: "cp-window-resize" }); this.makeResizable(resize, panel);
    if (this.inspectorItemId) this.renderInspector();
  }

  private tabButton(parent: HTMLElement, tab: "collect" | "storage", label: string): void {
    const button = parent.createEl("button", { text: label, cls: this.plugin.store.data.uiState.miniPalette.tab === tab ? "is-active" : "" });
    button.addEventListener("click", () => { this.plugin.store.data.uiState.miniPalette.tab = tab; this.plugin.store.changed(); });
  }

  private renderCollect(panel: HTMLElement): void {
    const body = panel.createDiv({ cls: "cp-collect-screen" });
    const search = body.createEl("input", { cls: "cp-search", attr: { type: "search", placeholder: "Search pending items…" }, value: this.search }); search.addEventListener("input", () => { this.search = search.value; this.render(); });
    const summary = body.createDiv({ cls: "cp-collect-summary" }); summary.createSpan({ text: `Pending ${this.plugin.store.data.pendingItemIds.length}` });
    const all = summary.createEl("button", { text: "Select all" }); all.addEventListener("click", () => { this.plugin.store.data.uiState.miniPalette.selectedItemIds = this.plugin.store.data.pendingItemIds.slice(); this.plugin.store.changed(); });
    const list = body.createDiv({ cls: "cp-pending-list" });
    for (const item of this.filtered(this.plugin.store.data.pendingItemIds.map((id) => this.plugin.store.data.items[id]).filter((item): item is PaletteItem => Boolean(item)))) this.renderPendingRow(list, item);
    if (list.childElementCount === 0) list.createDiv({ cls: "cp-empty", text: "Canvas scraps will wait here for review." });
    const bottom = panel.createDiv({ cls: "cp-bottom cp-bottom--float" });
    const settings = iconButton(bottom, "settings-2", "Settings", () => this.plugin.openSettings());
    settings.addClass("cp-bottom__start");
    workspaceSelect(this.plugin, bottom, this.plugin.store.data.uiState.activeWorkspaceId, () => undefined);
    const importButton = bottom.createEl("button", { cls: "mod-cta", text: "Import to workspace" }); importButton.disabled = this.selectedIds().length === 0;
    importButton.addEventListener("click", () => { const select = bottom.querySelector("select"); if (select) this.plugin.store.importPending(select.value, this.selectedIds()); this.plugin.store.data.uiState.miniPalette.selectedItemIds = []; this.inspectorItemId = null; });
  }

  private renderPendingRow(parent: HTMLElement, item: PaletteItem): void {
    const selected = this.selectedIds().includes(item.id);
    const row = parent.createDiv({ cls: `cp-pending-row cp-pending-row--${item.type}${selected ? " is-selected" : ""}` });
    row.createSpan({ cls: "cp-type-marker", text: item.type.toUpperCase() });
    const text = row.createDiv({ cls: "cp-pending-row__text" }); text.createEl("strong", { text: item.displayTitle }); text.createEl("small", { text: (item.content ?? item.origin.filePath ?? `${item.group?.nodes.length ?? 0} nodes`).slice(0, 80) });
    row.createSpan({ cls: "cp-pending-row__time", text: new Date(item.modifiedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) });
    iconButton(row, "more-horizontal", "Item actions", () => this.itemMenu(item));
    row.addEventListener("click", (event) => { if (event.target instanceof HTMLButtonElement) return; this.selectPending(item.id, event.ctrlKey || event.metaKey); this.inspectorItemId = item.id; this.render(); });
  }

  private renderStorage(panel: HTMLElement): void {
    const state = this.plugin.store.data.uiState.miniPalette;
    const shell = panel.createDiv({ cls: `cp-storage-shell${state.leftPaneOpen ? " has-left" : ""}${state.rightPaneOpen ? " has-right" : ""}` });
    if (state.leftPaneOpen) { const left = shell.createDiv({ cls: "cp-storage-left" }); this.renderLeftPane(left); const divider = shell.createDiv({ cls: "cp-divider cp-divider--vertical" }); makeHorizontalDivider(divider, (x) => { const rect = panel.getBoundingClientRect(); state.leftPaneWidth = Math.max(190, Math.min(390, x - rect.left)); this.plugin.store.changed(); }); }
    const main = shell.createDiv({ cls: "cp-storage-main" }); this.renderStorageMain(main);
    if (state.rightPaneOpen) { const divider = shell.createDiv({ cls: "cp-divider cp-divider--vertical" }); makeHorizontalDivider(divider, (x) => { const rect = panel.getBoundingClientRect(); state.rightPaneWidth = Math.max(240, Math.min(460, rect.right - x)); this.plugin.store.changed(); }); const right = shell.createDiv({ cls: "cp-storage-right" }); this.renderRightPane(right); }
    const bottom = panel.createDiv({ cls: "cp-bottom cp-bottom--float" }); bottom.createSpan({ text: `Total ${this.storageItems().length} · Selected ${this.selectedIds().length}` });
    const exportButton = bottom.createEl("button", { text: "Export" }); exportButton.addEventListener("click", () => void this.plugin.exportActiveWorkspace());
    const tagEdit = bottom.createEl("button", { text: "Edit metadata" }); tagEdit.addEventListener("click", () => this.editSelectedMetadata());
    const remove = bottom.createEl("button", { text: "Delete" }); remove.addEventListener("click", () => { this.plugin.store.removeItems(this.selectedIds()); this.plugin.store.data.uiState.miniPalette.selectedItemIds = []; });
    bottom.createEl("button", { text: "More", attr: { disabled: "true", title: "Reserved for a user-defined action" } });
  }

  private renderLeftPane(parent: HTMLElement): void {
    const head = parent.createDiv({ cls: "cp-pane-heading" }); head.createEl("h4", { text: "Control panel" }); iconButton(head, "panel-left-close", "Close left pane", () => { this.plugin.store.data.uiState.miniPalette.leftPaneOpen = false; this.plugin.store.changed(); });
    parent.createEl("label", { text: "Workspace" }); const all = parent.createEl("select", { cls: "dropdown" }); all.createEl("option", { value: "all", text: "All Workspaces" }); for (const workspace of Object.values(this.plugin.store.data.workspaces)) all.createEl("option", { value: workspace.id, text: workspace.name }); all.value = this.plugin.store.data.uiState.activeWorkspaceId ?? "all"; all.addEventListener("change", () => { this.plugin.store.data.uiState.activeWorkspaceId = all.value === "all" ? null : all.value; this.plugin.store.changed(); });
    parent.createEl("label", { text: "Search" }); const search = parent.createEl("input", { cls: "cp-search", attr: { type: "search", placeholder: "Title, tag, caption" }, value: this.search }); search.addEventListener("input", () => { this.search = search.value; this.render(); });
    parent.createEl("label", { text: "Sort" }); const sort = parent.createEl("select", { cls: "dropdown" }); for (const [value, label] of [["modified-desc", "Modified (newest)"], ["modified-asc", "Modified (oldest)"], ["title-asc", "Title (A-Z)"], ["title-desc", "Title (Z-A)"]] as const) sort.createEl("option", { value, text: label }); sort.value = this.plugin.store.data.uiState.miniPalette.sort; sort.addEventListener("change", () => { this.plugin.store.data.uiState.miniPalette.sort = sort.value as typeof this.plugin.store.data.uiState.miniPalette.sort; this.plugin.store.changed(); });
    parent.createEl("label", { text: "View" }); const view = parent.createDiv({ cls: "cp-view-switch" }); for (const mode of ["grid", "list"] as const) { const button = view.createEl("button", { text: mode === "grid" ? "Grid" : "List", cls: this.plugin.store.data.uiState.miniPalette.viewMode === mode ? "is-active" : "" }); button.addEventListener("click", () => { this.plugin.store.data.uiState.miniPalette.viewMode = mode; this.plugin.store.changed(); }); }
    parent.createEl("label", { text: "Columns" }); const columns = parent.createEl("input", { attr: { type: "range", min: "2", max: "6", value: String(this.plugin.store.data.settings.columns) } }); columns.addEventListener("input", () => { this.plugin.store.data.settings.columns = Number(columns.value); this.plugin.store.changed(); });
    parent.createEl("label", { text: "Filter type" }); const types = parent.createDiv({ cls: "cp-filter-chips" }); for (const type of ["all", "card", "markdown", "image", "group"] as const) { const button = types.createEl("button", { text: type === "all" ? "All" : type, cls: this.typeFilter === type ? "is-active" : "" }); button.addEventListener("click", () => { this.typeFilter = type; this.render(); }); }
    parent.createEl("label", { text: "Tag filter" }); const tag = parent.createEl("input", { attr: { placeholder: "#tag" }, value: this.tagFilter }); tag.addEventListener("input", () => { this.tagFilter = tag.value.replace(/^#/, ""); this.render(); });
    parent.createEl("label", { text: "Label filter" }); const label = parent.createEl("input", { attr: { placeholder: "Label" }, value: this.labelFilter }); label.addEventListener("input", () => { this.labelFilter = label.value; this.render(); });
  }

  private renderStorageMain(parent: HTMLElement): void {
    const heading = parent.createDiv({ cls: "cp-storage-heading" });
    if (!this.plugin.store.data.uiState.miniPalette.leftPaneOpen) iconButton(heading, "panel-left-open", "Open left pane", () => { this.plugin.store.data.uiState.miniPalette.leftPaneOpen = true; this.plugin.store.changed(); });
    heading.createSpan({ text: "Assets" }); if (!this.plugin.store.data.uiState.miniPalette.rightPaneOpen) iconButton(heading, "panel-right-open", "Open preview pane", () => { this.plugin.store.data.uiState.miniPalette.rightPaneOpen = true; this.plugin.store.changed(); });
    const grid = parent.createDiv({ cls: `cp-asset-grid cp-asset-grid--${this.plugin.store.data.uiState.miniPalette.viewMode}` }); grid.style.setProperty("--cp-columns", String(this.plugin.store.data.settings.columns));
    for (const item of this.storageItems()) {
      const card = renderItem(grid, item, { selected: this.selectedIds().includes(item.id), draggable: true, onSelect: (event) => this.selectStorage(item.id, event.ctrlKey || event.metaKey), onOpen: () => void this.plugin.openItemEditor(item.id), onLocate: () => void this.plugin.locateItemOnCanvas(item), onContextMenu: (event) => { event.preventDefault(); this.itemMenu(item); } });
      const body = card.querySelector<HTMLElement>(".cp-item__body"); if (body) void this.plugin.preview.render(body, item, true);
      card.addEventListener("mousemove", (event) => { if (event.ctrlKey && this.hoverItemId !== item.id) { this.hoverItemId = item.id; this.render(); } });
      card.addEventListener("mouseleave", () => { if (this.hoverItemId === item.id) { this.hoverItemId = null; this.render(); } });
    }
    if (grid.childElementCount === 0) grid.createDiv({ cls: "cp-empty", text: "No items match these filters." });
  }

  private renderRightPane(parent: HTMLElement): void {
    const head = parent.createDiv({ cls: "cp-pane-heading" }); head.createEl("h4", { text: this.hoverItemId ? "Temporary preview" : "Preview" }); iconButton(head, "panel-right-close", "Close preview pane", () => { this.plugin.store.data.uiState.miniPalette.rightPaneOpen = false; this.plugin.store.changed(); });
    const item = this.plugin.store.data.items[this.hoverItemId ?? this.plugin.store.data.uiState.selectedItemId ?? ""];
    if (!item) { parent.createDiv({ cls: "cp-empty", text: "Select an item to preview it." }); return; }
    parent.createEl("h3", { text: item.displayTitle }); const preview = parent.createDiv({ cls: "cp-preview" }); void this.plugin.preview.render(preview, item);
    parent.createEl("h4", { text: "Details" }); const details = [["Original Workspace", this.workspaceName(item.origin.workspaceId)], ["Created", new Date(item.createdAt).toLocaleString()], ["Modified", new Date(item.modifiedAt).toLocaleString()], ["Type", item.type], ["Original Path", item.origin.filePath ?? item.origin.canvasPath ?? "-"]];
    for (const [label, value] of details) { const row = parent.createDiv({ cls: "cp-detail" }); row.createSpan({ text: label }); row.createEl("strong", { text: value }); }
    const actions = parent.createDiv({ cls: "cp-preview-actions" }); const copy = actions.createEl("button", { text: "Copy" }); copy.addEventListener("click", () => void navigator.clipboard?.writeText(item.content ?? item.origin.filePath ?? item.displayTitle)); const original = actions.createEl("button", { text: "Open original" }); original.addEventListener("click", () => void this.plugin.openOriginal(item));
  }

  private renderInspector(): void {
    const item = this.plugin.store.data.items[this.inspectorItemId ?? ""]; if (!item || !this.panel) return;
    const drawer = this.panel.createDiv({ cls: "cp-inspector-drawer" }); const head = drawer.createDiv({ cls: "cp-pane-heading" }); head.createEl("h3", { text: "Selected item settings" }); iconButton(head, "x", "Close inspector", () => { this.inspectorItemId = null; this.render(); });
    const title = this.input(drawer, "Title", item.displayTitle); const tags = this.input(drawer, "Tag", item.tags.join(", "), "tag1, tag2"); const label = this.input(drawer, "Label", item.label, "e.g. Idea, In progress"); drawer.createEl("label", { text: "Label color" }); const labelColor = drawer.createEl("input", { attr: { type: "color", "aria-label": "Label color" } }); labelColor.value = item.labelColor || "#8b5cf6"; const caption = this.textarea(drawer, "Caption", item.caption); drawer.createEl("h4", { text: "Original preview" }); const preview = drawer.createDiv({ cls: "cp-preview cp-preview--inspector" }); void this.plugin.preview.render(preview, item, true);
    const actions = drawer.createDiv({ cls: "cp-inspector-actions" }); const remove = actions.createEl("button", { text: "Delete", cls: "mod-warning" }); remove.addEventListener("click", () => { this.plugin.store.removeItems([item.id]); this.inspectorItemId = null; }); const close = actions.createEl("button", { text: "Close" }); close.addEventListener("click", () => { this.inspectorItemId = null; this.render(); }); const save = actions.createEl("button", { text: "Save", cls: "mod-cta" }); save.addEventListener("click", () => { const labelValue = label.value.trim(); this.plugin.store.updateItem(item.id, { displayTitle: title.value, tags: tags.value.split(",").map((value) => value.trim().replace(/^#/, "")).filter(Boolean), label: labelValue, labelColor: labelValue ? labelColor.value : "", caption: caption.value }); this.inspectorItemId = null; });
  }

  private input(parent: HTMLElement, label: string, value: string, placeholder = ""): HTMLInputElement { parent.createEl("label", { text: label }); return parent.createEl("input", { attr: { placeholder }, value }); }
  private textarea(parent: HTMLElement, label: string, value: string): HTMLTextAreaElement { parent.createEl("label", { text: label }); return parent.createEl("textarea", { text: value }); }
  private selectedIds(): string[] { return this.plugin.store.data.uiState.miniPalette.selectedItemIds; }
  private selectPending(id: string, multiple: boolean): void { const ids = this.selectedIds(); this.plugin.store.data.uiState.miniPalette.selectedItemIds = multiple ? (ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]) : [id]; this.plugin.selectItem(id); }
  private selectStorage(id: string, multiple: boolean): void { const ids = this.selectedIds(); this.plugin.store.data.uiState.miniPalette.selectedItemIds = multiple ? (ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]) : [id]; this.plugin.selectItem(id); }
  private storageItems(): PaletteItem[] { const active = this.plugin.store.data.uiState.activeWorkspaceId; const candidates = active ? this.plugin.store.itemsForWorkspace(active) : this.plugin.store.allItems().filter((item) => !this.plugin.store.data.pendingItemIds.includes(item.id)); return this.sort(this.filtered(candidates)); }
  private filtered(items: PaletteItem[]): PaletteItem[] { return this.plugin.search.filter(items, this.search).filter((item) => (this.typeFilter === "all" || item.type === this.typeFilter) && (!this.tagFilter || item.tags.some((tag) => tag.toLocaleLowerCase().includes(this.tagFilter.toLocaleLowerCase()))) && (!this.labelFilter || item.label.toLocaleLowerCase().includes(this.labelFilter.toLocaleLowerCase()))); }
  private sort(items: PaletteItem[]): PaletteItem[] { const mode = this.plugin.store.data.uiState.miniPalette.sort; return [...items].sort((a, b) => mode === "modified-desc" ? b.modifiedAt - a.modifiedAt : mode === "modified-asc" ? a.modifiedAt - b.modifiedAt : mode === "title-desc" ? b.displayTitle.localeCompare(a.displayTitle) : a.displayTitle.localeCompare(b.displayTitle)); }
  private workspaceName(id?: string): string { return id ? this.plugin.store.data.workspaces[id]?.name ?? "Unknown workspace" : "Pending"; }
  private itemMenu(item: PaletteItem): void { const menu = new Menu(); menu.addItem((entry) => entry.setTitle("Edit metadata").setIcon("tags").onClick(() => new TagLabelModal(this.plugin.app, this.plugin, [item.id]).open())); menu.addItem((entry) => entry.setTitle("Open original").setIcon("external-link").onClick(() => void this.plugin.openOriginal(item))); if (item.origin.canvasPath && item.origin.canvasNodeId) menu.addItem((entry) => entry.setTitle("Locate on Canvas").setIcon("locate-fixed").onClick(() => void this.plugin.locateItemOnCanvas(item))); menu.addItem((entry) => entry.setTitle("Delete").setIcon("trash").onClick(() => this.plugin.store.removeItems([item.id]))); menu.showAtPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }); }
  private editSelectedMetadata(): void { const ids = this.selectedIds().filter((id) => this.plugin.store.data.items[id]); if (ids.length === 0) { new Notice("Select items first."); return; } new TagLabelModal(this.plugin.app, this.plugin, ids).open(); }
  private applyAccent(panel: HTMLElement): void { const settings = this.plugin.store.data.settings; if (settings.accentMode === "custom") panel.style.setProperty("--cp-accent", settings.accentColor); }
  private makeDraggable(handle: HTMLElement, panel: HTMLElement): void { handle.addEventListener("pointerdown", (event) => { if (event.target instanceof HTMLButtonElement) return; event.preventDefault(); handle.setPointerCapture(event.pointerId); const state = this.plugin.store.data.uiState.miniPalette; const start = { x: event.clientX, y: event.clientY, left: state.position.x, top: state.position.y }; const move = (pointer: PointerEvent) => { state.position = { x: Math.max(0, start.left + pointer.clientX - start.x), y: Math.max(0, start.top + pointer.clientY - start.y) }; panel.style.left = `${state.position.x}px`; panel.style.top = `${state.position.y}px`; }; const end = () => { handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", end); handle.removeEventListener("pointercancel", end); this.plugin.store.changed(); }; handle.addEventListener("pointermove", move); handle.addEventListener("pointerup", end); handle.addEventListener("pointercancel", end); }); }
  private makeResizable(handle: HTMLElement, panel: HTMLElement): void { handle.addEventListener("pointerdown", (event) => { event.preventDefault(); handle.setPointerCapture(event.pointerId); const state = this.plugin.store.data.uiState.miniPalette; const start = { x: event.clientX, y: event.clientY, width: state.size.width, height: state.size.height }; const move = (pointer: PointerEvent) => { state.size = { width: Math.max(680, start.width + pointer.clientX - start.x), height: Math.max(420, start.height + pointer.clientY - start.y) }; panel.style.width = `${state.size.width}px`; panel.style.height = `${state.size.height}px`; }; const end = () => { handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", end); handle.removeEventListener("pointercancel", end); this.plugin.store.changed(); }; handle.addEventListener("pointermove", move); handle.addEventListener("pointerup", end); handle.addEventListener("pointercancel", end); }); }
}
