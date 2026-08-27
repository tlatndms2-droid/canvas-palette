import { ItemView, Menu, WorkspaceLeaf } from "obsidian";
import type CanvasPalettePlugin from "../main";
import type { Collection, PaletteItem, SideLayoutState } from "../core/types";
import { ConfirmDeleteModal, TagLabelModal, TextPromptModal } from "../ui/modal";
import { makeHorizontalDivider, makeVerticalDivider } from "../ui/resizable";
import { iconButton, renderItem, workspaceSelect } from "../ui/render";

export const SIDE_PALETTE_VIEW = "canvas-palette-side";

export class SidePaletteView extends ItemView {
  private unsubscribe?: () => void;
  private query = "";
  private readonly scrollSelectors = [".cp-viewport", ".cp-outliner", ".cp-tag-index", ".cp-label-index"] as const;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: CanvasPalettePlugin) { super(leaf); }
  getViewType(): string { return SIDE_PALETTE_VIEW; }
  getDisplayText(): string { return "Canvas Palette"; }
  getIcon(): string { return "library-big"; }
  async onOpen(): Promise<void> { this.unsubscribe = this.plugin.store.subscribe(() => this.render()); this.render(); }
  async onClose(): Promise<void> { this.unsubscribe?.(); }

  private render(): void {
    const root = this.contentEl;
    const previousWorkspaceId = root.dataset.cpWorkspaceId;
    const scrollPositions = new Map(this.scrollSelectors.map((selector) => [selector, root.querySelector<HTMLElement>(selector)?.scrollTop ?? 0]));
    root.empty(); root.addClass("canvas-palette", "cp-side", `cp-theme-${this.plugin.store.data.settings.theme}`);
    if (this.plugin.store.data.settings.accentMode === "custom") root.style.setProperty("--cp-accent", this.plugin.store.data.settings.accentColor);
    const workspace = this.plugin.activeWorkspace();
    if (!workspace) return;
    root.dataset.cpWorkspaceId = workspace.id;
    this.applyLayoutVariables(root, workspace.sideLayout);
    const header = root.createDiv({ cls: "cp-side__header" });
    header.createDiv({ cls: "cp-brand", text: "Canvas Palette" });
    const exportButton = header.createEl("button", { text: "Export" }); exportButton.addEventListener("click", () => void this.plugin.exportActiveWorkspace());
    const collectButton = header.createEl("button", { text: "Send to Mini Palette" }); collectButton.addEventListener("click", () => void this.plugin.collectCanvasSelection());
    const selectorRow = root.createDiv({ cls: "cp-workspace-row" }); selectorRow.createSpan({ text: "Current workspace" });
    workspaceSelect(this.plugin, selectorRow, workspace.id, (id) => { this.plugin.store.data.uiState.activeWorkspaceId = id; this.plugin.store.changed(); });
    const searchWrap = root.createDiv({ cls: "cp-search-wrap" });
    const search = searchWrap.createEl("input", { cls: "cp-search", attr: { type: "search", placeholder: "Search cards, files, tags, labels…" }, value: this.query });
    search.addEventListener("input", () => { this.query = search.value; this.render(); requestAnimationFrame(() => this.contentEl.querySelector<HTMLInputElement>(".cp-search")?.focus()); });
    const top = root.createDiv({ cls: "cp-side__top" });
    const viewport = top.createDiv({ cls: "cp-panel cp-viewport" }); this.renderViewport(viewport, workspace.id);
    const vDivider = top.createDiv({ cls: "cp-divider cp-divider--vertical" });
    makeHorizontalDivider(vDivider, (x) => {
      workspace.sideLayout.viewportRatio = this.horizontalRatio(top, vDivider, x, 160, 180);
      this.applyLayoutVariables(root, workspace.sideLayout);
    }, () => this.plugin.store.changed());
    const outliner = top.createDiv({ cls: "cp-panel cp-outliner" }); this.renderOutliner(outliner, workspace.id);
    const hDivider = root.createDiv({ cls: "cp-divider cp-divider--horizontal" });
    const indexes = root.createDiv({ cls: "cp-side__indexes" });
    makeVerticalDivider(hDivider, (y) => {
      workspace.sideLayout.topRatio = this.verticalRatio(top, indexes, hDivider, y);
      this.applyLayoutVariables(root, workspace.sideLayout);
    }, () => this.plugin.store.changed());
    const tags = indexes.createDiv({ cls: "cp-panel cp-tag-index" }); this.renderIndex(tags, "Tag index", this.items(workspace.id).flatMap((item) => item.tags), "#");
    const iDivider = indexes.createDiv({ cls: "cp-divider cp-divider--vertical" });
    makeHorizontalDivider(iDivider, (x) => {
      workspace.sideLayout.indexRatio = this.horizontalRatio(indexes, iDivider, x, 130, 130);
      this.applyLayoutVariables(root, workspace.sideLayout);
    }, () => this.plugin.store.changed());
    const labels = indexes.createDiv({ cls: "cp-panel cp-label-index" }); this.renderIndex(labels, "Label index", this.items(workspace.id).map((item) => item.label).filter(Boolean), "");
    if (previousWorkspaceId === workspace.id) {
      for (const [selector, scrollTop] of scrollPositions) {
        const panel = root.querySelector<HTMLElement>(selector);
        if (panel) panel.scrollTop = scrollTop;
      }
    }
  }

  private renderViewport(parent: HTMLElement, workspaceId: string): void {
    const header = parent.createDiv({ cls: "cp-panel__header" }); header.createEl("h4", { text: "Viewport" });
    const selectedIds = this.sideSelectedIds().filter((id) => this.plugin.store.data.items[id]);
    const memo = header.createEl("button", { text: "+ Memo" }); memo.addEventListener("click", () => void this.plugin.createMemo());
    const grid = header.createEl("button", { text: "Grid", cls: this.plugin.activeWorkspace()?.sideLayout.viewMode === "grid" ? "is-active" : "" });
    const list = header.createEl("button", { text: "List", cls: this.plugin.activeWorkspace()?.sideLayout.viewMode === "list" ? "is-active" : "" });
    grid.addEventListener("click", () => this.setSideView("grid")); list.addEventListener("click", () => this.setSideView("list"));
    const batchSlot = parent.createDiv({ cls: `cp-batch-slot${selectedIds.length > 0 ? " is-active" : ""}` });
    if (selectedIds.length > 0) {
      const batch = batchSlot.createDiv({ cls: "cp-batch-bar" }); batch.createSpan({ cls: "cp-selection-count", text: `Selected ${selectedIds.length}` });
      const remove = batch.createEl("button", { text: "Delete", cls: "mod-warning" }); remove.addEventListener("click", () => this.confirmDelete(selectedIds));
    }
    const options = parent.createEl("details", { cls: "cp-view-options" }); options.createEl("summary", { text: "View settings" });
    const cardSize = options.createEl("input", { attr: { type: "range", min: "160", max: "360", value: String(this.plugin.store.data.settings.cardSize) } });
    cardSize.addEventListener("input", () => { this.plugin.store.data.settings.cardSize = Number(cardSize.value); this.plugin.store.changed(); });
    const fontSize = options.createEl("input", { attr: { type: "range", min: "11", max: "20", value: String(this.plugin.store.data.settings.fontSize) } });
    fontSize.addEventListener("input", () => { this.plugin.store.data.settings.fontSize = Number(fontSize.value); this.plugin.store.changed(); });
    const listEl = parent.createDiv({ cls: `cp-grid cp-grid--${this.plugin.activeWorkspace()?.sideLayout.viewMode ?? "grid"}` }); listEl.style.setProperty("--cp-card-size", `${this.plugin.store.data.settings.cardSize}px`);
    listEl.addEventListener("dragover", (event) => { if (event.dataTransfer?.types.includes("application/x-canvas-palette-item")) event.preventDefault(); });
    listEl.addEventListener("drop", (event) => {
      const sourceId = event.dataTransfer?.getData("application/x-canvas-palette-item"); const target = (event.target as HTMLElement).closest<HTMLElement>(".cp-item"); const targetId = target?.dataset.itemId;
      if (sourceId && targetId) { event.preventDefault(); this.plugin.store.reorderItems(workspaceId, sourceId, targetId); }
    });
    for (const item of this.plugin.search.filter(this.items(workspaceId), this.query)) {
      const card = renderItem(listEl, item, { selected: selectedIds.includes(item.id), onSelect: (event) => this.selectSideItem(item.id, event.ctrlKey || event.metaKey), onOpen: () => void this.plugin.openSideItemPreview(item.id), onLocate: () => void this.plugin.locateItemOnCanvas(item), draggable: true, onContextMenu: (event) => this.itemMenu(event, item) });
      const body = card.querySelector<HTMLElement>(".cp-item__body"); if (body) void this.plugin.preview.render(body, item, true);
    }
    if (listEl.childElementCount === 0) listEl.createDiv({ cls: "cp-empty", text: "No matching items." });
  }

  private renderOutliner(parent: HTMLElement, workspaceId: string): void {
    const header = parent.createDiv({ cls: "cp-panel__header" }); header.createEl("h4", { text: "Outliner" });
    const collection = header.createEl("button", { text: "+ Collection" }); collection.addEventListener("click", () => this.promptCollection(workspaceId, null));
    const memo = header.createEl("button", { text: "+ Memo" }); memo.addEventListener("click", () => void this.plugin.createMemo());
    const workspace = this.plugin.store.data.workspaces[workspaceId]; if (!workspace) return;
    parent.createDiv({ cls: "cp-outline-root", text: workspace.name });
    for (const id of workspace.rootCollectionIds) this.renderCollection(parent, this.plugin.store.data.collections[id], 0);
    for (const item of workspace.looseItemIds.map((id) => this.plugin.store.data.items[id]).filter((item): item is PaletteItem => Boolean(item))) this.renderOutlineItem(parent, item, 0);
  }

  private renderCollection(parent: HTMLElement, collection: Collection | undefined, depth: number): void {
    if (!collection) return;
    const row = parent.createDiv({ cls: "cp-outline-row", attr: { style: `--cp-depth:${depth}` } }); row.createSpan({ cls: "cp-outline-row__title", text: `⌄  ${collection.name}` });
    row.addEventListener("dragover", (event) => { if (event.dataTransfer?.types.includes("application/x-canvas-palette-item")) event.preventDefault(); });
    row.addEventListener("drop", (event) => { const id = event.dataTransfer?.getData("application/x-canvas-palette-item"); if (id) { event.preventDefault(); this.plugin.store.assignItemsToCollection(collection.workspaceId, [id], collection.id); } });
    iconButton(row, "plus", "Add nested collection", () => this.promptCollection(collection.workspaceId, collection.id));
    iconButton(row, "pencil", "Rename collection", () => new TextPromptModal(this.app, "Rename collection", collection.name, (value) => this.plugin.store.renameCollection(collection.id, value)).open());
    for (const itemId of collection.itemIds) { const item = this.plugin.store.data.items[itemId]; if (item) this.renderOutlineItem(parent, item, depth + 1); }
    for (const child of collection.childCollectionIds) this.renderCollection(parent, this.plugin.store.data.collections[child], depth + 1);
  }

  private renderOutlineItem(parent: HTMLElement, item: PaletteItem, depth: number): void {
    const selected = this.sideSelectedIds().includes(item.id);
    const row = parent.createDiv({ cls: `cp-outline-item cp-outline-item--${item.type}${selected ? " is-selected" : ""}${this.query && this.plugin.search.matches(item, this.query) ? " is-match" : ""}`, attr: { style: `--cp-depth:${depth}` } }); row.setText(`${selected ? "✓ " : ""}${item.type.toUpperCase()}  ${item.displayTitle}`);
    let clickTimer: number | null = null;
    row.addEventListener("click", (event) => { if (clickTimer !== null) window.clearTimeout(clickTimer); clickTimer = window.setTimeout(() => { clickTimer = null; this.selectSideItem(item.id, event.ctrlKey || event.metaKey); }, 220); });
    row.addEventListener("dblclick", () => { if (clickTimer !== null) window.clearTimeout(clickTimer); clickTimer = null; void this.plugin.openSideItemPreview(item.id); });
  }

  private renderIndex(parent: HTMLElement, title: string, values: string[], prefix: string): void {
    parent.createEl("h4", { text: title }); const counts = new Map<string, number>(); for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    for (const [value, count] of [...counts].sort((a, b) => b[1] - a[1])) { const row = parent.createDiv({ cls: "cp-index-row" }); row.createSpan({ cls: "cp-chip", text: `${prefix}${value}` }); row.createSpan({ text: String(count) }); }
  }

  private items(workspaceId: string): PaletteItem[] { return this.plugin.store.itemsForWorkspace(workspaceId); }
  private applyLayoutVariables(root: HTMLElement, layout: SideLayoutState): void {
    root.style.setProperty("--cp-side-upper-left", `${layout.viewportRatio}fr`);
    root.style.setProperty("--cp-side-upper-right", `${1 - layout.viewportRatio}fr`);
    root.style.setProperty("--cp-side-upper", `${layout.topRatio}fr`);
    root.style.setProperty("--cp-side-lower", `${1 - layout.topRatio}fr`);
    root.style.setProperty("--cp-side-lower-left", `${layout.indexRatio}fr`);
    root.style.setProperty("--cp-side-lower-right", `${1 - layout.indexRatio}fr`);
  }
  private horizontalRatio(container: HTMLElement, divider: HTMLElement, clientX: number, leftMinimum: number, rightMinimum: number): number {
    const rect = container.getBoundingClientRect();
    const dividerWidth = divider.getBoundingClientRect().width;
    const available = Math.max(1, rect.width - dividerWidth);
    const minLeft = Math.min(leftMinimum, available * 0.4);
    const minRight = Math.min(rightMinimum, available * 0.4);
    const left = this.clamp(clientX - rect.left - dividerWidth / 2, minLeft, available - minRight);
    return left / available;
  }
  private verticalRatio(upper: HTMLElement, lower: HTMLElement, divider: HTMLElement, clientY: number): number {
    const upperRect = upper.getBoundingClientRect();
    const available = Math.max(1, upperRect.height + lower.getBoundingClientRect().height);
    const dividerHeight = divider.getBoundingClientRect().height;
    const minUpper = Math.min(230, available * 0.65);
    const minLower = Math.min(110, available * 0.3);
    const upperHeight = this.clamp(clientY - upperRect.top - dividerHeight / 2, minUpper, available - minLower);
    return upperHeight / available;
  }
  private clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, value)); }
  private setSideView(viewMode: "grid" | "list"): void { const workspace = this.plugin.activeWorkspace(); if (!workspace) return; workspace.sideLayout.viewMode = viewMode; this.plugin.store.changed(); }
  private promptCollection(workspaceId: string, parentId: string | null): void { new TextPromptModal(this.app, "New collection", "", (value) => this.plugin.store.createCollection(workspaceId, value, parentId), "Collection name").open(); }
  private itemMenu(event: MouseEvent, item: PaletteItem): void {
    event.preventDefault(); const menu = new Menu(); const workspace = this.plugin.activeWorkspace();
    const selected = this.sideSelectedIds(); const targetIds = selected.includes(item.id) ? selected : [item.id];
    if (!selected.includes(item.id)) this.selectSideItem(item.id, false);
    menu.addItem((entry) => entry.setTitle("Edit metadata").setIcon("tags").onClick(() => new TagLabelModal(this.app, this.plugin, targetIds).open()));
    menu.addItem((entry) => entry.setTitle(`Move ${targetIds.length > 1 ? `${targetIds.length} items` : "to workspace root"}`).setIcon("folder-root").onClick(() => workspace && this.plugin.store.assignItemsToCollection(workspace.id, targetIds, null)));
    if (workspace) for (const collection of Object.values(this.plugin.store.data.collections).filter((candidate) => candidate.workspaceId === workspace.id)) menu.addItem((entry) => entry.setTitle(`Move to ${collection.name}`).setIcon("folder-input").onClick(() => this.plugin.store.assignItemsToCollection(workspace.id, targetIds, collection.id)));
    menu.addItem((entry) => entry.setTitle("Open original").setIcon("external-link").onClick(() => void this.plugin.openOriginal(item)));
    if (item.origin.canvasPath && item.origin.canvasNodeId) menu.addItem((entry) => entry.setTitle("Locate on Canvas").setIcon("locate-fixed").onClick(() => void this.plugin.locateItemOnCanvas(item)));
    menu.addSeparator(); menu.addItem((entry) => entry.setTitle(`Delete${targetIds.length > 1 ? ` ${targetIds.length} items` : ""}`).setIcon("trash").onClick(() => this.confirmDelete(targetIds)));
    menu.showAtMouseEvent(event);
  }

  private sideSelectedIds(): string[] { return this.plugin.store.data.uiState.sideSelectedItemIds; }
  private selectSideItem(id: string, multiple: boolean): void {
    const selected = this.sideSelectedIds();
    this.plugin.store.data.uiState.sideSelectedItemIds = multiple ? (selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]) : [id];
    this.plugin.store.data.uiState.selectedItemId = id;
    this.plugin.store.changed();
  }
  private confirmDelete(ids: string[]): void { if (ids.length > 0) new ConfirmDeleteModal(this.app, ids.length, () => this.plugin.store.removeItems(ids)).open(); }
}
