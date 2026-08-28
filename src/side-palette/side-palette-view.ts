import { ItemView, Menu, WorkspaceLeaf } from "obsidian";
import type CanvasPalettePlugin from "../main";
import type { Collection, PaletteItem, SideLayoutState } from "../core/types";
import { ConfirmDeleteModal, MoveItemsModal, TagLabelModal, TextPromptModal } from "../ui/modal";
import { makeHorizontalDivider, makeVerticalDivider } from "../ui/resizable";
import { iconButton, renderItem, supportsFrontBack, workspaceSelect } from "../ui/render";
import { LinkedSpacesModal } from "../ui/linked-spaces-modal";
import { NativeMarkdownEditor } from "../editor/native-markdown-editor";

export const SIDE_PALETTE_VIEW = "canvas-palette-side";

export class SidePaletteView extends ItemView {
  private unsubscribe?: () => void;
  private query = "";
  private selectionAnchorId: string | null = null;
  private visibleItemIds: string[] = [];
  private suppressBlankClick = false;
  private viewSettingsOpen = false;
  private activeBackEditor: { itemId: string; close: (save: boolean) => Promise<void> } | null = null;
  private readonly scrollSelectors = [".cp-viewport", ".cp-outliner", ".cp-tag-index", ".cp-label-index"] as const;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: CanvasPalettePlugin) { super(leaf); }
  getViewType(): string { return SIDE_PALETTE_VIEW; }
  getDisplayText(): string { return "Canvas Palette"; }
  getIcon(): string { return "library-big"; }
  async onOpen(): Promise<void> { this.unsubscribe = this.plugin.store.subscribe(() => this.render()); this.render(); }
  async onClose(): Promise<void> { this.unsubscribe?.(); await this.activeBackEditor?.close(true); }

  revealItem(itemId: string): void {
    this.query = "";
    this.selectionAnchorId = itemId;
    this.plugin.store.data.uiState.sideSelectedItemIds = [itemId];
    this.plugin.store.data.uiState.selectedItemId = itemId;
    this.plugin.store.changed();
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const card = this.contentEl.querySelector<HTMLElement>(`.cp-item[data-item-id="${CSS.escape(itemId)}"]`);
      if (!card) return;
      card.scrollIntoView({ block: "center", inline: "nearest" });
      card.addClass("is-link-revealed");
      window.setTimeout(() => card.removeClass("is-link-revealed"), 1600);
    }));
  }

  private render(): void {
    if (this.activeBackEditor) return;
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
    workspaceSelect(this.plugin, selectorRow, workspace.id, (id) => { this.query = ""; this.plugin.store.data.uiState.activeWorkspaceId = id; this.plugin.store.changed(); });
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
    const tags = indexes.createDiv({ cls: "cp-panel cp-tag-index" }); this.renderIndex(tags, "Tag index", this.items(workspace.id).flatMap((item) => item.tags), "tag");
    const iDivider = indexes.createDiv({ cls: "cp-divider cp-divider--vertical" });
    makeHorizontalDivider(iDivider, (x) => {
      workspace.sideLayout.indexRatio = this.horizontalRatio(indexes, iDivider, x, 130, 130);
      this.applyLayoutVariables(root, workspace.sideLayout);
    }, () => this.plugin.store.changed());
    const labels = indexes.createDiv({ cls: "cp-panel cp-label-index" }); this.renderIndex(labels, "Label index", this.items(workspace.id).map((item) => item.label).filter(Boolean), "label");
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
    if (selectedIds.length > 0) {
      header.createSpan({ cls: "cp-selection-count", text: `Selected ${selectedIds.length}` });
      const remove = header.createEl("button", { text: "Delete", cls: "mod-warning" }); remove.addEventListener("click", () => this.confirmDelete(selectedIds));
    } else {
      const memo = header.createEl("button", { text: "+ Memo" }); memo.addEventListener("click", () => void this.plugin.createMemo());
      const grid = header.createEl("button", { text: "Grid", cls: this.plugin.activeWorkspace()?.sideLayout.viewMode === "grid" ? "is-active" : "" });
      const list = header.createEl("button", { text: "List", cls: this.plugin.activeWorkspace()?.sideLayout.viewMode === "list" ? "is-active" : "" });
      grid.addEventListener("click", () => this.setSideView("grid")); list.addEventListener("click", () => this.setSideView("list"));
    }
    const filters = parent.createDiv({ cls: "cp-viewport-filters" });
    const typeFilters = [["All", null], ["Image", "image"], ["MD", "markdown"], ["Card", "card"], ["Group", "group"]] as const;
    for (const [label, type] of typeFilters) {
      const token = type ? `type:${type}` : null;
      const active = token ? this.plugin.search.hasToken(this.query, token) : !/\btype:/i.test(this.query);
      const button = filters.createEl("button", { text: label, cls: active ? "is-active" : "", attr: { "aria-pressed": String(active) } });
      button.addEventListener("click", () => { this.query = this.plugin.search.setFacet(this.query, "type", active ? null : token); this.render(); });
    }
    const spaces = filters.createEl("button", { text: "Linked spaces", cls: /\bspace:/i.test(this.query) ? "is-active cp-linked-spaces-button" : "cp-linked-spaces-button" });
    spaces.addEventListener("click", () => new LinkedSpacesModal(this.app, this.items(workspaceId), this.query, (token) => this.plugin.search.hasToken(this.query, token), (token) => { this.query = this.plugin.search.setFacet(this.query, "space", token); this.render(); }, (itemIds, path) => this.plugin.store.unlinkItemsFromCanvas(itemIds, path)).open());
    const options = parent.createEl("details", { cls: "cp-view-options" });
    options.open = this.viewSettingsOpen;
    options.addEventListener("toggle", () => { this.viewSettingsOpen = options.open; });
    options.createEl("summary", { text: "View settings" });
    const controls = options.createDiv({ cls: "cp-view-options__controls" });
    const listEl = parent.createDiv({ cls: `cp-grid cp-grid--${this.plugin.activeWorkspace()?.sideLayout.viewMode ?? "grid"}` });
    const applyViewSettings = (): void => {
      listEl.style.setProperty("--cp-card-height", `${this.plugin.store.data.settings.cardHeight}px`);
      listEl.style.setProperty("--cp-font-size", `${this.plugin.store.data.settings.fontSize}px`);
      listEl.style.setProperty("--font-text-size", `${this.plugin.store.data.settings.fontSize}px`);
    };
    const rangeControl = (label: string, key: "cardHeight" | "fontSize", minimum: number, maximum: number, defaultValue: number): void => {
      const row = controls.createDiv({ cls: "cp-view-option" });
      const heading = row.createDiv({ cls: "cp-view-option__heading" });
      const name = heading.createEl("label", { text: label });
      const value = heading.createSpan({ cls: "cp-view-option__value" });
      const reset = heading.createEl("button", { text: "Reset", cls: "cp-view-option__reset" });
      const input = row.createEl("input", { attr: { type: "range", min: String(minimum), max: String(maximum), value: String(this.plugin.store.data.settings[key]), "aria-label": label } });
      name.htmlFor = input.id = `cp-side-${key}`;
      const update = (): void => {
        this.plugin.store.data.settings[key] = Number(input.value);
        value.setText(`${input.value}px`);
        applyViewSettings();
      };
      update();
      input.addEventListener("input", update);
      input.addEventListener("change", () => this.plugin.store.changed());
      reset.addEventListener("click", () => { input.value = String(defaultValue); update(); this.plugin.store.changed(); });
    };
    rangeControl("Card height", "cardHeight", 32, 220, 220);
    rangeControl("Preview font size", "fontSize", 8, 14, 14);
    applyViewSettings();
    this.mountViewportReorder(parent, listEl, workspaceId);
    const visibleItems = this.plugin.search.filter(this.items(workspaceId), this.query);
    this.visibleItemIds = visibleItems.map((item) => item.id);
    for (const item of visibleItems) {
      const facesEnabled = supportsFrontBack(item) && item.facesEnabled;
      const face = facesEnabled ? this.plugin.store.data.uiState.sideItemFaces[item.id] ?? "front" : "front";
      const card = renderItem(listEl, item, { selected: selectedIds.includes(item.id), showSelectionMarker: selectedIds.length > 1, currentFace: face, onToggleFace: facesEnabled ? (next) => this.plugin.store.setPaletteFace("side", item.id, next) : undefined, onSelect: (event) => this.selectSideItem(item.id, event), onOpen: () => face === "back" ? void this.openInlineBackEditor(item.id) : void this.plugin.openSideItemPreview(item.id), onLocate: () => void this.plugin.locateItemOnCanvas(item), draggable: true, onContextMenu: (event) => this.itemMenu(event, item) });
      const body = card.querySelector<HTMLElement>(".cp-item__body");
      if (body) {
        const compactLimit = Math.round(360 * 14 / this.plugin.store.data.settings.fontSize);
        const canBrowseFullBody = selectedIds.includes(item.id) && (face === "back" || item.type === "card" || item.type === "markdown");
        void this.plugin.preview.render(body, item, true, canBrowseFullBody ? Number.MAX_SAFE_INTEGER : compactLimit, face);
        if (canBrowseFullBody) this.mountBodyDragScroll(card, body);
      }
      card.addEventListener("wheel", (event) => {
        if (!selectedIds.includes(item.id) || (item.type !== "card" && item.type !== "markdown") || !body?.contains(event.target as Node)) return;
        event.preventDefault(); event.stopPropagation(); body.scrollTop += event.deltaY;
      }, { passive: false });
    }
    if (listEl.childElementCount === 0) listEl.createDiv({ cls: "cp-empty", text: "No matching items." });
    this.mountViewportSelection(parent, listEl);
  }

  private mountBodyDragScroll(card: HTMLElement, body: HTMLElement): void {
    body.addClass("is-pan-enabled");
    body.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const startY = event.clientY;
      const startScrollTop = body.scrollTop;
      let moved = false;
      card.draggable = false;
      body.setPointerCapture(event.pointerId);

      const move = (pointer: PointerEvent): void => {
        const delta = pointer.clientY - startY;
        if (!moved && Math.abs(delta) < 3) return;
        moved = true;
        pointer.preventDefault();
        pointer.stopPropagation();
        body.addClass("is-panning");
        body.scrollTop = startScrollTop - delta;
      };
      const finish = (pointer: PointerEvent): void => {
        if (body.hasPointerCapture(pointer.pointerId)) body.releasePointerCapture(pointer.pointerId);
        body.removeClass("is-panning");
        card.draggable = true;
        body.removeEventListener("pointermove", move);
        body.removeEventListener("pointerup", finish);
        body.removeEventListener("pointercancel", finish);
        if (moved) {
          pointer.preventDefault();
          pointer.stopPropagation();
          body.addEventListener("click", (click) => {
            click.preventDefault();
            click.stopImmediatePropagation();
          }, { capture: true, once: true });
        }
      };

      body.addEventListener("pointermove", move);
      body.addEventListener("pointerup", finish);
      body.addEventListener("pointercancel", finish);
    });
  }

  private async openInlineBackEditor(itemId: string): Promise<void> {
    if (this.activeBackEditor?.itemId === itemId) return;
    await this.activeBackEditor?.close(true);
    const item = this.plugin.store.data.items[itemId];
    const card = this.contentEl.querySelector<HTMLElement>(`.cp-item[data-item-id="${CSS.escape(itemId)}"]`);
    const body = card?.querySelector<HTMLElement>(".cp-item__body");
    if (!item || !card || !body || body.dataset.face !== "back") return;

    body.empty();
    body.removeClass("is-pan-enabled", "is-panning");
    body.addClass("is-back-editing");
    card.addClass("is-back-editing");
    card.draggable = false;
    const host = body.createDiv({ cls: "cp-side-back-editor cp-native-editor-host", attr: { "aria-label": `Edit ${item.displayTitle} back inside the Palette card` } });
    const editor = new NativeMarkdownEditor(this.app, { itemId, kind: "card", file: null, title: `${item.displayTitle} — Back`, initialText: item.backContent });
    const doc = body.ownerDocument;
    let finishing = false;
    const close = async (save: boolean): Promise<void> => {
      if (finishing) return;
      finishing = true;
      doc.removeEventListener("pointerdown", onOutsidePointer, true);
      host.removeEventListener("keydown", onKeyDown, true);
      const text = editor.getText();
      editor.detach();
      if (this.activeBackEditor?.itemId === itemId) this.activeBackEditor = null;
      if (save && text !== item.backContent) this.plugin.store.setItemBack(itemId, text);
      else this.render();
    };
    const onOutsidePointer = (event: PointerEvent): void => {
      if (!card.contains(event.target as Node)) window.setTimeout(() => void close(true), 0);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); void close(true); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        this.plugin.store.setItemBack(itemId, editor.getText());
      }
    };
    this.activeBackEditor = { itemId, close };
    host.addEventListener("pointerdown", (event) => event.stopPropagation());
    host.addEventListener("click", (event) => event.stopPropagation());
    host.addEventListener("dblclick", (event) => event.stopPropagation());
    host.addEventListener("keydown", onKeyDown, true);
    try {
      await editor.mount(host, false);
      window.requestAnimationFrame(() => editor.remeasure());
      window.setTimeout(() => doc.addEventListener("pointerdown", onOutsidePointer, true), 0);
    } catch (error) {
      editor.detach();
      this.activeBackEditor = null;
      this.render();
      console.error("Canvas Palette could not mount the Side Palette Back editor", error);
    }
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
    const showMarker = selected && this.sideSelectedIds().length > 1;
    const row = parent.createDiv({ cls: `cp-outline-item cp-outline-item--${item.type}${selected ? " is-selected" : ""}${this.query && this.plugin.search.matches(item, this.query) ? " is-match" : ""}`, attr: { style: `--cp-depth:${depth}` } }); row.dataset.itemId = item.id; row.setText(`${showMarker ? "✓ " : ""}${item.type.toUpperCase()}  ${item.displayTitle}`);
    let clickTimer: number | null = null;
    row.addEventListener("click", (event) => { if (clickTimer !== null) window.clearTimeout(clickTimer); clickTimer = window.setTimeout(() => { clickTimer = null; this.selectSideItem(item.id, event); }, 220); });
    row.addEventListener("dblclick", () => { if (clickTimer !== null) window.clearTimeout(clickTimer); clickTimer = null; void this.plugin.openSideItemPreview(item.id); });
  }

  private renderIndex(parent: HTMLElement, title: string, values: string[], kind: "tag" | "label"): void {
    parent.createEl("h4", { text: title }); const counts = new Map<string, number>(); for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    for (const [value, count] of [...counts].sort((a, b) => b[1] - a[1])) {
      const token = kind === "tag" ? `#${value}` : `label:"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
      const row = parent.createDiv({ cls: "cp-index-row" });
      const chip = row.createEl("button", { cls: `cp-chip cp-index-filter${this.plugin.search.hasToken(this.query, token) ? " is-active" : ""}`, text: kind === "tag" ? `#${value}` : value, attr: { "aria-pressed": String(this.plugin.search.hasToken(this.query, token)) } });
      chip.addEventListener("click", () => { this.query = this.plugin.search.toggleToken(this.query, token); this.render(); requestAnimationFrame(() => this.contentEl.querySelector<HTMLInputElement>(".cp-search")?.focus()); });
      row.createSpan({ text: String(count) });
    }
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
    if (!selected.includes(item.id)) this.selectSideItem(item.id);
    menu.addItem((entry) => entry.setTitle("Edit tags & label").setIcon("tags").onClick(() => new TagLabelModal(this.app, this.plugin, targetIds).open()));
    if (supportsFrontBack(item)) {
      menu.addItem((entry) => entry
        .setTitle(item.facesEnabled ? "Remove Front / Back" : "Enable Front / Back")
        .setIcon(item.facesEnabled ? "circle-off" : "refresh-cw")
        .onClick(() => item.facesEnabled ? this.plugin.store.disableItemFaces(item.id) : this.plugin.store.enableItemFaces(item.id)));
    }
    if (workspace) menu.addItem((entry) => entry.setTitle("Move to…").setIcon("folder-input").onClick(() => new MoveItemsModal(this.app, workspace.name, Object.values(this.plugin.store.data.collections).filter((candidate) => candidate.workspaceId === workspace.id), targetIds.length, (collectionId) => this.plugin.store.assignItemsToCollection(workspace.id, targetIds, collectionId)).open()));
    menu.addItem((entry) => entry.setTitle("Open original").setIcon("external-link").onClick(() => void this.plugin.openOriginal(item)));
    menu.addSeparator(); menu.addItem((entry) => entry.setTitle(`Delete${targetIds.length > 1 ? ` ${targetIds.length} items` : ""}`).setIcon("trash").onClick(() => this.confirmDelete(targetIds)));
    menu.showAtMouseEvent(event);
  }

  private sideSelectedIds(): string[] { return this.plugin.store.data.uiState.sideSelectedItemIds; }
  private selectSideItem(id: string, event?: Pick<MouseEvent | KeyboardEvent, "ctrlKey" | "metaKey" | "shiftKey">): void {
    const selected = this.sideSelectedIds();
    const toggle = Boolean(event?.ctrlKey || event?.metaKey);
    let next: string[];
    if (event?.shiftKey && this.selectionAnchorId) {
      const anchorIndex = this.visibleItemIds.indexOf(this.selectionAnchorId);
      const targetIndex = this.visibleItemIds.indexOf(id);
      const range = anchorIndex >= 0 && targetIndex >= 0 ? this.visibleItemIds.slice(Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex) + 1) : [id];
      next = toggle ? [...new Set([...selected, ...range])] : range;
    } else if (toggle) {
      next = selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id];
      this.selectionAnchorId = id;
    } else {
      next = [id];
      this.selectionAnchorId = id;
    }
    this.plugin.store.data.uiState.sideSelectedItemIds = next;
    this.plugin.store.data.uiState.selectedItemId = next.includes(id) ? id : next.at(-1) ?? null;
    this.plugin.store.changed();
  }
  private clearSideSelection(): void {
    if (this.sideSelectedIds().length === 0) return;
    this.selectionAnchorId = null;
    this.plugin.store.data.uiState.sideSelectedItemIds = [];
    this.plugin.store.data.uiState.selectedItemId = null;
    this.plugin.store.changed();
  }
  private mountViewportReorder(viewport: HTMLElement, listEl: HTMLElement, workspaceId: string): void {
    const overlay = document.createElement("div"); overlay.className = "cp-drop-overlay";
    let cards: Array<{ id: string; rect: DOMRect }> = [];
    let point: { x: number; y: number } | null = null;
    let frame = 0; let targetId: string | null = null; let insertAfter = false;
    const hide = (): void => { overlay.remove(); targetId = null; };
    const measure = (): void => { cards = Array.from(listEl.querySelectorAll<HTMLElement>(".cp-item:not(.is-dragging)")).flatMap((card) => card.dataset.itemId ? [{ id: card.dataset.itemId, rect: card.getBoundingClientRect() }] : []); };
    const draw = (): void => {
      frame = 0;
      if (!point) return;
      if (cards.length === 0) measure();
      const visible = cards.filter(({ rect }) => rect.bottom >= viewport.getBoundingClientRect().top && rect.top <= viewport.getBoundingClientRect().bottom);
      const nearest = visible.reduce<{ id: string; rect: DOMRect; distance: number } | null>((best, card) => {
        const dx = point!.x - (card.rect.left + card.rect.width / 2); const dy = point!.y - (card.rect.top + card.rect.height / 2);
        const distance = dx * dx + dy * dy;
        return !best || distance < best.distance ? { ...card, distance } : best;
      }, null);
      if (!nearest) { hide(); return; }
      const multiColumn = cards.some((card, index) => index > 0 && Math.abs(card.rect.top - cards[index - 1].rect.top) < 6);
      insertAfter = multiColumn ? point.x > nearest.rect.left + nearest.rect.width / 2 : point.y > nearest.rect.top + nearest.rect.height / 2;
      targetId = nearest.id;
      const style = multiColumn
        ? { left: `${insertAfter ? nearest.rect.right + 2 : nearest.rect.left - 6}px`, top: `${nearest.rect.top}px`, width: "4px", height: `${nearest.rect.height}px` }
        : { left: `${nearest.rect.left}px`, top: `${insertAfter ? nearest.rect.bottom + 2 : nearest.rect.top - 6}px`, width: `${nearest.rect.width}px`, height: "4px" };
      Object.assign(overlay.style, style);
      if (!overlay.isConnected) document.body.appendChild(overlay);
    };
    const schedule = (): void => { if (!frame) frame = requestAnimationFrame(draw); };
    const clear = (): void => { if (frame) cancelAnimationFrame(frame); frame = 0; point = null; cards = []; hide(); window.removeEventListener("keydown", onKeyDown, true); };
    const onKeyDown = (event: KeyboardEvent): void => { if (event.key === "Escape") clear(); };
    listEl.addEventListener("dragstart", () => { cards = []; window.addEventListener("keydown", onKeyDown, true); });
    listEl.addEventListener("dragover", (event) => { if (!event.dataTransfer?.types.includes("application/x-canvas-palette-item")) return; event.preventDefault(); point = { x: event.clientX, y: event.clientY }; schedule(); });
    listEl.addEventListener("dragleave", (event) => { if (!(event.relatedTarget instanceof Node) || !listEl.contains(event.relatedTarget)) hide(); });
    listEl.addEventListener("dragend", clear);
    listEl.addEventListener("drop", (event) => {
      const sourceId = event.dataTransfer?.getData("application/x-canvas-palette-item");
      if (sourceId && targetId) { event.preventDefault(); const id = targetId; const after = insertAfter; clear(); this.plugin.store.reorderItems(workspaceId, sourceId, id, after); }
      else clear();
    });
    viewport.addEventListener("scroll", () => { cards = []; if (point) schedule(); }, { passive: true });
  }
  private mountViewportSelection(viewport: HTMLElement, listEl: HTMLElement): void {
    viewport.addEventListener("click", (event) => {
      if (this.suppressBlankClick) { this.suppressBlankClick = false; return; }
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest(".cp-item,button,input,select,textarea,summary,a,.cp-view-options")) return;
      if (target === viewport) { const rect = viewport.getBoundingClientRect(); if (event.clientX >= rect.left + viewport.clientWidth) return; }
      this.clearSideSelection();
    });
    listEl.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target !== listEl) return;
      event.preventDefault();
      const start = { x: event.clientX, y: event.clientY };
      const baseSelection = event.ctrlKey || event.metaKey ? new Set(this.sideSelectedIds()) : new Set<string>();
      const rectangle = document.createElement("div");
      rectangle.className = "cp-selection-rectangle";
      document.body.appendChild(rectangle);
      let dragged = false;
      let lastHits: string[] = [];
      const move = (pointer: PointerEvent): void => {
        if (Math.hypot(pointer.clientX - start.x, pointer.clientY - start.y) < 4 && !dragged) return;
        dragged = true;
        const left = Math.min(start.x, pointer.clientX); const top = Math.min(start.y, pointer.clientY);
        const right = Math.max(start.x, pointer.clientX); const bottom = Math.max(start.y, pointer.clientY);
        Object.assign(rectangle.style, { display: "block", left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${bottom - top}px` });
        lastHits = [];
        for (const card of Array.from(listEl.querySelectorAll<HTMLElement>(".cp-item"))) {
          const rect = card.getBoundingClientRect();
          const hit = rect.right >= left && rect.left <= right && rect.bottom >= top && rect.top <= bottom;
          card.toggleClass("is-selected", hit || baseSelection.has(card.dataset.itemId ?? ""));
          if (hit && card.dataset.itemId) lastHits.push(card.dataset.itemId);
        }
      };
      const finish = (): void => {
        window.removeEventListener("pointermove", move, true); window.removeEventListener("pointerup", finish, true); window.removeEventListener("pointercancel", finish, true); rectangle.remove();
        this.suppressBlankClick = true;
        window.setTimeout(() => { this.suppressBlankClick = false; }, 0);
        if (!dragged) { this.clearSideSelection(); return; }
        const next = [...new Set([...baseSelection, ...lastHits])];
        this.plugin.store.data.uiState.sideSelectedItemIds = next;
        this.plugin.store.data.uiState.selectedItemId = next.at(-1) ?? null;
        this.selectionAnchorId = next.at(-1) ?? null;
        this.plugin.store.changed();
      };
      window.addEventListener("pointermove", move, true); window.addEventListener("pointerup", finish, true); window.addEventListener("pointercancel", finish, true);
    });
  }
  private confirmDelete(ids: string[]): void { if (ids.length > 0) new ConfirmDeleteModal(this.app, ids.length, () => this.plugin.store.removeItems(ids)).open(); }
}
