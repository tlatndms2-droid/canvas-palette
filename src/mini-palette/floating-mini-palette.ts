import { Menu, Notice, setIcon } from "obsidian";
import type CanvasPalettePlugin from "../main";
import type { PaletteItem, PaletteItemType } from "../core/types";
import { ConfirmDeleteModal, ConfirmMiniStorageRemovalModal, TagLabelModal } from "../ui/modal";
import { makeHorizontalDivider } from "../ui/resizable";
import { iconButton, renderItem, supportsFrontBack, workspaceSelect } from "../ui/render";
import { applyAssetDensity, assetDensityLabel, ASSET_DENSITY_MAX, ASSET_DENSITY_MIN, nextAssetDensity } from "../ui/asset-density";
import { attachedFlyoutPlacement, miniLayoutMode, type FlyoutSide, type MiniLayoutMode } from "../ui/responsive-layout";

type TypeFilter = "all" | PaletteItemType;

export class FloatingMiniPalette {
  private host?: HTMLElement;
  private panel?: HTMLElement;
  private unsubscribe?: () => void;
  private search = "";
  private typeFilter: TypeFilter = "all";
  private tagFilter = "";
  private labelFilter = "";
  private dateFilter: "all" | "today" | "week" | "month" = "all";
  private inspectorItemId: string | null = null;
  private hoverItemId: string | null = null;
  private rightPane?: HTMLElement;
  private detachDrop?: () => void;
  private suppressBlankClick = false;
  private layoutMode: MiniLayoutMode = "wide";
  private resizeObserver?: ResizeObserver;
  private openFlyout: "control" | "preview" | null = null;
  private flyoutSide: FlyoutSide = "right";
  private flyoutWidth = 320;
  private responsivePanelLeft: number | null = null;
  private flyoutCleanup?: () => void;
  private isResizing = false;
  private readonly scrollMemory: Record<string, number> = {};

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

  toggle(): void { if (this.plugin.store.data.uiState.miniPalette.isOpen) this.close(); else this.open(); }

  close(): void { this.plugin.store.data.uiState.miniPalette.isOpen = false; this.plugin.store.changed(); this.destroyPanel(); }
  refresh(): void { if (this.panel) this.render(); }
  destroy(): void { this.destroyPanel(); this.host?.remove(); this.host = undefined; this.unsubscribe?.(); this.unsubscribe = undefined; this.detachDrop?.(); this.detachDrop = undefined; }

  private attach(canvas: HTMLElement): void {
    const workspace = this.plugin.app.workspace.containerEl;
    if (this.host?.parentElement === workspace) return;
    this.destroy();
    this.host = workspace.createDiv({ cls: "cp-mini-host" });
    this.unsubscribe = this.plugin.store.subscribe(() => this.refresh());
    const onDragOver = (event: DragEvent) => { if (event.dataTransfer?.types.includes("application/x-canvas-palette-item")) { event.preventDefault(); event.stopPropagation(); if (event.dataTransfer) event.dataTransfer.dropEffect = "copy"; } };
    const onDrop = (event: DragEvent) => { const ids = this.dragIds(event.dataTransfer); if (ids.length === 0) return; event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); const items = ids.map((id) => this.plugin.store.data.items[id]).filter((item): item is PaletteItem => Boolean(item)); if (items.length > 0) void this.plugin.canvas.restoreItems(items, event.clientX, event.clientY); };
    canvas.addEventListener("dragover", onDragOver, true); canvas.addEventListener("drop", onDrop, true);
    this.detachDrop = () => { canvas.removeEventListener("dragover", onDragOver, true); canvas.removeEventListener("drop", onDrop, true); };
  }

  private destroyPanel(): void { this.resizeObserver?.disconnect(); this.resizeObserver = undefined; this.flyoutCleanup?.(); this.flyoutCleanup = undefined; this.panel?.remove(); this.panel = undefined; this.rightPane = undefined; this.inspectorItemId = null; this.hoverItemId = null; this.openFlyout = null; this.responsivePanelLeft = null; }

  private render(): void {
    if (!this.host || !this.plugin.store.data.uiState.miniPalette.isOpen) return;
    const viewState = this.captureViewState();
    this.resizeObserver?.disconnect(); this.resizeObserver = undefined;
    this.flyoutCleanup?.(); this.flyoutCleanup = undefined;
    this.panel?.remove();
    const state = this.plugin.store.data.uiState.miniPalette;
    const geometryChanged = this.clampGeometry();
    this.layoutMode = miniLayoutMode(state.size.width);
    const panel = this.host.createDiv({ cls: `canvas-palette cp-mini-float cp-mini-layout--${this.layoutMode} cp-theme-${this.plugin.store.data.settings.theme}` });
    this.panel = panel;
    panel.dataset.layoutMode = this.layoutMode;
    panel.style.left = `${this.responsivePanelLeft ?? state.position.x}px`; panel.style.top = `${state.position.y}px`; panel.style.width = `${state.size.width}px`; panel.style.height = `${state.size.height}px`;
    panel.style.setProperty("--cp-left-pane-width", `${state.leftPaneWidth}px`); panel.style.setProperty("--cp-right-pane-width", `${state.rightPaneWidth}px`);
    this.applyAccent(panel);
    const header = panel.createDiv({ cls: "cp-mini-float__header" });
    const handle = header.createDiv({ cls: "cp-window-handle" }); setIcon(handle, "grip-vertical"); handle.createSpan({ text: "Mini Palette" }); this.makeDraggable(header, panel);
    const tabs = header.createDiv({ cls: "cp-tabs", attr: { role: "tablist", "aria-label": "Mini Palette spaces" } }); this.tabButton(tabs, "collect", `Collect (${this.plugin.store.data.pendingItemIds.length})`); this.tabButton(tabs, "storage", `Storage (${this.storageCandidates().length})`);
    const actions = header.createDiv({ cls: "cp-window-actions" });
    iconButton(actions, "settings", "Canvas Palette settings", () => this.plugin.openSettings());
    iconButton(actions, "x", "Close Mini Palette", () => this.close());
    if (state.tab === "collect") this.renderCollect(panel); else this.renderStorage(panel);
    for (const direction of ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const) {
      const resize = panel.createDiv({ cls: `cp-window-resize cp-window-resize--${direction}` });
      this.makeResizable(resize, panel, direction);
    }
    if (state.tab === "collect" && this.inspectorItemId) this.renderInspector();
    this.observePanel(panel);
    this.restoreViewState(viewState);
    if (geometryChanged) window.setTimeout(() => this.plugin.store.changed(), 0);
  }

  private tabButton(parent: HTMLElement, tab: "collect" | "storage", label: string): void {
    const selected = this.plugin.store.data.uiState.miniPalette.tab === tab;
    const button = parent.createEl("button", { text: label, cls: selected ? "is-active" : "", attr: { role: "tab", id: `cp-mini-tab-${tab}`, "aria-selected": String(selected), "aria-controls": "cp-mini-content", tabindex: selected ? "0" : "-1" } });
    button.addEventListener("click", () => this.selectMiniTab(tab));
    button.addEventListener("keydown", (event) => {
      const tabs: Array<"collect" | "storage"> = ["collect", "storage"];
      const index = tabs.indexOf(tab);
      const next = event.key === "ArrowLeft" ? tabs[(index + 1) % tabs.length] : event.key === "ArrowRight" ? tabs[(index + 1) % tabs.length] : event.key === "Home" ? "collect" : event.key === "End" ? "storage" : event.key === "Enter" || event.key === " " ? tab : null;
      if (!next) return;
      event.preventDefault(); this.selectMiniTab(next);
    });
  }

  private selectMiniTab(tab: "collect" | "storage"): void {
    const state = this.plugin.store.data.uiState.miniPalette;
    if (state.tab === tab) return;
    state.tab = tab; this.inspectorItemId = null; if (tab === "storage") state.focusedItemId = null; this.plugin.store.changed();
    queueMicrotask(() => this.panel?.querySelector<HTMLElement>(`#cp-mini-tab-${tab}`)?.focus());
  }

  private renderCollect(panel: HTMLElement): void {
    const body = panel.createDiv({ cls: "cp-collect-screen", attr: { id: "cp-mini-content", role: "tabpanel", "aria-labelledby": "cp-mini-tab-collect" } });
    const search = body.createEl("input", { cls: "cp-search", attr: { type: "search", placeholder: "Search pending items…" }, value: this.search });
    const summary = body.createDiv({ cls: "cp-collect-summary" });
    const list = body.createDiv({ cls: "cp-pending-list cp-asset-grid" });
    const update = () => {
      list.empty(); summary.empty();
      const state = this.plugin.store.data.uiState.miniPalette;
      state.densityLevel = applyAssetDensity(list, state.densityLevel, "cp-asset-grid");
      state.viewMode = state.densityLevel === 0 ? "list" : "grid";
      const visible = this.collectItems();
      const selected = this.collectSelectedIds();
      summary.createSpan({ text: `Pending ${this.plugin.store.data.pendingItemIds.length} · Selected ${selected.length}` });
      const allVisibleSelected = visible.length > 0 && visible.every((item) => selected.includes(item.id));
      const all = summary.createEl("button", { text: allVisibleSelected ? "Clear selection" : "Select all results" });
      all.addEventListener("click", () => { this.setCollectSelectedIds(allVisibleSelected ? selected.filter((id) => !visible.some((item) => item.id === id)) : [...new Set([...selected, ...visible.map((item) => item.id)])]); this.plugin.store.changed(); });
      if (selected.length > 0) {
        const openSettings = summary.createEl("button", { text: "Open selected item settings" });
        openSettings.disabled = selected.length !== 1;
        openSettings.addEventListener("click", () => { if (selected.length === 1) this.openCollectInspector(selected[0]); });
        const multiEdit = summary.createEl("button", { text: "Multiple selection editing" });
        multiEdit.disabled = selected.length < 2;
        multiEdit.addEventListener("click", () => { if (selected.length > 1) new TagLabelModal(this.plugin.app, this.plugin, selected).open(); });
        const remove = summary.createEl("button", { text: "Delete selected", cls: "mod-warning" }); remove.addEventListener("click", () => this.confirmPendingDelete(selected));
      }
      for (const item of visible) this.renderPendingCard(list, item, visible.map((entry) => entry.id));
      if (list.childElementCount === 0) list.createDiv({ cls: "cp-empty", text: "Canvas scraps will wait here for review." });
    };
    search.addEventListener("input", () => { this.search = search.value; update(); });
    body.addEventListener("wheel", (event) => { if (!event.ctrlKey && !event.metaKey) return; event.preventDefault(); event.stopPropagation(); const state = this.plugin.store.data.uiState.miniPalette; state.densityLevel = nextAssetDensity(state.densityLevel, event.deltaY); state.viewMode = state.densityLevel === 0 ? "list" : "grid"; update(); this.plugin.store.changed(); }, { passive: false });
    update();
    const bottom = panel.createDiv({ cls: "cp-bottom cp-bottom--float" });
    const settings = iconButton(bottom, "settings-2", "Settings", () => this.plugin.openSettings());
    settings.addClass("cp-bottom__start");
    workspaceSelect(this.plugin, bottom, this.plugin.store.data.uiState.activeWorkspaceId, () => undefined);
    const importButton = bottom.createEl("button", { cls: "mod-cta", text: "Import to workspace" }); importButton.disabled = this.collectSelectedIds().length === 0;
    importButton.addEventListener("click", () => {
      const select = bottom.querySelector("select"); if (!select) return;
      this.plugin.confirmWorkspaceSave(select.value, () => {
        const result = this.plugin.store.importPending(select.value, this.collectSelectedIds(), this.plugin.isOtherCanvasRepresentativeWorkspace(select.value));
        if (result.rejected.length > 0) new Notice("Some items could not be imported because the selected Workspace is unavailable.");
        if (result.alreadySaved.length > 0) this.plugin.showAlreadySavedToWorkspace(select.value, result.imported.length, result.alreadySaved.length);
        else if (result.imported.length > 0) new Notice(`${result.imported.length} item${result.imported.length === 1 ? "" : "s"} imported.`);
        this.setCollectSelectedIds([...result.rejected, ...result.alreadySaved]); this.plugin.store.data.uiState.miniPalette.focusedItemId = null; this.inspectorItemId = null;
      });
    });
  }


  private renderStorage(panel: HTMLElement): void {
    const state = this.plugin.store.data.uiState.miniPalette;
    const showLeftPane = this.layoutMode === "wide" && state.leftPaneOpen;
    const showRightPane = (this.layoutMode === "wide" || this.layoutMode === "medium") && state.rightPaneOpen;
    const shell = panel.createDiv({ cls: `cp-storage-shell${showLeftPane ? " has-left" : ""}${showRightPane ? " has-right" : ""}`, attr: { id: "cp-mini-content", role: "tabpanel", "aria-labelledby": "cp-mini-tab-storage" } });
    if (showLeftPane) { const left = shell.createDiv({ cls: "cp-storage-left" }); this.renderLeftPane(left); const divider = shell.createDiv({ cls: "cp-divider cp-divider--vertical" }); makeHorizontalDivider(divider, (x) => { const rect = panel.getBoundingClientRect(); state.leftPaneWidth = Math.max(190, Math.min(390, x - rect.left)); panel.style.setProperty("--cp-left-pane-width", `${state.leftPaneWidth}px`); }, () => this.plugin.store.changed()); }
    const main = shell.createDiv({ cls: "cp-storage-main" }); this.renderStorageMain(main);
    if (showRightPane) { const divider = shell.createDiv({ cls: "cp-divider cp-divider--vertical" }); makeHorizontalDivider(divider, (x) => { const rect = panel.getBoundingClientRect(); state.rightPaneWidth = Math.max(240, Math.min(460, rect.right - x)); panel.style.setProperty("--cp-right-pane-width", `${state.rightPaneWidth}px`); }, () => this.plugin.store.changed()); const right = shell.createDiv({ cls: "cp-storage-right" }); this.rightPane = right; this.renderRightPane(right); }
    const visibleIds = new Set(this.storageItems().map((item) => item.id));
    const selected = this.storageSelectedIds();
    const hiddenCount = selected.filter((id) => !visibleIds.has(id)).length;
    const bottom = panel.createDiv({ cls: "cp-bottom cp-bottom--float" }); bottom.createSpan({ text: `Total ${this.storageItems().length} · Selected ${selected.length}${hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ""}` });
    const placeButton = bottom.createEl("button", { text: "Place on Canvas" }); placeButton.disabled = selected.length === 0; placeButton.addEventListener("click", () => void this.placeSelectedOnCanvas());
    if (this.layoutMode === "minimum") {
      const more = iconButton(bottom, "ellipsis", "More Mini Palette actions", () => {
        const menu = new Menu();
        menu.addItem((entry) => entry.setTitle("Edit metadata").setIcon("tags").onClick(() => this.editSelectedMetadata()));
        menu.addItem((entry) => entry.setTitle("Remove from Mini").setIcon("unlink").setDisabled(selected.length === 0).onClick(() => this.confirmMiniStorageRemoval(selected)));
        const rect = more.getBoundingClientRect(); menu.showAtPosition({ x: rect.right, y: rect.top });
      });
    } else {
      const tagEdit = bottom.createEl("button", { text: "Edit metadata" }); tagEdit.addEventListener("click", () => this.editSelectedMetadata());
      const remove = bottom.createEl("button", { text: "Remove from Mini" }); remove.disabled = selected.length === 0; remove.addEventListener("click", () => this.confirmMiniStorageRemoval(selected));
    }
    if (this.openFlyout) this.renderResponsiveFlyout(panel, this.openFlyout);
  }

  private renderLeftPane(parent: HTMLElement, close?: () => void): void {
    const head = parent.createDiv({ cls: "cp-pane-heading" }); head.createEl("h4", { text: "Control panel" }); iconButton(head, close ? "x" : "panel-left-close", close ? "Close control flyout" : "Close left pane", close ?? (() => { this.plugin.store.data.uiState.miniPalette.leftPaneOpen = false; this.plugin.store.changed(); }));
    parent.createEl("label", { text: "Search" }); const search = parent.createEl("input", { cls: "cp-search", attr: { type: "search", placeholder: "Title, tag, caption", "data-cp-focus": "mini-control-search" }, value: this.search }); search.addEventListener("input", () => { this.search = search.value; this.refreshStorageItems(); });
    parent.createEl("label", { text: "Sort" }); const sort = parent.createEl("select", { cls: "dropdown" }); for (const [value, label] of [["modified-desc", "Modified (newest)"], ["modified-asc", "Modified (oldest)"], ["title-asc", "Title (A-Z)"], ["title-desc", "Title (Z-A)"]] as const) sort.createEl("option", { value, text: label }); sort.value = this.plugin.store.data.uiState.miniPalette.sort; sort.addEventListener("change", () => { this.plugin.store.data.uiState.miniPalette.sort = sort.value as typeof this.plugin.store.data.uiState.miniPalette.sort; this.plugin.store.changed(); });
    this.renderDensityControl(parent, "Mini Palette item size");
    parent.createEl("label", { text: "Date" }); const date = parent.createEl("select", { cls: "dropdown" }); for (const [value, text] of [["all", "All dates"], ["today", "Today"], ["week", "Last 7 days"], ["month", "Last 30 days"]] as const) date.createEl("option", { value, text }); date.value = this.dateFilter; date.addEventListener("change", () => { this.dateFilter = date.value as typeof this.dateFilter; this.refreshStorageItems(); });
    parent.createEl("label", { text: "Filter type" }); const types = parent.createDiv({ cls: "cp-filter-chips" }); for (const type of ["all", "card", "markdown", "image", "group"] as const) { const button = types.createEl("button", { text: type === "all" ? "All" : type === "markdown" ? "MD" : type, cls: this.typeFilter === type ? "is-active" : "" }); button.addEventListener("click", () => { this.typeFilter = type; for (const chip of Array.from(types.querySelectorAll("button"))) chip.toggleClass("is-active", chip === button); this.refreshStorageItems(); }); }
    parent.createEl("label", { text: "Tag filter" }); const tag = parent.createEl("input", { attr: { placeholder: "#tag" }, value: this.tagFilter }); tag.addEventListener("input", () => { this.tagFilter = tag.value.replace(/^#/, ""); this.refreshStorageItems(); });
    parent.createEl("label", { text: "Label filter" }); const label = parent.createEl("input", { attr: { placeholder: "Label" }, value: this.labelFilter }); label.addEventListener("input", () => { this.labelFilter = label.value; this.refreshStorageItems(); });
  }

  private renderStorageMain(parent: HTMLElement): void {
    const state = this.plugin.store.data.uiState.miniPalette;
    const heading = parent.createDiv({ cls: "cp-storage-heading" });
    if (this.layoutMode !== "wide") this.flyoutTrigger(heading, "control", "panel-left-open", "Open control flyout");
    else if (!state.leftPaneOpen) iconButton(heading, "panel-left-open", "Open left pane", () => { state.leftPaneOpen = true; this.plugin.store.changed(); });
    heading.createSpan({ text: "Assets" });
    for (const [mode, icon, label] of [["grid", "layout-grid", "Grid view"], ["list", "list", "List view"]] as const) { const button = iconButton(heading, icon, label, () => { state.viewMode = mode; state.densityLevel = mode === "list" ? 0 : Math.max(1, state.densityLevel || 4); this.plugin.store.changed(); }); if (state.viewMode === mode) button.addClass("is-active"); }
    if (this.layoutMode === "narrow" || this.layoutMode === "minimum") this.flyoutTrigger(heading, "preview", "panel-right-open", "Open preview flyout");
    else if (!state.rightPaneOpen) iconButton(heading, "panel-right-open", "Open preview pane", () => { state.rightPaneOpen = true; this.plugin.store.changed(); });
    if (this.layoutMode !== "wide" || !state.leftPaneOpen) {
      const quick = parent.createDiv({ cls: "cp-mini-quick-controls" });
      const search = quick.createEl("input", { cls: "cp-search", attr: { type: "search", placeholder: "Search assets", "data-cp-focus": "mini-quick-search" }, value: this.search }); search.addEventListener("input", () => { this.search = search.value; this.refreshStorageItems(); });
      const type = quick.createEl("select", { cls: "dropdown", attr: { "aria-label": "Type filter" } });
      for (const value of ["all", "card", "markdown", "image", "group"] as const) type.createEl("option", { value, text: value === "all" ? "All types" : value === "markdown" ? "MD" : value });
      type.value = this.typeFilter; type.addEventListener("change", () => { this.typeFilter = type.value as TypeFilter; this.refreshStorageItems(); });
      this.renderDensityControl(quick, "Item size", true);
    }
    const grid = parent.createDiv({ cls: "cp-asset-grid" });
    this.configureStorageGrid(parent, grid);
  }

  private configureStorageGrid(parent: HTMLElement, grid: HTMLElement): void {
    const state = this.plugin.store.data.uiState.miniPalette;
    state.densityLevel = applyAssetDensity(grid, state.densityLevel, "cp-asset-grid");
    state.viewMode = state.densityLevel === 0 ? "list" : "grid";
    grid.addEventListener("wheel", (event) => { if (!event.ctrlKey && !event.metaKey) return; event.preventDefault(); event.stopPropagation(); state.densityLevel = nextAssetDensity(state.densityLevel, event.deltaY); state.viewMode = state.densityLevel === 0 ? "list" : "grid"; applyAssetDensity(grid, state.densityLevel, "cp-asset-grid"); this.plugin.store.changed(); }, { passive: false });
    this.populateStorageGrid(grid);
    this.mountStorageSelection(parent, grid);
  }

  private populateStorageGrid(grid: HTMLElement): void {
    const state = this.plugin.store.data.uiState.miniPalette;
    applyAssetDensity(grid, state.densityLevel, "cp-asset-grid");
    const storageItems = this.storageItems();
    const orderedIds = storageItems.map((item) => item.id);
    for (const item of storageItems) {
      const facesEnabled = supportsFrontBack(item) && item.facesEnabled;
      const face = facesEnabled ? this.plugin.store.data.uiState.miniItemFaces[item.id] ?? "front" : "front";
      const selected = this.storageSelectedIds();
      const card = renderItem(grid, item, { selected: selected.includes(item.id), showSelectionMarker: selected.length > 1, dragItemIds: selected, currentFace: face, markdownSourceStatus: this.plugin.markdownSourceStatus(item), onMarkdownSourceStatus: (event) => this.plugin.showMarkdownSourceMenu(item, event), onToggleFace: facesEnabled ? (next) => this.plugin.store.setPaletteFace("mini", item.id, next) : undefined, draggable: true, onSelect: (event) => this.selectStorage(item.id, event, orderedIds), onOpen: () => face === "back" ? void this.plugin.editorManager.openBack(item.id) : void this.plugin.openItemEditor(item.id), onLocate: () => void this.plugin.locateItemOnCanvas(item), onContextMenu: (event) => this.openMiniItemMenu(event, item, "storage") });
      const body = card.querySelector<HTMLElement>(".cp-item__body"); if (body) void this.plugin.preview.render(body, item, true, 360, face);
      card.addEventListener("mousemove", (event) => { if (event.ctrlKey && this.hoverItemId !== item.id) { this.hoverItemId = item.id; if (this.rightPane) this.renderRightPane(this.rightPane); } });
      card.addEventListener("mouseleave", () => { if (this.hoverItemId === item.id) { this.hoverItemId = null; if (this.rightPane) this.renderRightPane(this.rightPane); } });
    }
    if (grid.childElementCount === 0) grid.createDiv({ cls: "cp-empty", text: "No items match these filters." });
  }

  private renderRightPane(parent: HTMLElement, close?: () => void): void {
    parent.empty();
    const head = parent.createDiv({ cls: "cp-pane-heading" }); head.createEl("h4", { text: this.hoverItemId ? "Temporary preview" : "Preview" }); iconButton(head, close ? "x" : "panel-right-close", close ? "Close preview flyout" : "Close preview pane", close ?? (() => { this.plugin.store.data.uiState.miniPalette.rightPaneOpen = false; this.plugin.store.changed(); }));
    const item = this.plugin.store.data.items[this.hoverItemId ?? this.plugin.store.data.uiState.selectedItemId ?? ""];
    if (!item) { parent.createDiv({ cls: "cp-empty", text: "Select an item to preview it." }); return; }
    parent.createEl("h3", { text: item.displayTitle }); const preview = parent.createDiv({ cls: "cp-preview" }); void this.plugin.preview.render(preview, item);
    parent.createEl("h4", { text: "Details" }); const details = [["Original Workspace", this.workspaceName(item.origin.workspaceId)], ["Created", new Date(item.createdAt).toLocaleString()], ["Modified", new Date(item.modifiedAt).toLocaleString()], ["Type", item.type], ["Original Path", item.origin.filePath ?? item.origin.canvasPath ?? "-"]];
    for (const [label, value] of details) { const row = parent.createDiv({ cls: "cp-detail" }); row.createSpan({ text: label }); row.createEl("strong", { text: value }); }
    const actions = parent.createDiv({ cls: "cp-preview-actions" }); const copy = actions.createEl("button", { text: "Copy" }); copy.addEventListener("click", () => void navigator.clipboard?.writeText(item.content ?? item.origin.filePath ?? item.displayTitle));
    if (item.origin.canvasPath && item.origin.canvasNodeId) actions.createEl("button", { text: "Locate on Canvas" }).addEventListener("click", () => void this.plugin.locateItemOnCanvas(item));
    else if (item.origin.filePath) actions.createEl("button", { text: "Open source file" }).addEventListener("click", () => void this.plugin.openOriginal(item));
  }

  private flyoutTrigger(parent: HTMLElement, kind: "control" | "preview", icon: string, label: string): HTMLButtonElement {
    const button = iconButton(parent, icon, label, () => this.toggleResponsiveFlyout(kind));
    button.dataset.cpFlyoutTrigger = kind;
    button.setAttribute("aria-controls", `cp-mini-${kind}-flyout`);
    button.setAttribute("aria-expanded", String(this.openFlyout === kind));
    if (this.openFlyout === kind) button.addClass("is-active");
    return button;
  }

  private toggleResponsiveFlyout(kind: "control" | "preview"): void {
    if (this.openFlyout === kind) { this.closeResponsiveFlyout(kind); return; }
    const state = this.plugin.store.data.uiState.miniPalette;
    const requestedWidth = kind === "control" ? Math.max(280, state.leftPaneWidth) : Math.max(300, state.rightPaneWidth);
    const measuredHostWidth = this.host?.clientWidth ?? 0;
    const hostWidth = measuredHostWidth >= 360 ? measuredHostWidth : window.innerWidth;
    const panelLeft = this.responsivePanelLeft ?? state.position.x;
    const placement = attachedFlyoutPlacement(hostWidth, panelLeft, state.size.width, kind === "preview" ? "right" : "left", requestedWidth);
    this.openFlyout = kind;
    this.flyoutSide = placement.side;
    this.flyoutWidth = placement.width;
    this.responsivePanelLeft = placement.panelLeft;
    this.render();
    window.setTimeout(() => this.panel?.querySelector<HTMLElement>(`#cp-mini-${kind}-flyout button, #cp-mini-${kind}-flyout input, #cp-mini-${kind}-flyout select`)?.focus(), 0);
  }

  private closeResponsiveFlyout(kind = this.openFlyout): void {
    if (!kind) return;
    this.openFlyout = null;
    this.responsivePanelLeft = null;
    this.render();
    window.setTimeout(() => this.panel?.querySelector<HTMLElement>(`[data-cp-flyout-trigger="${kind}"]`)?.focus(), 0);
  }

  private renderResponsiveFlyout(panel: HTMLElement, kind: "control" | "preview"): void {
    panel.style.setProperty("--cp-mini-flyout-width", `${this.flyoutWidth}px`);
    const flyout = panel.createDiv({ cls: `cp-mini-flyout ${kind === "control" ? "cp-storage-left" : "cp-storage-right"} cp-mini-flyout--${kind} is-${this.flyoutSide}`, attr: { id: `cp-mini-${kind}-flyout`, role: "region", "aria-label": kind === "control" ? "Mini Palette controls" : "Mini Palette preview" } });
    if (kind === "control") this.renderLeftPane(flyout, () => this.closeResponsiveFlyout(kind));
    else { this.rightPane = flyout; this.renderRightPane(flyout, () => this.closeResponsiveFlyout(kind)); }
    const dismissPointer = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node) || flyout.contains(target) || this.panel?.querySelector(`[data-cp-flyout-trigger="${kind}"]`)?.contains(target)) return;
      this.closeResponsiveFlyout(kind);
    };
    const dismissKey = (event: KeyboardEvent): void => { if (event.key === "Escape") { event.preventDefault(); this.closeResponsiveFlyout(kind); } };
    window.setTimeout(() => { window.addEventListener("pointerdown", dismissPointer, true); window.addEventListener("keydown", dismissKey, true); }, 0);
    this.flyoutCleanup = () => { window.removeEventListener("pointerdown", dismissPointer, true); window.removeEventListener("keydown", dismissKey, true); };
  }

  private captureViewState(): { scroll: Record<string, number>; focus: string | null; selection: [number | null, number | null] } | null {
    if (!this.panel) return null;
    const scroll: Record<string, number> = {};
    for (const selector of [".cp-collect-screen", ".cp-storage-left", ".cp-storage-main", ".cp-storage-right", ".cp-mini-flyout"] as const) {
      const element = this.panel.querySelector<HTMLElement>(selector); if (!element) continue;
      if (element.scrollHeight > element.clientHeight || this.scrollMemory[selector] === undefined) this.scrollMemory[selector] = element.scrollTop;
      scroll[selector] = this.scrollMemory[selector];
    }
    const active = document.activeElement instanceof HTMLElement && this.panel.contains(document.activeElement) ? document.activeElement : null;
    const focus = active?.dataset.cpFocus ?? null;
    const input = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? active : null;
    return { scroll, focus, selection: [input?.selectionStart ?? null, input?.selectionEnd ?? null] };
  }

  private restoreViewState(state: ReturnType<FloatingMiniPalette["captureViewState"]>): void {
    if (!state) return;
    window.setTimeout(() => {
      if (!this.panel) return;
      for (const [selector, top] of Object.entries(state.scroll)) { const element = this.panel.querySelector<HTMLElement>(selector); if (element) element.scrollTop = top; }
      if (!state.focus) return;
      const active = this.panel.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-cp-focus="${state.focus}"]`); if (!active) return;
      active.focus(); if (state.selection[0] !== null && state.selection[1] !== null) active.setSelectionRange(state.selection[0], state.selection[1]);
    }, 0);
  }

  private clampGeometry(): boolean {
    const state = this.plugin.store.data.uiState.miniPalette;
    const measuredHostWidth = this.host?.clientWidth ?? 0;
    const measuredHostHeight = this.host?.clientHeight ?? 0;
    const hostWidth = measuredHostWidth >= 360 ? measuredHostWidth : window.innerWidth;
    const hostHeight = measuredHostHeight >= 300 ? measuredHostHeight : window.innerHeight;
    const width = Math.min(Math.max(360, state.size.width), Math.max(1, hostWidth));
    const height = Math.min(Math.max(300, state.size.height), Math.max(1, hostHeight));
    const x = Math.max(0, Math.min(state.position.x, Math.max(0, hostWidth - width)));
    const y = Math.max(0, Math.min(state.position.y, Math.max(0, hostHeight - height)));
    const changed = width !== state.size.width || height !== state.size.height || x !== state.position.x || y !== state.position.y;
    if (changed) { state.size = { width, height }; state.position = { x, y }; this.responsivePanelLeft = null; }
    return changed;
  }

  private observePanel(panel: HTMLElement): void {
    this.resizeObserver = new ResizeObserver(([entry]) => {
      if (this.isResizing) return;
      const borderBox = Array.isArray(entry.borderBoxSize) ? entry.borderBoxSize[0] : entry.borderBoxSize;
      const next = miniLayoutMode(borderBox?.inlineSize ?? panel.getBoundingClientRect().width);
      if (next === this.layoutMode) return;
      this.layoutMode = next;
      this.openFlyout = null;
      this.responsivePanelLeft = null;
      this.render();
    });
    this.resizeObserver.observe(panel);
  }

  private renderInspector(): void {
    const item = this.plugin.store.data.items[this.inspectorItemId ?? ""]; if (!item || !this.panel) return;
    const drawer = this.panel.createDiv({ cls: "cp-inspector-drawer" }); const head = drawer.createDiv({ cls: "cp-pane-heading" }); head.createEl("h3", { text: "Selected item settings" }); iconButton(head, "x", "Close inspector", () => { this.inspectorItemId = null; this.render(); });
    const title = this.input(drawer, "Title", item.displayTitle); const tags = this.input(drawer, "Tag", item.tags.join(", "), "tag1, tag2"); const label = this.input(drawer, "Label", item.label, "e.g. Idea, In progress"); drawer.createEl("label", { text: "Label color" }); const labelColor = drawer.createEl("input", { attr: { type: "color", "aria-label": "Label color" } }); labelColor.value = item.labelColor || "#8b5cf6"; const caption = this.textarea(drawer, "Caption", item.caption); drawer.createEl("h4", { text: "Original preview" }); const preview = drawer.createDiv({ cls: "cp-preview cp-preview--inspector" }); void this.plugin.preview.render(preview, item, true);
    const actions = drawer.createDiv({ cls: "cp-inspector-actions" }); const remove = actions.createEl("button", { text: "Delete", cls: "mod-warning" }); remove.addEventListener("click", () => this.confirmPendingDelete([item.id])); const close = actions.createEl("button", { text: "Close" }); close.addEventListener("click", () => { this.inspectorItemId = null; this.plugin.store.data.uiState.miniPalette.focusedItemId = null; this.render(); }); const save = actions.createEl("button", { text: "Save", cls: "mod-cta" }); save.addEventListener("click", () => { const labelValue = label.value.trim(); this.plugin.store.updateItem(item.id, { displayTitle: title.value, tags: tags.value.split(",").map((value) => value.trim().replace(/^#/, "")).filter(Boolean), label: labelValue, labelColor: labelValue ? labelColor.value : "", caption: caption.value }); this.inspectorItemId = null; this.plugin.store.data.uiState.miniPalette.focusedItemId = null; });
  }

  private input(parent: HTMLElement, label: string, value: string, placeholder = ""): HTMLInputElement { parent.createEl("label", { text: label }); return parent.createEl("input", { attr: { placeholder }, value }); }
  private textarea(parent: HTMLElement, label: string, value: string): HTMLTextAreaElement { parent.createEl("label", { text: label }); return parent.createEl("textarea", { text: value }); }
  private collectSelectedIds(): string[] { return this.plugin.store.data.uiState.miniPalette.collectSelectedItemIds; }
  private storageSelectedIds(): string[] { return this.plugin.store.data.uiState.miniPalette.storageSelectedItemIds; }
  private setCollectSelectedIds(ids: string[]): void { this.plugin.store.data.uiState.miniPalette.collectSelectedItemIds = ids.filter((id) => Boolean(this.plugin.store.data.items[id])); }
  private setStorageSelectedIds(ids: string[]): void { this.plugin.store.data.uiState.miniPalette.storageSelectedItemIds = ids.filter((id) => Boolean(this.plugin.store.data.items[id])); }
  private selectionFromEvent(current: string[], id: string, event: Pick<MouseEvent | KeyboardEvent, "ctrlKey" | "metaKey" | "shiftKey">, orderedIds: string[], anchorId: string | null): string[] {
    const toggle = event.ctrlKey || event.metaKey;
    if (event.shiftKey && anchorId) {
      const anchor = orderedIds.indexOf(anchorId); const target = orderedIds.indexOf(id);
      const range = anchor >= 0 && target >= 0 ? orderedIds.slice(Math.min(anchor, target), Math.max(anchor, target) + 1) : [id];
      return toggle ? [...new Set([...current, ...range])] : range;
    }
    return toggle ? (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]) : [id];
  }
  private selectPending(id: string, event: MouseEvent | KeyboardEvent, orderedIds: string[]): void {
    const state = this.plugin.store.data.uiState.miniPalette;
    this.setCollectSelectedIds(this.selectionFromEvent(this.collectSelectedIds(), id, event, orderedIds, state.collectSelectionAnchorId));
    if (!event.shiftKey) state.collectSelectionAnchorId = id;
    state.focusedItemId = id; this.plugin.store.changed();
  }
  private selectStorage(id: string, event: MouseEvent | KeyboardEvent, orderedIds: string[]): void {
    const state = this.plugin.store.data.uiState.miniPalette;
    const next = this.selectionFromEvent(this.storageSelectedIds(), id, event, orderedIds, state.storageSelectionAnchorId);
    this.setStorageSelectedIds(next); if (!event.shiftKey) state.storageSelectionAnchorId = id;
    this.plugin.store.data.uiState.selectedItemId = next.includes(id) ? id : next.at(-1) ?? null; this.plugin.store.changed();
  }
  private collectItems(): PaletteItem[] { return this.filtered(this.plugin.store.data.pendingItemIds.map((id) => this.plugin.store.data.items[id]).filter((item): item is PaletteItem => Boolean(item))); }
  private storageCandidates(): PaletteItem[] { return this.plugin.store.data.uiState.miniPalette.storageItemIds.map((id) => this.plugin.store.data.items[id]).filter((item): item is PaletteItem => Boolean(item)); }
  private storageItems(): PaletteItem[] { const now = Date.now(); const cutoff = this.dateFilter === "today" ? new Date().setHours(0, 0, 0, 0) : this.dateFilter === "week" ? now - 7 * 86400000 : this.dateFilter === "month" ? now - 30 * 86400000 : 0; return this.sort(this.filtered(this.storageCandidates()).filter((item) => item.modifiedAt >= cutoff)); }
  private filtered(items: PaletteItem[]): PaletteItem[] { return this.plugin.search.filter(items, this.search).filter((item) => (this.typeFilter === "all" || item.type === this.typeFilter) && (!this.tagFilter || item.tags.some((tag) => tag.toLocaleLowerCase().includes(this.tagFilter.toLocaleLowerCase()))) && (!this.labelFilter || item.label.toLocaleLowerCase().includes(this.labelFilter.toLocaleLowerCase()))); }
  private refreshStorageItems(): void { const grid = this.panel?.querySelector<HTMLElement>(".cp-storage-main .cp-asset-grid"); if (!grid) return; grid.empty(); this.populateStorageGrid(grid); const total = this.panel?.querySelector<HTMLElement>(".cp-bottom--float > span"); if (total) total.setText(`Total ${this.storageItems().length} · Selected ${this.storageSelectedIds().length}`); }
  private sort(items: PaletteItem[]): PaletteItem[] { const mode = this.plugin.store.data.uiState.miniPalette.sort; return [...items].sort((a, b) => mode === "modified-desc" ? b.modifiedAt - a.modifiedAt : mode === "modified-asc" ? a.modifiedAt - b.modifiedAt : mode === "title-desc" ? b.displayTitle.localeCompare(a.displayTitle) : a.displayTitle.localeCompare(b.displayTitle)); }
  private workspaceName(id?: string): string { return id ? this.plugin.store.data.workspaces[id]?.name ?? "Unknown workspace" : "Pending"; }
  private editSelectedMetadata(): void { const ids = this.storageSelectedIds().filter((id) => this.plugin.store.data.items[id]); if (ids.length === 0) { new Notice("Select items first."); return; } new TagLabelModal(this.plugin.app, this.plugin, ids).open(); }
  private renderDensityControl(parent: HTMLElement, label: string, compact = false): void {
    const state = this.plugin.store.data.uiState.miniPalette;
    const control = parent.createDiv({ cls: `cp-density-control${compact ? " is-compact" : ""}` });
    const heading = control.createDiv({ cls: "cp-density-control__heading" }); const name = heading.createEl("label", { text: label }); const value = heading.createSpan({ text: assetDensityLabel(state.densityLevel) });
    const input = control.createEl("input", { attr: { type: "range", min: String(ASSET_DENSITY_MIN), max: String(ASSET_DENSITY_MAX), step: "1", value: String(state.densityLevel), "aria-label": label } });
    name.htmlFor = input.id = `cp-mini-density-${compact ? "quick" : "panel"}`;
    const update = (): void => { state.densityLevel = Number(input.value); state.viewMode = state.densityLevel === 0 ? "list" : "grid"; value.setText(assetDensityLabel(state.densityLevel)); const grid = this.panel?.querySelector<HTMLElement>(".cp-asset-grid"); if (grid) applyAssetDensity(grid, state.densityLevel, "cp-asset-grid"); };
    input.addEventListener("input", update); input.addEventListener("change", () => this.plugin.store.changed());
  }
  private openMiniItemMenu(event: MouseEvent, item: PaletteItem, tab: "collect" | "storage"): void {
    event.preventDefault();
    const selected = tab === "collect" ? this.collectSelectedIds() : this.storageSelectedIds();
    const targetIds = selected.includes(item.id) ? selected : [item.id];
    if (!selected.includes(item.id)) {
      if (tab === "collect") this.setCollectSelectedIds([item.id]); else this.setStorageSelectedIds([item.id]);
      this.plugin.store.changed();
    }
    const menu = new Menu();
    if (tab === "collect" && targetIds.length === 1) {
      menu.addItem((entry) => entry.setTitle("Open selected item settings").setIcon("settings-2").onClick(() => this.openCollectInspector(item.id)));
    } else {
      menu.addItem((entry) => entry.setTitle("Multiple selection editing").setIcon("tags").onClick(() => new TagLabelModal(this.plugin.app, this.plugin, targetIds).open()));
    }
    if (targetIds.length === 1) {
      if (item.origin.canvasPath && item.origin.canvasNodeId) menu.addItem((entry) => entry.setTitle("Locate on Canvas").setIcon("locate-fixed").onClick(() => void this.plugin.locateItemOnCanvas(item)));
      else if (item.origin.filePath) menu.addItem((entry) => entry.setTitle("Open source file").setIcon("external-link").onClick(() => void this.plugin.openOriginal(item)));
    }
    menu.addSeparator();
    if (tab === "collect") menu.addItem((entry) => entry.setTitle(`Delete ${targetIds.length} pending item${targetIds.length === 1 ? "" : "s"}`).setIcon("trash").onClick(() => this.confirmPendingDelete(targetIds)));
    else menu.addItem((entry) => entry.setTitle(`Remove ${targetIds.length} link${targetIds.length === 1 ? "" : "s"} from Mini`).setIcon("unlink").onClick(() => this.confirmMiniStorageRemoval(targetIds)));
    menu.showAtMouseEvent(event);
  }
  private renderPendingCard(parent: HTMLElement, item: PaletteItem, orderedIds: string[]): void {
    const selected = this.collectSelectedIds();
    const card = renderItem(parent, item, { selected: selected.includes(item.id), showSelectionMarker: selected.length > 1, dragItemIds: selected, miniCollect: true, draggable: true, onSelect: (event) => { this.selectPending(item.id, event, orderedIds); this.inspectorItemId = null; this.render(); }, onOpen: () => void this.plugin.openItemEditor(item.id), onLocate: () => void this.plugin.locateItemOnCanvas(item), onContextMenu: (event) => this.openMiniItemMenu(event, item, "collect") });
    const preview = card.querySelector<HTMLElement>(".cp-item__body"); if (preview) void this.plugin.preview.render(preview, item, true, 360);
  }
  private openCollectInspector(itemId: string): void {
    this.plugin.store.data.uiState.miniPalette.focusedItemId = itemId;
    this.inspectorItemId = itemId;
    this.plugin.store.changed();
  }
  private confirmPendingDelete(ids: string[]): void {
    const valid = ids.filter((id) => Boolean(this.plugin.store.data.items[id]) && this.plugin.store.data.pendingItemIds.includes(id)); if (valid.length === 0) return;
    new ConfirmDeleteModal(this.plugin.app, valid.length, () => {
      this.plugin.store.removePendingItems(valid);
      this.setCollectSelectedIds([]); this.inspectorItemId = null; this.plugin.store.data.uiState.miniPalette.focusedItemId = null;
    }).open();
  }
  private confirmMiniStorageRemoval(ids: string[]): void {
    const valid = ids.filter((id) => Boolean(this.plugin.store.data.items[id]) && !this.plugin.store.data.pendingItemIds.includes(id)); if (valid.length === 0) return;
    new ConfirmMiniStorageRemovalModal(this.plugin.app, valid.length, () => {
      this.plugin.store.removeMiniStorageItems(valid);
      this.setStorageSelectedIds([]); this.hoverItemId = null; this.plugin.store.data.uiState.miniPalette.storageSelectionAnchorId = null;
    }).open();
  }
  private async placeSelectedOnCanvas(): Promise<void> {
    const items = this.storageSelectedIds().map((id) => this.plugin.store.data.items[id]).filter((item): item is PaletteItem => Boolean(item));
    const canvas = this.plugin.canvas.activeContainer(); if (!canvas || items.length === 0) { new Notice(items.length === 0 ? "Select items first." : "Open a Canvas first."); return; }
    const rect = canvas.getBoundingClientRect(); await this.plugin.canvas.restoreItems(items, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }
  private dragIds(dataTransfer: DataTransfer | null | undefined): string[] {
    if (!dataTransfer) return [];
    try { const ids = JSON.parse(dataTransfer.getData("application/x-canvas-palette-items")); if (Array.isArray(ids)) return ids.filter((id): id is string => typeof id === "string"); } catch { /* fall back to the legacy single item payload */ }
    const id = dataTransfer.getData("application/x-canvas-palette-item"); return id ? [id] : [];
  }
  private mountStorageSelection(viewport: HTMLElement, grid: HTMLElement): void {
    viewport.addEventListener("click", (event) => {
      if (this.suppressBlankClick) { this.suppressBlankClick = false; return; }
      const target = event.target; if (!(target instanceof HTMLElement) || target.closest(".cp-item,button,input,select,textarea,label,a")) return;
      this.setStorageSelectedIds([]); this.plugin.store.data.uiState.miniPalette.storageSelectionAnchorId = null; this.plugin.store.data.uiState.selectedItemId = null; this.plugin.store.changed();
    });
    grid.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target !== grid) return;
      event.preventDefault(); const start = { x: event.clientX, y: event.clientY };
      const base = event.ctrlKey || event.metaKey ? new Set(this.storageSelectedIds()) : new Set<string>();
      const rectangle = document.createElement("div"); rectangle.className = "cp-selection-rectangle"; document.body.appendChild(rectangle);
      let dragged = false; let hits: string[] = [];
      const move = (pointer: PointerEvent): void => {
        if (!dragged && Math.hypot(pointer.clientX - start.x, pointer.clientY - start.y) < 4) return; dragged = true;
        const left = Math.min(start.x, pointer.clientX); const top = Math.min(start.y, pointer.clientY); const right = Math.max(start.x, pointer.clientX); const bottom = Math.max(start.y, pointer.clientY);
        Object.assign(rectangle.style, { display: "block", left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${bottom - top}px` }); hits = [];
        for (const card of Array.from(grid.querySelectorAll<HTMLElement>(".cp-item"))) { const rect = card.getBoundingClientRect(); const hit = rect.right >= left && rect.left <= right && rect.bottom >= top && rect.top <= bottom; card.toggleClass("is-selected", hit || base.has(card.dataset.itemId ?? "")); if (hit && card.dataset.itemId) hits.push(card.dataset.itemId); }
      };
      const cleanup = (): void => { window.removeEventListener("pointermove", move, true); window.removeEventListener("pointerup", finish, true); window.removeEventListener("pointercancel", finish, true); window.removeEventListener("keydown", key, true); rectangle.remove(); };
      const finish = (): void => { cleanup(); this.suppressBlankClick = true; window.setTimeout(() => { this.suppressBlankClick = false; }, 0); if (!dragged) this.setStorageSelectedIds([]); else this.setStorageSelectedIds([...new Set([...base, ...hits])]); const state = this.plugin.store.data.uiState.miniPalette; state.storageSelectionAnchorId = this.storageSelectedIds().at(-1) ?? null; this.plugin.store.data.uiState.selectedItemId = state.storageSelectionAnchorId; this.plugin.store.changed(); };
      const key = (keyboard: KeyboardEvent): void => { if (keyboard.key === "Escape") { cleanup(); for (const card of Array.from(grid.querySelectorAll<HTMLElement>(".cp-item"))) card.toggleClass("is-selected", base.has(card.dataset.itemId ?? "")); } };
      window.addEventListener("pointermove", move, true); window.addEventListener("pointerup", finish, true); window.addEventListener("pointercancel", finish, true); window.addEventListener("keydown", key, true);
    });
  }
  private applyAccent(panel: HTMLElement): void { const settings = this.plugin.store.data.settings; if (settings.accentMode === "custom") panel.style.setProperty("--cp-accent", settings.accentColor); }
  private makeDraggable(handle: HTMLElement, panel: HTMLElement): void { handle.addEventListener("pointerdown", (event) => { if ((event.target as HTMLElement).closest("button,input,select")) return; event.preventDefault(); this.commitResponsivePanelPosition(panel); handle.setPointerCapture(event.pointerId); const state = this.plugin.store.data.uiState.miniPalette; const start = { x: event.clientX, y: event.clientY, left: state.position.x, top: state.position.y }; const move = (pointer: PointerEvent) => { const host = this.host?.getBoundingClientRect(); const maxLeft = Math.max(0, (host?.width ?? window.innerWidth) - panel.offsetWidth); const maxTop = Math.max(0, (host?.height ?? window.innerHeight) - panel.offsetHeight); state.position = { x: Math.max(0, Math.min(maxLeft, start.left + pointer.clientX - start.x)), y: Math.max(0, Math.min(maxTop, start.top + pointer.clientY - start.y)) }; panel.style.left = `${state.position.x}px`; panel.style.top = `${state.position.y}px`; }; const end = () => { handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", end); handle.removeEventListener("pointercancel", end); this.plugin.store.changed(); }; handle.addEventListener("pointermove", move); handle.addEventListener("pointerup", end); handle.addEventListener("pointercancel", end); }); }
  private makeResizable(handle: HTMLElement, panel: HTMLElement, direction: string): void { handle.addEventListener("pointerdown", (event) => { event.preventDefault(); event.stopPropagation(); this.commitResponsivePanelPosition(panel); this.isResizing = true; handle.setPointerCapture(event.pointerId); const state = this.plugin.store.data.uiState.miniPalette; const start = { x: event.clientX, y: event.clientY, left: state.position.x, top: state.position.y, width: state.size.width, height: state.size.height }; const move = (pointer: PointerEvent) => { const dx = pointer.clientX - start.x; const dy = pointer.clientY - start.y; const host = this.host?.getBoundingClientRect(); const hostWidth = host?.width ?? window.innerWidth; const hostHeight = host?.height ?? window.innerHeight; const minWidth = 360; const minHeight = 300; let left = start.left; let top = start.top; let width = start.width; let height = start.height; if (direction.includes("e")) width = start.width + dx; if (direction.includes("s")) height = start.height + dy; if (direction.includes("w")) { width = start.width - dx; left = start.left + dx; } if (direction.includes("n")) { height = start.height - dy; top = start.top + dy; } if (width < minWidth) { if (direction.includes("w")) left -= minWidth - width; width = minWidth; } if (height < minHeight) { if (direction.includes("n")) top -= minHeight - height; height = minHeight; } left = Math.max(0, left); top = Math.max(0, top); width = Math.min(width, Math.max(minWidth, hostWidth - left)); height = Math.min(height, Math.max(minHeight, hostHeight - top)); state.position = { x: left, y: top }; state.size = { width, height }; panel.style.left = `${left}px`; panel.style.top = `${top}px`; panel.style.width = `${width}px`; panel.style.height = `${height}px`; }; const end = () => { this.isResizing = false; handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", end); handle.removeEventListener("pointercancel", end); this.plugin.store.changed(); }; handle.addEventListener("pointermove", move); handle.addEventListener("pointerup", end); handle.addEventListener("pointercancel", end); }); }
  private commitResponsivePanelPosition(panel: HTMLElement): void {
    if (this.responsivePanelLeft === null) return;
    this.plugin.store.data.uiState.miniPalette.position.x = panel.offsetLeft;
    this.responsivePanelLeft = null;
    this.openFlyout = null;
    this.flyoutCleanup?.(); this.flyoutCleanup = undefined;
    panel.querySelector(".cp-mini-flyout")?.remove();
  }
}
