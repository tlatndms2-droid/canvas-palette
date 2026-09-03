import { ItemView, Menu, setIcon, WorkspaceLeaf } from "obsidian";
import type CanvasPalettePlugin from "../main";
import type { Collection, OutlineSelectionTarget, PaletteItem, SideLayoutState } from "../core/types";
import { CardToMarkdownModal, ConfirmDeleteCollectionModal, ConfirmDeleteModal, MoveItemsModal, TagLabelModal, TextPromptModal } from "../ui/modal";
import { makeHorizontalDivider, makeVerticalDivider } from "../ui/resizable";
import { iconButton, renderItem, supportsFrontBack, workspaceSelect } from "../ui/render";
import { LinkedSpacesModal } from "../ui/linked-spaces-modal";
import { NativeMarkdownEditor } from "../editor/native-markdown-editor";
import { applyAssetDensity, assetDensityLabel, ASSET_DENSITY_DEFAULT, ASSET_DENSITY_MAX, ASSET_DENSITY_MIN, nextAssetDensity } from "../ui/asset-density";
import { attachedFlyoutPlacement, sideLayoutMode, type SideLayoutMode } from "../ui/responsive-layout";

export const SIDE_PALETTE_VIEW = "canvas-palette-side";

export class SidePaletteView extends ItemView {
  private unsubscribe?: () => void;
  private query = "";
  private selectionAnchorId: string | null = null;
  /** Unified, visible-row Outliner selection. Collection selection deliberately stays out of persisted item state. */
  private outlineSelection: OutlineSelectionTarget[] = [];
  private outlineSelectionAnchorKey: string | null = null;
  private lastCollectionClick: { id: string; at: number } | null = null;
  private visibleItemIds: string[] = [];
  private outlineRows: OutlineSelectionTarget[] = [];
  private suppressBlankClick = false;
  private viewSettingsOpen = false;
  private outlinerSettingsOpen = false;
  private searchComposing = false;
  private searchAssistantOpen = false;
  private pendingReveal: "viewport" | "outliner" | null = null;
  private activeBackEditor: { itemId: string; close: (save: boolean) => Promise<void> } | null = null;
  private readonly scrollSelectors = [".cp-viewport", ".cp-outliner", ".cp-tag-index", ".cp-label-index"] as const;
  private readonly scrollMemory: Record<string, number> = {};
  private layoutMode: SideLayoutMode = "wide";
  private resizeObserver?: ResizeObserver;
  private indexesFlyoutOpen = false;
  private activeIndexTab: "tag" | "label" = "tag";
  private indexesFlyoutCleanup?: () => void;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: CanvasPalettePlugin) { super(leaf); }
  getViewType(): string { return SIDE_PALETTE_VIEW; }
  getDisplayText(): string { return "Canvas Palette"; }
  getIcon(): string { return "library-big"; }
  async onOpen(): Promise<void> { this.unsubscribe = this.plugin.store.subscribe(() => this.render()); this.render(); }
  async onClose(): Promise<void> { this.resizeObserver?.disconnect(); this.indexesFlyoutCleanup?.(); this.unsubscribe?.(); await this.activeBackEditor?.close(true); }

  revealItem(itemId: string): void {
    this.query = "";
    this.selectionAnchorId = itemId;
    this.outlineSelection = [{ kind: "item", id: itemId }];
    this.outlineSelectionAnchorKey = "item:" + itemId;
    const workspace = this.plugin.activeWorkspace();
    if (workspace) {
      const collection = Object.values(this.plugin.store.data.collections).find((entry) => entry.workspaceId === workspace.id && entry.itemIds.includes(itemId));
      workspace.sideLayout.selectedCollectionId = collection?.id ?? null;
      const expanded: string[] = []; let cursor = collection;
      while (cursor) { expanded.push(cursor.id); cursor = cursor.parentId ? this.plugin.store.data.collections[cursor.parentId] : undefined; }
      workspace.sideLayout.collapsedCollectionIds = workspace.sideLayout.collapsedCollectionIds.filter((id) => !expanded.includes(id));
    }
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
    if (this.activeBackEditor || this.searchComposing) return;
    const root = this.contentEl;
    const previousWorkspaceId = root.dataset.cpWorkspaceId;
    this.captureScrollMemory(root);
    this.resizeObserver?.disconnect(); this.resizeObserver = undefined;
    this.indexesFlyoutCleanup?.(); this.indexesFlyoutCleanup = undefined;
    root.empty(); root.addClass("canvas-palette", "cp-side", `cp-theme-${this.plugin.store.data.settings.theme}`);
    if (this.plugin.store.data.settings.accentMode === "custom") root.style.setProperty("--cp-accent", this.plugin.store.data.settings.accentColor);
    const workspace = this.plugin.activeWorkspace();
    if (!workspace) return;
    root.dataset.cpWorkspaceId = workspace.id;
    this.layoutMode = sideLayoutMode(root.clientWidth || root.parentElement?.clientWidth || window.innerWidth);
    root.dataset.layoutMode = this.layoutMode;
    if (this.layoutMode === "wide") this.indexesFlyoutOpen = false;
    this.applyLayoutVariables(root, workspace.sideLayout);
    this.renderHeader(root, workspace.id);
    this.renderSearch(root, workspace.id);
    if (this.layoutMode === "wide") this.renderWideLayout(root, workspace.id);
    else this.renderCompactLayout(root, workspace.id);
    if (previousWorkspaceId === workspace.id) {
      this.restoreScrollMemory(root);
    }
    this.observeResponsiveLayout(root);
    if (this.indexesFlyoutOpen && this.layoutMode !== "wide") this.renderIndexesFlyout(root, workspace.id);
    if (this.pendingReveal) {
      const target = this.pendingReveal; this.pendingReveal = null;
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        const id = this.plugin.store.data.uiState.selectedItemId; if (!id) return;
        const selector = target === "viewport" ? `.cp-item[data-item-id="${CSS.escape(id)}"]` : `.cp-outline-item[data-item-id="${CSS.escape(id)}"]`;
        this.contentEl.querySelector<HTMLElement>(selector)?.scrollIntoView({ block: "center", inline: "nearest" });
      }));
    }
  }

  private renderHeader(root: HTMLElement, workspaceId: string): void {
    const header = root.createDiv({ cls: "cp-side__header" });
    header.createDiv({ cls: "cp-brand", text: "Canvas Palette" });
    if (this.layoutMode === "wide") {
      const archive = header.createEl("button", { text: "Archive" });
      archive.addEventListener("click", () => this.plugin.openArchive());
    } else {
      const more = iconButton(header, "ellipsis", "More Canvas Palette actions", () => this.openHeaderMenu(more, workspaceId));
    }
    const selectorRow = root.createDiv({ cls: "cp-workspace-row" }); selectorRow.createSpan({ cls: "cp-workspace-label", text: "Current workspace" });
    workspaceSelect(this.plugin, selectorRow, workspaceId, (id) => { this.query = ""; this.plugin.store.data.uiState.activeWorkspaceId = id; this.plugin.store.changed(); });
    const currentCanvas = selectorRow.createEl("button", { cls: "cp-current-canvas-workspace", attr: { title: "Open current Canvas Workspace", "aria-label": "Open current Canvas Workspace" } });
    setIcon(currentCanvas.createSpan(), "locate-fixed"); currentCanvas.createSpan({ text: "Current Canvas" });
    currentCanvas.addEventListener("click", () => this.plugin.openCurrentCanvasWorkspace()); currentCanvas.disabled = !this.plugin.currentCanvasPath();
    if (this.layoutMode === "wide") {
      const manageWorkspace = iconButton(selectorRow, "folder-cog", "Open Workspace Explorer", () => this.plugin.openWorkspaceExplorer());
      manageWorkspace.addClass("cp-workspace-manage");
    }
    const canvasPath = this.plugin.currentCanvasPath();
    const missingCanvasWorkspace = Boolean(canvasPath && !this.plugin.store.representativeWorkspaceForCanvas(canvasPath));
    root.toggleClass("has-canvas-workspace-empty", missingCanvasWorkspace);
    if (canvasPath && missingCanvasWorkspace) {
      const empty = root.createDiv({ cls: "cp-current-canvas-empty" });
      empty.createDiv({ cls: "cp-current-canvas-empty__title", text: "이 Canvas에는 전용 Workspace가 연결되지 않았습니다" });
      empty.createDiv({ cls: "cp-current-canvas-empty__hint", text: "현재 선택한 Workspace는 계속 사용할 수 있습니다." });
      empty.createEl("button", { text: "전용 Workspace 만들기" }).addEventListener("click", () => this.plugin.openCanvasWorkspaceCreator(canvasPath));
    }
  }

  private openHeaderMenu(trigger: HTMLElement, workspaceId: string): void {
    const menu = new Menu();
    menu.addItem((entry) => entry.setTitle("Open Workspace Explorer").setIcon("folder-cog").onClick(() => this.plugin.openWorkspaceExplorer()));
    menu.addItem((entry) => entry.setTitle("Open Archive").setIcon("archive").onClick(() => this.plugin.openArchive()));
    menu.addItem((entry) => entry.setTitle("Open linked spaces").setIcon("network").onClick(() => this.openLinkedSpaces(workspaceId)));
    const rect = trigger.getBoundingClientRect(); menu.showAtPosition({ x: rect.right, y: rect.bottom });
  }

  private renderSearch(root: HTMLElement, workspaceId: string): HTMLElement {
    const searchWrap = root.createDiv({ cls: "cp-search-wrap" });
    const search = searchWrap.createEl("input", { cls: "cp-search", attr: { type: "search", placeholder: "Search files, groups, tags, labels…", autocomplete: "off" }, value: this.query });
    const refreshSearch = (): void => this.refreshSearchSurface(searchWrap, workspaceId);
    search.addEventListener("compositionstart", () => { this.searchComposing = true; });
    search.addEventListener("compositionend", () => { this.searchComposing = false; this.query = search.value.normalize("NFC"); search.value = this.query; queueMicrotask(refreshSearch); });
    search.addEventListener("input", (event) => { this.query = search.value; if (this.searchComposing || (event as InputEvent).isComposing) return; refreshSearch(); });
    search.addEventListener("keydown", (event) => { if (event.key === "ArrowDown") { event.preventDefault(); searchWrap.querySelector<HTMLButtonElement>(".cp-search-suggestion")?.focus(); } else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); this.searchAssistantOpen = false; this.renderSearchAssistant(searchWrap, workspaceId); } });
    search.addEventListener("focus", () => { this.searchAssistantOpen = true; this.renderSearchAssistant(searchWrap, workspaceId); });
    search.addEventListener("pointerdown", () => { if (!this.searchAssistantOpen) { this.searchAssistantOpen = true; this.renderSearchAssistant(searchWrap, workspaceId); } });
    root.onpointerdown = (event) => { if (this.searchAssistantOpen && !searchWrap.contains(event.target as Node)) { this.searchAssistantOpen = false; this.renderSearchAssistant(searchWrap, workspaceId); search.blur(); } };
    this.renderSearchAssistant(searchWrap, workspaceId);
    return searchWrap;
  }

  private renderWideLayout(root: HTMLElement, workspaceId: string): void {
    const workspace = this.plugin.store.data.workspaces[workspaceId]; if (!workspace) return;
    const top = root.createDiv({ cls: "cp-side__top" });
    const viewport = top.createDiv({ cls: "cp-panel cp-viewport" }); this.renderViewport(viewport, workspaceId);
    const vDivider = top.createDiv({ cls: "cp-divider cp-divider--vertical" });
    makeHorizontalDivider(vDivider, (x) => { workspace.sideLayout.viewportRatio = this.horizontalRatio(top, vDivider, x, 160, 180); this.applyLayoutVariables(root, workspace.sideLayout); }, () => this.plugin.store.changed());
    const outliner = top.createDiv({ cls: "cp-panel cp-outliner" }); this.renderOutliner(outliner, workspaceId);
    const hDivider = root.createDiv({ cls: "cp-divider cp-divider--horizontal" });
    const indexes = root.createDiv({ cls: "cp-side__indexes" });
    makeVerticalDivider(hDivider, (y) => { workspace.sideLayout.topRatio = this.verticalRatio(top, indexes, hDivider, y); this.applyLayoutVariables(root, workspace.sideLayout); }, () => this.plugin.store.changed());
    const tags = indexes.createDiv({ cls: "cp-panel cp-tag-index" }); this.renderIndex(tags, "Tag index", this.items(workspaceId).flatMap((item) => item.tags), "tag");
    const iDivider = indexes.createDiv({ cls: "cp-divider cp-divider--vertical" });
    makeHorizontalDivider(iDivider, (x) => { workspace.sideLayout.indexRatio = this.horizontalRatio(indexes, iDivider, x, 130, 130); this.applyLayoutVariables(root, workspace.sideLayout); }, () => this.plugin.store.changed());
    const labels = indexes.createDiv({ cls: "cp-panel cp-label-index" }); this.renderIndex(labels, "Label index", this.items(workspaceId).map((item) => item.label).filter(Boolean), "label");
  }

  private renderCompactLayout(root: HTMLElement, workspaceId: string): void {
    const workspace = this.plugin.store.data.workspaces[workspaceId]; if (!workspace) return;
    const tabList = root.createDiv({ cls: "cp-side-tabs", attr: { role: "tablist", "aria-label": "Canvas Palette content" } });
    for (const [id, label, icon] of [["viewport", "Viewport", "layout-grid"], ["outliner", "Outliner", "list-tree"]] as const) {
      const selected = workspace.sideLayout.responsiveTab === id;
      const tab = tabList.createEl("button", { cls: `cp-side-tab${selected ? " is-active" : ""}`, text: label, attr: { role: "tab", id: `cp-side-${id}-${workspaceId}`, "aria-selected": String(selected), "aria-controls": `cp-side-panel-${workspaceId}`, tabindex: selected ? "0" : "-1" } });
      setIcon(tab.createSpan({ cls: "cp-side-tab__icon" }), icon);
      tab.addEventListener("click", () => this.selectResponsiveTab(workspaceId, id));
      tab.addEventListener("keydown", (event) => this.handleResponsiveTabKeydown(event, workspaceId, id));
    }
    const indexes = tabList.createEl("button", { cls: "cp-side-indexes-trigger", text: "Indexes", attr: { type: "button", "aria-label": "Open Indexes flyout", "aria-controls": `cp-side-indexes-${workspaceId}`, "aria-expanded": String(this.indexesFlyoutOpen), "data-cp-indexes-trigger": "true" } });
    setIcon(indexes.createSpan({ cls: "cp-side-tab__icon" }), "tags");
    indexes.addEventListener("click", () => this.setIndexesFlyoutOpen(!this.indexesFlyoutOpen));
    const single = root.createDiv({ cls: "cp-side__single", attr: { id: `cp-side-panel-${workspaceId}`, role: "tabpanel", "aria-labelledby": `cp-side-${workspace.sideLayout.responsiveTab}-${workspaceId}` } });
    const panel = single.createDiv({ cls: `cp-panel ${workspace.sideLayout.responsiveTab === "viewport" ? "cp-viewport" : "cp-outliner"}` });
    if (workspace.sideLayout.responsiveTab === "viewport") this.renderViewport(panel, workspaceId); else this.renderOutliner(panel, workspaceId);
  }

  private selectResponsiveTab(workspaceId: string, tab: "viewport" | "outliner"): void {
    const workspace = this.plugin.store.data.workspaces[workspaceId]; if (!workspace || workspace.sideLayout.responsiveTab === tab) return;
    workspace.sideLayout.responsiveTab = tab;
    this.plugin.store.changed();
    queueMicrotask(() => this.contentEl.querySelector<HTMLElement>(`#cp-side-${tab}-${CSS.escape(workspaceId)}`)?.focus());
  }

  private handleResponsiveTabKeydown(event: KeyboardEvent, workspaceId: string, tab: "viewport" | "outliner"): void {
    const tabs: Array<"viewport" | "outliner"> = ["viewport", "outliner"];
    const index = tabs.indexOf(tab);
    let next: "viewport" | "outliner" | null = null;
    if (event.key === "ArrowLeft") next = tabs[(index + tabs.length - 1) % tabs.length];
    else if (event.key === "ArrowRight") next = tabs[(index + 1) % tabs.length];
    else if (event.key === "Home") next = tabs[0];
    else if (event.key === "End") next = tabs[tabs.length - 1];
    else if (event.key === "Enter" || event.key === " ") next = tab;
    if (!next) return;
    event.preventDefault(); this.selectResponsiveTab(workspaceId, next);
  }

  private setIndexesFlyoutOpen(open: boolean): void {
    if (this.layoutMode === "wide") return;
    this.indexesFlyoutOpen = open;
    this.render();
    queueMicrotask(() => {
      if (open) this.contentEl.ownerDocument.querySelector<HTMLElement>(".cp-side-indexes-flyout [role=tab]")?.focus();
      else this.contentEl.querySelector<HTMLElement>("[data-cp-indexes-trigger]")?.focus();
    });
  }

  private renderIndexesFlyout(root: HTMLElement, workspaceId: string): void {
    const doc = root.ownerDocument;
    const rootRect = root.getBoundingClientRect();
    const placement = attachedFlyoutPlacement(window.innerWidth, rootRect.left, rootRect.width, "left", 320);
    const flyout = doc.body.createDiv({ cls: `canvas-palette cp-side-indexes-flyout cp-theme-${this.plugin.store.data.settings.theme} is-${placement.side}`, attr: { id: `cp-side-indexes-${workspaceId}`, role: "dialog", "aria-label": "Indexes" } });
    flyout.style.width = `${placement.width}px`;
    flyout.style.top = `${Math.max(8, rootRect.top)}px`;
    flyout.style.height = `${Math.max(180, Math.min(rootRect.height, window.innerHeight - Math.max(8, rootRect.top) - 8))}px`;
    flyout.style.left = `${placement.side === "left" ? Math.max(8, rootRect.left - placement.width - 8) : Math.min(window.innerWidth - placement.width - 8, rootRect.right + 8)}px`;
    if (this.plugin.store.data.settings.accentMode === "custom") flyout.style.setProperty("--cp-accent", this.plugin.store.data.settings.accentColor);
    const heading = flyout.createDiv({ cls: "cp-side-indexes-flyout__header" }); heading.createEl("h4", { text: "Indexes" });
    iconButton(heading, "x", "Close Indexes flyout", () => this.setIndexesFlyoutOpen(false));
    const tabs = flyout.createDiv({ cls: "cp-index-tabs", attr: { role: "tablist", "aria-label": "Index type" } });
    for (const [kind, label] of [["tag", "Tags"], ["label", "Labels"]] as const) {
      const selected = this.activeIndexTab === kind;
      const tab = tabs.createEl("button", { cls: selected ? "is-active" : "", text: label, attr: { role: "tab", "aria-selected": String(selected), tabindex: selected ? "0" : "-1" } });
      tab.addEventListener("click", () => this.selectIndexTab(kind));
      tab.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End", "Enter", " "].includes(event.key)) return;
        event.preventDefault(); this.selectIndexTab(event.key === "ArrowLeft" || event.key === "End" ? "label" : "tag");
      });
    }
    const panel = flyout.createDiv({ cls: `cp-panel cp-${this.activeIndexTab}-index` });
    if (this.activeIndexTab === "tag") this.renderIndex(panel, "Tag index", this.items(workspaceId).flatMap((item) => item.tags), "tag", false);
    else this.renderIndex(panel, "Label index", this.items(workspaceId).map((item) => item.label).filter(Boolean), "label", false);
    const onPointerDown = (event: PointerEvent): void => {
      if (flyout.contains(event.target as Node) || root.contains(event.target as Node)) return;
      window.setTimeout(() => this.setIndexesFlyoutOpen(false), 0);
    };
    const onKeydown = (event: KeyboardEvent): void => { if (event.key === "Escape") { event.preventDefault(); this.setIndexesFlyoutOpen(false); } };
    doc.addEventListener("pointerdown", onPointerDown, true); doc.addEventListener("keydown", onKeydown, true);
    this.indexesFlyoutCleanup = () => { doc.removeEventListener("pointerdown", onPointerDown, true); doc.removeEventListener("keydown", onKeydown, true); flyout.remove(); };
  }

  private selectIndexTab(tab: "tag" | "label"): void {
    if (this.activeIndexTab === tab) return;
    this.activeIndexTab = tab;
    this.render();
    queueMicrotask(() => this.contentEl.ownerDocument.querySelector<HTMLElement>(`.cp-side-indexes-flyout [role=tab][aria-selected="true"]`)?.focus());
  }

  private captureScrollMemory(root: HTMLElement): void {
    for (const selector of this.scrollSelectors) {
      const panel = root.querySelector<HTMLElement>(selector);
      if (panel) this.scrollMemory[selector] = panel.scrollTop;
    }
  }

  private restoreScrollMemory(root: HTMLElement): void {
    for (const selector of this.scrollSelectors) {
      const panel = root.querySelector<HTMLElement>(selector);
      if (panel && this.scrollMemory[selector] !== undefined) panel.scrollTop = this.scrollMemory[selector];
    }
  }

  private observeResponsiveLayout(root: HTMLElement): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? root.clientWidth;
      const next = sideLayoutMode(width);
      if (next === this.layoutMode) return;
      this.layoutMode = next;
      if (next === "wide") this.indexesFlyoutOpen = false;
      this.render();
    });
    this.resizeObserver.observe(root);
  }

  private renderSearchAssistant(parent: HTMLElement, workspaceId: string): void {
    parent.querySelectorAll(":scope > .cp-search-chips, :scope > .cp-search-assistant").forEach((element) => element.remove());
    const facetTokens = this.plugin.search.tokens(this.query).filter((token) => /^(tag|label|type|group|file|path|space):/i.test(token));
    if (facetTokens.length > 0) {
      const chips = parent.createDiv({ cls: "cp-search-chips" });
      for (const token of facetTokens) {
        const chip = chips.createEl("button", { cls: "cp-search-chip", text: token });
        chip.createSpan({ text: " ×" });
        chip.addEventListener("click", () => { this.query = this.plugin.search.toggleToken(this.query, token); const search = parent.querySelector<HTMLInputElement>(".cp-search"); if (search) search.value = this.query; this.refreshSearchSurface(parent, workspaceId); });
      }
    }
    if (!this.searchAssistantOpen) return;
    const facetMatch = this.query.match(/(?:^|\s)(tag|label|type|group|file|path|space):([^\s]*)$/i);
    const assistant = parent.createDiv({ cls: "cp-search-assistant is-visible" });
    if (!facetMatch) {
      assistant.createDiv({ cls: "cp-search-assistant__title", text: "Search options" });
      const options = [
        ["tag:", "Search tags"], ["label:", "Search labels"], ["type:", "Search item types"], ["group:", "Search group names"],
        ["file:", "Search file names"], ["path:", "Search original file paths"], ["space:", "Search linked Canvases"]
      ];
      for (const [token, description] of options) this.searchSuggestion(assistant, token, description, () => this.appendSearchFacet(token));
      return;
    }
    const facet = facetMatch[1].toLocaleLowerCase();
    const rawFragment = facetMatch[2].replace(/^"|"$/g, "").toLocaleLowerCase();
    const fragment = facet === "tag" ? rawFragment.replace(/^#/, "") : rawFragment;
    const facetStart = facetMatch.index! + (facetMatch[0].startsWith(" ") ? 1 : 0);
    const precedingQuery = this.query.slice(0, facetStart).trim();
    const items = this.plugin.search.filter(this.items(workspaceId), precedingQuery, (item) => this.searchContextForItem(workspaceId, item));
    const counts = new Map<string, number>();
    const addValues = (values: string[]): void => { for (const clean of new Set(values.map((value) => value.trim()).filter((value) => value && value.toLocaleLowerCase().includes(fragment)))) counts.set(clean, (counts.get(clean) ?? 0) + 1); };
    for (const item of items) {
      if (facet === "tag") addValues(item.tags);
      else if (facet === "label") addValues([item.label]);
      else if (facet === "type") addValues([item.type]);
      else if (facet === "file") addValues([item.displayTitle]);
      else if (facet === "path") addValues([item.origin.filePath ?? ""]);
      else if (facet === "space") addValues([item.origin.canvasPath && item.origin.canvasNodeId ? item.origin.canvasPath : "", ...item.canvasPlacements.filter((placement) => placement.nodeIds.length > 0).map((placement) => placement.canvasPath)]);
      else if (facet === "group") addValues(this.searchContextForItem(workspaceId, item).groupNames ?? []);
    }
    assistant.createDiv({ cls: "cp-search-assistant__title", text: `Matching ${facet}` });
    const values = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12);
    if (values.length === 0) assistant.createDiv({ cls: "cp-search-assistant__empty", text: "No matching suggestions." });
    for (const [value, count] of values) this.searchSuggestion(assistant, facet === "tag" ? `#${value.replace(/^#/, "")}` : value, String(count), () => {
      const normalizedValue = facet === "tag" ? value.replace(/^#/, "") : value;
      const encoded = /\s/.test(normalizedValue) ? `"${normalizedValue.replace(/"/g, '\\"')}"` : normalizedValue;
      this.query = `${this.query.slice(0, facetMatch.index! + (facetMatch[0].startsWith(" ") ? 1 : 0))}${facet}:${encoded}`.trim();
      const search = parent.querySelector<HTMLInputElement>(".cp-search"); if (search) search.value = this.query;
      this.searchAssistantOpen = false;
      this.refreshSearchSurface(parent, workspaceId);
    });
  }

  private searchSuggestion(parent: HTMLElement, label: string, description: string, action: () => void): void {
    const button = parent.createEl("button", { cls: "cp-search-suggestion" });
    button.createSpan({ cls: "cp-search-suggestion__label", text: label }); button.createSpan({ cls: "cp-search-suggestion__description", text: description });
    button.addEventListener("click", action);
    button.addEventListener("keydown", (event) => { if (event.key === "ArrowDown") { event.preventDefault(); (button.nextElementSibling as HTMLElement | null)?.focus(); } else if (event.key === "ArrowUp") { event.preventDefault(); const previous = button.previousElementSibling as HTMLElement | null; if (previous?.matches("button")) previous.focus(); else this.contentEl.querySelector<HTMLInputElement>(".cp-search")?.focus(); } });
  }

  private appendSearchFacet(token: string): void {
    this.query = `${this.query.trim()}${this.query.trim() ? " " : ""}${token}`;
    const parent = this.contentEl.querySelector<HTMLElement>(".cp-search-wrap"); const search = parent?.querySelector<HTMLInputElement>(".cp-search");
    if (!parent || !search) return;
    search.value = this.query; this.searchAssistantOpen = true; this.refreshSearchSurface(parent, this.plugin.activeWorkspace()?.id ?? ""); search.focus(); search.setSelectionRange(search.value.length, search.value.length);
  }

  private refreshSearchSurface(searchWrap: HTMLElement, workspaceId: string): void {
    this.renderSearchAssistant(searchWrap, workspaceId);
    const viewport = this.contentEl.querySelector<HTMLElement>(".cp-viewport");
    if (!viewport) return;
    const scrollTop = viewport.scrollTop;
    viewport.empty(); this.renderViewport(viewport, workspaceId); viewport.scrollTop = scrollTop;
  }

  private searchContextForItem(workspaceId: string, item: PaletteItem): { groupNames: string[]; unlinked: boolean } {
    const names: string[] = []; let cursor = item.parentItemId ? this.plugin.store.data.items[item.parentItemId] : undefined;
    while (cursor) { names.push(cursor.displayTitle); cursor = cursor.parentItemId ? this.plugin.store.data.items[cursor.parentItemId] : undefined; }
    let rootId = item.id; let root = item;
    while (root.parentItemId && this.plugin.store.data.items[root.parentItemId]) { rootId = root.parentItemId; root = this.plugin.store.data.items[root.parentItemId]; }
    let collection = Object.values(this.plugin.store.data.collections).find((entry) => entry.workspaceId === workspaceId && entry.itemIds.includes(rootId));
    while (collection) { names.push(collection.name); collection = collection.parentId ? this.plugin.store.data.collections[collection.parentId] : undefined; }
    return { groupNames: [...new Set(names)], unlinked: !this.plugin.store.itemLinkedToWorkspace(item, workspaceId) };
  }

  private renderViewport(parent: HTMLElement, workspaceId: string): void {
    const header = parent.createDiv({ cls: "cp-panel__header" }); header.createEl("h4", { text: "Viewport" });
    const selectedIds = this.sideSelectedIds().filter((id) => this.plugin.store.data.items[id]);
    if (selectedIds.length > 0) {
      header.createSpan({ cls: "cp-selection-count", text: `Selected ${selectedIds.length}` });
      const remove = iconButton(header, "trash-2", `Delete ${selectedIds.length} selected item${selectedIds.length === 1 ? "" : "s"}`, () => this.confirmDelete(selectedIds));
      remove.addClass("mod-warning", "cp-selection-delete");
    }
    const filters = parent.createDiv({ cls: "cp-viewport-filters" });
    const typeFilters = [["All", null], ["Image", "image"], ["MD", "markdown"], ["Card", "card"], ["Link", "link"], ["Group", "group"]] as const;
    for (const [label, type] of typeFilters) {
      const token = type ? `type:${type}` : null;
      const active = token ? this.plugin.search.hasToken(this.query, token) : !/\btype:/i.test(this.query);
      const button = filters.createEl("button", { text: label, cls: active ? "is-active" : "", attr: { "aria-pressed": String(active) } });
      button.addEventListener("click", () => { this.query = this.plugin.search.setFacet(this.query, "type", active ? null : token); this.render(); });
    }
    const unlinkedActive = this.plugin.search.hasToken(this.query, "unlinked");
    const unlinked = filters.createEl("button", { text: "Unlinked", cls: unlinkedActive ? "is-active cp-unlinked-filter" : "cp-unlinked-filter", attr: { "aria-pressed": String(unlinkedActive), title: "Show items with no Canvas link" } });
    unlinked.addEventListener("click", () => { this.query = this.plugin.search.toggleToken(this.query, "unlinked"); this.render(); });
    const spaces = filters.createEl("button", { text: "Linked spaces", cls: /\bspace:/i.test(this.query) ? "is-active cp-linked-spaces-button" : "cp-linked-spaces-button" });
    spaces.addEventListener("click", () => this.openLinkedSpaces(workspaceId));
    const tools = parent.createDiv({ cls: "cp-viewport-tools" });
    const options = tools.createEl("details", { cls: "cp-view-options" });
    options.open = this.viewSettingsOpen;
    options.addEventListener("toggle", () => { this.viewSettingsOpen = options.open; });
    options.createEl("summary", { text: "View settings" });
    const controls = options.createDiv({ cls: "cp-view-options__controls" });
    const viewSwitch = controls.createDiv({ cls: "cp-view-switch" });
    const grid = viewSwitch.createEl("button", { text: "Grid", cls: this.plugin.activeWorkspace()?.sideLayout.viewMode === "grid" ? "is-active" : "" });
    const list = viewSwitch.createEl("button", { text: "List", cls: this.plugin.activeWorkspace()?.sideLayout.viewMode === "list" ? "is-active" : "" });
    grid.addEventListener("click", () => this.setSideView("grid")); list.addEventListener("click", () => this.setSideView("list"));
    const memo = tools.createEl("button", { text: "+ Memo", cls: "cp-viewport-memo" }); memo.addEventListener("click", () => void this.plugin.createMemo());
    const workspaceLayout = this.plugin.activeWorkspace()?.sideLayout;
    const listEl = parent.createDiv({ cls: "cp-grid" });
    const applyViewSettings = (): void => {
      if (workspaceLayout) {
        workspaceLayout.densityLevel = applyAssetDensity(listEl, workspaceLayout.densityLevel, "cp-grid");
        workspaceLayout.viewMode = workspaceLayout.densityLevel === 0 ? "list" : "grid";
      }
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
    if (workspaceLayout) {
      const row = controls.createDiv({ cls: "cp-view-option" });
      const heading = row.createDiv({ cls: "cp-view-option__heading" });
      const name = heading.createEl("label", { text: "Item size" });
      const value = heading.createSpan({ cls: "cp-view-option__value" });
      const reset = heading.createEl("button", { text: "Reset", cls: "cp-view-option__reset" });
      const input = row.createEl("input", { attr: { type: "range", min: String(ASSET_DENSITY_MIN), max: String(ASSET_DENSITY_MAX), step: "1", value: String(workspaceLayout.densityLevel), "aria-label": "Item size" } });
      name.htmlFor = input.id = "cp-side-density";
      const updateDensity = (): void => { workspaceLayout.densityLevel = Number(input.value); value.setText(assetDensityLabel(workspaceLayout.densityLevel)); applyViewSettings(); };
      updateDensity();
      input.addEventListener("input", updateDensity);
      input.addEventListener("change", () => this.plugin.store.changed());
      reset.addEventListener("click", () => { input.value = String(ASSET_DENSITY_DEFAULT); updateDensity(); this.plugin.store.changed(); });
    }
    rangeControl("Preview font size", "fontSize", 8, 14, 14);
    applyViewSettings();
    listEl.addEventListener("wheel", (event) => { if ((!event.ctrlKey && !event.metaKey) || !workspaceLayout) return; event.preventDefault(); event.stopPropagation(); workspaceLayout.densityLevel = nextAssetDensity(workspaceLayout.densityLevel, event.deltaY); applyViewSettings(); this.plugin.store.changed(); }, { passive: false });
    this.mountViewportReorder(parent, listEl, workspaceId);
    const visibleItems = this.plugin.search.filter(this.itemsForViewportScope(workspaceId), this.query, (item) => this.searchContextForItem(workspaceId, item));
    const workspace = this.plugin.store.data.workspaces[workspaceId];
    const collection = workspace.sideLayout.focusedCollectionId ? this.plugin.store.data.collections[workspace.sideLayout.focusedCollectionId] : null;
    parent.createDiv({ cls: "cp-viewport-scope", text: `${collection?.name ?? workspace.name} · ${visibleItems.length} items` });
    this.visibleItemIds = visibleItems.map((item) => item.id);
    const visibleSet = new Set(visibleItems.map((item) => item.id));
    const renderCard = (host: HTMLElement, item: PaletteItem): void => {
      const facesEnabled = supportsFrontBack(item) && item.facesEnabled;
      const face = facesEnabled ? this.plugin.store.data.uiState.sideItemFaces[item.id] ?? "front" : "front";
      const card = renderItem(host, item, { selected: selectedIds.includes(item.id), showSelectionMarker: selectedIds.length > 1, dragItemIds: selectedIds, currentFace: face, unlinked: !this.plugin.store.itemLinkedToWorkspace(item, workspaceId), markdownSourceStatus: this.plugin.markdownSourceStatus(item), onMarkdownSourceStatus: (event) => this.plugin.showMarkdownSourceMenu(item, event), onToggleFace: facesEnabled ? (next) => this.plugin.store.setPaletteFace("side", item.id, next) : undefined, onSelect: (event) => { this.pendingReveal = "outliner"; this.selectSideItem(item.id, event); }, onOpen: () => face === "back" ? void this.openInlineBackEditor(item.id) : void this.plugin.openSideItemPreview(item.id), onLocate: () => this.plugin.findLinkedCanvas(item), draggable: true, onContextMenu: (event) => this.itemMenu(event, item) });
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
    };
    const renderItemTree = (host: HTMLElement, itemId: string): void => {
      const item = this.plugin.store.data.items[itemId]; if (!item) return;
      const descendantIds: string[] = [];
      const collect = (id: string): void => { const current = this.plugin.store.data.items[id]; if (!current) return; if (visibleSet.has(id)) descendantIds.push(id); for (const child of current.childItemIds ?? []) collect(child); };
      collect(itemId); if (descendantIds.length === 0) return;
      if ((item.childItemIds ?? []).length === 0) { if (visibleSet.has(item.id)) renderCard(host, item); return; }
      const group = host.createDiv({ cls: "cp-viewport-group cp-viewport-file-group" });
      const head = group.createDiv({ cls: "cp-viewport-group__header" });
      const collapsed = workspace.sideLayout.collapsedItemIds.includes(item.id);
      const arrow = head.createEl("button", { cls: "cp-outline-arrow", attr: { "aria-label": collapsed ? "Expand Viewport group" : "Collapse Viewport group" } }); setIcon(arrow, collapsed ? "chevron-right" : "chevron-down");
      arrow.addEventListener("click", () => { workspace.sideLayout.collapsedItemIds = collapsed ? workspace.sideLayout.collapsedItemIds.filter((id) => id !== item.id) : [...workspace.sideLayout.collapsedItemIds, item.id]; this.plugin.store.changed(); });
      head.createSpan({ cls: "cp-viewport-group__title", text: item.displayTitle }); head.createSpan({ cls: "cp-viewport-group__count", text: `${descendantIds.length} items` });
      head.addEventListener("dblclick", () => { this.pendingReveal = "outliner"; this.selectSideItem(item.id); });
      if (!collapsed) { const body = group.createDiv({ cls: "cp-viewport-group__body" }); for (const id of descendantIds) { const child = this.plugin.store.data.items[id]; if (child) renderCard(body, child); } }
    };
    const collectionItems = (collectionId: string): string[] => { const ids: string[] = []; const walk = (id: string): void => { const current = this.plugin.store.data.collections[id]; if (!current) return; ids.push(...current.itemIds); if (workspace.sideLayout.outlinerIncludeDescendants) for (const child of current.childCollectionIds) walk(child); }; walk(collectionId); return ids; };
    if (!collection) {
      const groupedIds = new Set<string>();
      for (const collectionId of workspace.rootCollectionIds) {
        const current = this.plugin.store.data.collections[collectionId]; if (!current) continue;
        const roots = collectionItems(collectionId); const matches = roots.flatMap((id) => { const result: string[] = []; const walk = (itemId: string): void => { if (visibleSet.has(itemId)) result.push(itemId); for (const child of this.plugin.store.data.items[itemId]?.childItemIds ?? []) walk(child); }; walk(id); return result; });
        if (matches.length === 0) continue; matches.forEach((id) => groupedIds.add(id));
        const group = listEl.createDiv({ cls: "cp-viewport-group" }); const head = group.createDiv({ cls: "cp-viewport-group__header" });
        const collapsed = workspace.sideLayout.collapsedCollectionIds.includes(collectionId); const arrow = head.createEl("button", { cls: "cp-outline-arrow" }); setIcon(arrow, collapsed ? "chevron-right" : "chevron-down"); arrow.addEventListener("click", () => { workspace.sideLayout.collapsedCollectionIds = collapsed ? workspace.sideLayout.collapsedCollectionIds.filter((id) => id !== collectionId) : [...workspace.sideLayout.collapsedCollectionIds, collectionId]; this.plugin.store.changed(); });
        head.createSpan({ cls: "cp-viewport-group__title", text: current.name }); head.createSpan({ cls: "cp-viewport-group__count", text: `${matches.length} items` }); head.addEventListener("dblclick", () => { workspace.sideLayout.focusedCollectionId = collectionId; workspace.sideLayout.selectedCollectionId = collectionId; this.plugin.store.changed(); });
        if (!collapsed) { const body = group.createDiv({ cls: "cp-viewport-group__body" }); for (const rootId of roots) renderItemTree(body, rootId); }
      }
      for (const rootId of workspace.looseItemIds) renderItemTree(listEl, rootId);
    } else {
      for (const rootId of collection.itemIds) renderItemTree(listEl, rootId);
      if (workspace.sideLayout.outlinerIncludeDescendants) for (const childCollectionId of collection.childCollectionIds) for (const rootId of collectionItems(childCollectionId)) renderItemTree(listEl, rootId);
    }
    if (listEl.childElementCount === 0) { const empty = listEl.createDiv({ cls: "cp-empty cp-search-empty" }); empty.createDiv({ text: "No matching items." }); if (this.query.trim()) { empty.createDiv({ cls: "cp-search-empty__query", text: `Current search: ${this.query}` }); const reset = empty.createEl("button", { text: "Clear search" }); reset.addEventListener("click", () => { this.query = ""; this.render(); }); } }
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
    parent.style.setProperty("--cp-outline-height", `${workspace.sideLayout.outlinerItemHeight}px`);
    parent.style.setProperty("--cp-outline-font", `${workspace.sideLayout.outlinerFontSize}px`);
    parent.toggleClass("is-wrap-titles", workspace.sideLayout.outlinerWrapTitles);
    const options = parent.createEl("details", { cls: "cp-outline-options" }); options.open = this.outlinerSettingsOpen;
    options.addEventListener("toggle", () => { this.outlinerSettingsOpen = options.open; }); options.createEl("summary", { text: "Outliner settings" });
    const addRange = (label: string, key: "outlinerItemHeight" | "outlinerFontSize", min: number, max: number): void => {
      const row = options.createDiv({ cls: "cp-outline-option" }); row.createSpan({ text: label }); const value = row.createSpan({ text: `${workspace.sideLayout[key]}px` });
      const input = row.createEl("input", { attr: { type: "range", min: String(min), max: String(max), value: String(workspace.sideLayout[key]) } });
      input.addEventListener("input", () => { workspace.sideLayout[key] = Number(input.value); value.setText(`${input.value}px`); parent.style.setProperty(key === "outlinerItemHeight" ? "--cp-outline-height" : "--cp-outline-font", `${input.value}px`); });
      input.addEventListener("change", () => this.plugin.store.changed());
    };
    addRange("Row height", "outlinerItemHeight", 24, 44); addRange("Font size", "outlinerFontSize", 11, 16);
    for (const [label, key] of [["Include nested collections", "outlinerIncludeDescendants"], ["Wrap long titles", "outlinerWrapTitles"]] as const) {
      const row = options.createEl("label", { cls: "cp-outline-toggle" }); const input = row.createEl("input", { attr: { type: "checkbox" } }); input.checked = workspace.sideLayout[key]; row.createSpan({ text: label });
      input.addEventListener("change", () => { workspace.sideLayout[key] = input.checked; this.plugin.store.changed(); });
    }
    const breadcrumb = parent.createDiv({ cls: "cp-outline-breadcrumb" });
    const path: Collection[] = []; let cursor = workspace.sideLayout.focusedCollectionId ? this.plugin.store.data.collections[workspace.sideLayout.focusedCollectionId] : undefined;
    while (cursor) { path.unshift(cursor); cursor = cursor.parentId ? this.plugin.store.data.collections[cursor.parentId] : undefined; }
    const crumb = (name: string, id: string | null): void => { const button = breadcrumb.createEl("button", { text: name }); button.addEventListener("click", () => { workspace.sideLayout.focusedCollectionId = id; workspace.sideLayout.selectedCollectionId = id; this.plugin.store.changed(); }); };
    crumb(workspace.name, null); for (const entry of path) { breadcrumb.createSpan({ text: "›" }); crumb(entry.name, entry.id); }
    this.outlineRows = [];
    const rootRow = parent.createDiv({ cls: `cp-outline-root${workspace.sideLayout.selectedCollectionId === null ? " is-selected" : ""}`, text: workspace.sideLayout.focusedCollectionId ? "Current collection" : workspace.name });
    rootRow.addEventListener("click", () => { workspace.sideLayout.selectedCollectionId = workspace.sideLayout.focusedCollectionId; this.plugin.store.changed(); });
    this.mountOutlineDropTarget(rootRow, workspaceId, null);
    const focused = workspace.sideLayout.focusedCollectionId ? this.plugin.store.data.collections[workspace.sideLayout.focusedCollectionId] : null;
    const collectionIds = focused?.childCollectionIds ?? workspace.rootCollectionIds; const itemIds = focused?.itemIds ?? workspace.looseItemIds;
    for (const id of collectionIds) this.renderCollection(parent, this.plugin.store.data.collections[id], 0);
    for (const item of itemIds.map((id) => this.plugin.store.data.items[id]).filter((item): item is PaletteItem => Boolean(item))) this.renderOutlineItem(parent, item, 0, focused?.id ?? null);
  }

  private openLinkedSpaces(workspaceId: string): void {
    new LinkedSpacesModal(this.app, this.items(workspaceId), this.query, (token) => this.plugin.search.hasToken(this.query, token), (token) => {
      this.query = this.plugin.search.setFacet(this.query, "space", token);
      this.render();
    }, (itemIds, path) => this.plugin.store.unlinkItemsFromCanvas(itemIds, path)).open();
  }

  private renderCollection(parent: HTMLElement, collection: Collection | undefined, depth: number): void {
    if (!collection) return;
    const target: OutlineSelectionTarget = { kind: "collection", id: collection.id };
    this.outlineRows.push(target);
    const layout = this.plugin.store.data.workspaces[collection.workspaceId].sideLayout; const collapsed = layout.collapsedCollectionIds.includes(collection.id);
    const row = parent.createDiv({ cls: `cp-outline-row${this.outlineTargetSelected(target) ? " is-selected" : ""}${layout.focusedCollectionId === collection.id ? " is-current" : ""}`, attr: { style: `--cp-depth:${depth}`, title: "한 번 클릭: 선택 · Ctrl: 추가/해제 · Shift: 보이는 행 범위 · 빠른 더블클릭: 내부 진입" } }); row.dataset.collectionId = collection.id; row.draggable = true;
    const arrow = row.createEl("button", { cls: "cp-outline-arrow", attr: { "aria-label": collapsed ? "Expand" : "Collapse" } }); setIcon(arrow, collapsed ? "chevron-right" : "chevron-down");
    arrow.addEventListener("click", (event) => { event.stopPropagation(); layout.collapsedCollectionIds = collapsed ? layout.collapsedCollectionIds.filter((id) => id !== collection.id) : [...layout.collapsedCollectionIds, collection.id]; this.plugin.store.changed(); });
    row.createSpan({ cls: "cp-outline-row__title", text: collection.name });
    row.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest("button")) return;
      const now = performance.now();
      const entersCollection = this.lastCollectionClick?.id === collection.id && now - this.lastCollectionClick.at <= 220;
      this.selectOutlineTarget(target, event);
      if (entersCollection) {
        layout.focusedCollectionId = collection.id;
        layout.selectedCollectionId = collection.id;
        this.lastCollectionClick = null;
      } else this.lastCollectionClick = { id: collection.id, at: now };
      this.plugin.store.changed();
    });
    row.addEventListener("dragstart", (event) => { event.dataTransfer?.setData("application/x-canvas-palette-collection", collection.id); if (event.dataTransfer) event.dataTransfer.effectAllowed = "move"; row.addClass("is-dragging"); });
    row.addEventListener("dragend", () => row.removeClass("is-dragging"));
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      if (!this.outlineTargetSelected(target)) this.selectOutlineTarget(target);
      const menu = new Menu();
      menu.addItem((entry) => entry.setTitle("Export selection as MindMap to Canvas").setIcon("git-branch").onClick(() => void this.plugin.exportOutlineSelectionAsMindMap(this.outlineSelection)));
      menu.addItem((entry) => entry.setTitle("Export collection to Canvas").setIcon("file-output").onClick(() => void this.plugin.exportCollectionSubtree(collection.id)));
      menu.showAtMouseEvent(event);
    });
    this.mountOutlineDropTarget(row, collection.workspaceId, collection.id);
    iconButton(row, "plus", "Add nested collection", () => this.promptCollection(collection.workspaceId, collection.id));
    iconButton(row, "pencil", "Rename collection", () => new TextPromptModal(this.app, "Rename collection", collection.name, (value) => this.plugin.store.renameCollection(collection.id, value)).open());
    iconButton(row, "trash-2", "Delete collection", () => {
      const parentCollection = collection.parentId ? this.plugin.store.data.collections[collection.parentId] : null;
      const destination = parentCollection?.name ?? this.plugin.store.data.workspaces[collection.workspaceId]?.name ?? "the Workspace";
      new ConfirmDeleteCollectionModal(this.app, collection.name, destination, collection.itemIds.length, collection.childCollectionIds.length, () => {
        this.outlineSelection = this.outlineSelection.filter((entry) => entry.kind !== "collection" || entry.id !== collection.id);
        this.plugin.store.removeCollection(collection.id);
      }).open();
    });
    if (!collapsed) {
      for (const itemId of collection.itemIds) { const item = this.plugin.store.data.items[itemId]; if (item) this.renderOutlineItem(parent, item, depth + 1, collection.id); }
      for (const child of collection.childCollectionIds) this.renderCollection(parent, this.plugin.store.data.collections[child], depth + 1);
    }
  }

  private renderOutlineItem(parent: HTMLElement, item: PaletteItem, depth: number, collectionId: string | null): void {
    const target: OutlineSelectionTarget = { kind: "item", id: item.id };
    this.outlineRows.push(target);
    const selected = this.outlineTargetSelected(target);
    const showMarker = selected && this.outlineSelection.length > 1;
    const row = parent.createDiv({ cls: `cp-outline-item cp-outline-item--${item.type}${selected ? " is-selected" : ""}${this.query && this.plugin.search.matches(item, this.query) ? " is-match" : ""}`, attr: { style: `--cp-depth:${depth}` } }); row.dataset.itemId = item.id; row.draggable = true;
    const children = item.childItemIds ?? [];
    const layout = this.plugin.activeWorkspace()?.sideLayout;
    const collapsed = layout?.collapsedItemIds.includes(item.id) ?? false;
    if (children.length > 0) {
      const arrow = row.createEl("button", { cls: "cp-outline-arrow", attr: { "aria-label": collapsed ? "Expand file children" : "Collapse file children" } });
      setIcon(arrow, collapsed ? "chevron-right" : "chevron-down");
      arrow.addEventListener("click", (event) => { event.stopPropagation(); if (!layout) return; layout.collapsedItemIds = collapsed ? layout.collapsedItemIds.filter((id) => id !== item.id) : [...layout.collapsedItemIds, item.id]; this.plugin.store.changed(); });
    } else row.createSpan({ cls: "cp-outline-arrow cp-outline-arrow--empty" });
    const icon = row.createSpan({ cls: "cp-outline-item__icon" }); setIcon(icon, item.type === "image" ? "image" : item.type === "markdown" ? "file-text" : item.type === "group" ? "group" : "sticky-note");
    if (showMarker) row.createSpan({ cls: "cp-outline-item__check", text: "✓" }); row.createSpan({ cls: "cp-outline-item__title", text: item.displayTitle });
    const metadata = row.createSpan({ cls: "cp-outline-item__metadata" });
    for (const tag of item.tags) metadata.createSpan({ cls: "cp-outline-item__tag", text: `#${tag}` });
    if (item.label) { const label = metadata.createSpan({ cls: "cp-outline-item__label", text: item.label }); if (item.labelColor) label.style.setProperty("--cp-label-color", item.labelColor); }
    let clickTimer: number | null = null;
    row.addEventListener("click", (event) => { if (clickTimer !== null) window.clearTimeout(clickTimer); clickTimer = window.setTimeout(() => { clickTimer = null; this.pendingReveal = "viewport"; this.selectOutlineTarget(target, event); }, 220); });
    row.addEventListener("dblclick", () => { if (clickTimer !== null) window.clearTimeout(clickTimer); clickTimer = null; void this.plugin.openSideItemPreview(item.id); });
    row.addEventListener("contextmenu", (event) => { if (!this.outlineTargetSelected(target)) this.selectOutlineTarget(target); this.itemMenu(event, item, true); });
    row.addEventListener("dragstart", (event) => { const selectedIds = this.sideSelectedIds(); event.dataTransfer?.setData("application/x-canvas-palette-item", item.id); event.dataTransfer?.setData("application/x-canvas-palette-items", JSON.stringify(selectedIds.includes(item.id) ? selectedIds : [item.id])); if (event.dataTransfer) event.dataTransfer.effectAllowed = "copyMove"; row.addClass("is-dragging"); });
    row.addEventListener("dragend", () => row.removeClass("is-dragging"));
    this.mountOutlineItemDropTarget(row, item.id, collectionId, item.parentItemId ?? null);
    if (!collapsed) for (const childId of children) { const child = this.plugin.store.data.items[childId]; if (child) this.renderOutlineItem(parent, child, depth + 1, collectionId); }
  }

  private mountOutlineItemDropTarget(row: HTMLElement, targetId: string, collectionId: string | null, parentItemId: string | null): void {
    let zone: "before" | "inside" | "after" = "inside"; const clear = (): void => row.removeClass("is-drop-before", "is-drop-inside", "is-drop-after");
    row.addEventListener("dragover", (event) => { if (!event.dataTransfer?.types.includes("application/x-canvas-palette-item")) return; event.preventDefault(); event.stopPropagation(); const ratio = (event.clientY - row.getBoundingClientRect().top) / row.getBoundingClientRect().height; zone = ratio < .25 ? "before" : ratio > .75 ? "after" : "inside"; clear(); row.addClass(`is-drop-${zone}`); });
    row.addEventListener("dragleave", clear); row.addEventListener("drop", (event) => { const source = event.dataTransfer?.getData("application/x-canvas-palette-item"); const workspace = this.plugin.activeWorkspace(); if (!source || !workspace) return; event.preventDefault(); event.stopPropagation(); clear(); const selected = this.sideSelectedIds(); const moving = selected.includes(source) ? selected : [source]; if (zone === "inside") this.plugin.store.moveItems(workspace.id, moving, collectionId, null, false, targetId); else this.plugin.store.moveItems(workspace.id, moving, collectionId, targetId, zone === "after", parentItemId); });
  }

  private mountOutlineDropTarget(row: HTMLElement, workspaceId: string, collectionId: string | null): void {
    const accepts = (event: DragEvent): boolean => Boolean(event.dataTransfer?.types.includes("application/x-canvas-palette-item") || event.dataTransfer?.types.includes("application/x-canvas-palette-collection"));
    row.addEventListener("dragover", (event) => { if (!accepts(event)) return; event.preventDefault(); event.stopPropagation(); row.addClass("is-drop-target"); if (event.dataTransfer) event.dataTransfer.dropEffect = "move"; });
    row.addEventListener("dragleave", (event) => { if (!(event.relatedTarget instanceof Node) || !row.contains(event.relatedTarget)) row.removeClass("is-drop-target"); });
    row.addEventListener("drop", (event) => {
      if (!accepts(event)) return;
      event.preventDefault(); event.stopPropagation(); row.removeClass("is-drop-target");
      const itemId = event.dataTransfer?.getData("application/x-canvas-palette-item");
      if (itemId) {
        const selected = this.sideSelectedIds();
        this.plugin.store.moveItems(workspaceId, selected.includes(itemId) ? selected : [itemId], collectionId);
        return;
      }
      const draggedCollectionId = event.dataTransfer?.getData("application/x-canvas-palette-collection");
      if (draggedCollectionId) this.plugin.store.moveCollection(draggedCollectionId, collectionId);
    });
  }

  private renderIndex(parent: HTMLElement, title: string, values: string[], kind: "tag" | "label", showTitle = true): void {
    if (showTitle) parent.createEl("h4", { text: title }); const counts = new Map<string, number>(); for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    for (const [value, count] of [...counts].sort((a, b) => b[1] - a[1])) {
      const token = kind === "tag" ? `#${value}` : `label:"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
      const row = parent.createDiv({ cls: "cp-index-row" });
      const chip = row.createEl("button", { cls: `cp-chip cp-index-filter${this.plugin.search.hasToken(this.query, token) ? " is-active" : ""}`, text: kind === "tag" ? `#${value}` : value, attr: { "aria-pressed": String(this.plugin.search.hasToken(this.query, token)) } });
      chip.addEventListener("click", () => { this.query = this.plugin.search.toggleToken(this.query, token); this.render(); requestAnimationFrame(() => this.contentEl.querySelector<HTMLInputElement>(".cp-search")?.focus()); });
      row.createSpan({ text: String(count) });
    }
  }

  private items(workspaceId: string): PaletteItem[] { return this.plugin.store.itemsForWorkspace(workspaceId); }
  private itemsForViewportScope(workspaceId: string): PaletteItem[] {
    const workspace = this.plugin.store.data.workspaces[workspaceId]; if (!workspace) return [];
    const focusedId = workspace.sideLayout.focusedCollectionId;
    if (!focusedId) return this.items(workspaceId);
    const ids: string[] = []; const collect = (id: string): void => { const collection = this.plugin.store.data.collections[id]; if (!collection) return; ids.push(...collection.itemIds); if (workspace.sideLayout.outlinerIncludeDescendants) for (const child of collection.childCollectionIds) collect(child); };
    collect(focusedId); return ids.map((id) => this.plugin.store.data.items[id]).filter((item): item is PaletteItem => Boolean(item));
  }

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
  private setSideView(viewMode: "grid" | "list"): void { const workspace = this.plugin.activeWorkspace(); if (!workspace) return; workspace.sideLayout.viewMode = viewMode; workspace.sideLayout.densityLevel = viewMode === "list" ? 0 : Math.max(1, workspace.sideLayout.densityLevel || ASSET_DENSITY_DEFAULT); this.plugin.store.changed(); }
  private promptCollection(workspaceId: string, parentId: string | null): void { new TextPromptModal(this.app, "New collection", "", (value) => this.plugin.store.createCollection(workspaceId, value, parentId), "Collection name").open(); }
  private itemMenu(event: MouseEvent, item: PaletteItem, fromOutliner = false): void {
    event.preventDefault(); const menu = new Menu(); const workspace = this.plugin.activeWorkspace();
    const selected = this.sideSelectedIds(); const targetIds = selected.includes(item.id) ? selected : [item.id];
    if (!selected.includes(item.id)) this.selectSideItem(item.id);
    if (workspace && targetIds.length > 1) menu.addItem((entry) => entry.setTitle("Group selected items…").setIcon("folder-plus").onClick(() => {
      const owningCollection = Object.values(this.plugin.store.data.collections).find((candidate) => candidate.workspaceId === workspace.id && candidate.itemIds.includes(item.id));
      new TextPromptModal(this.app, "New group", "", (value) => {
        const group = this.plugin.store.createCollection(workspace.id, value, owningCollection?.id ?? null);
        this.plugin.store.moveItems(workspace.id, targetIds, group.id);
      }, "Group name").open();
    }));
    menu.addItem((entry) => entry.setTitle("Edit tags, label & caption").setIcon("tags").onClick(() => new TagLabelModal(this.app, this.plugin, targetIds).open()));
    if (item.type === "image" || item.type === "markdown" || item.type === "group") menu.addItem((entry) => entry
      .setTitle("Rename linked item")
      .setIcon("pencil")
      .onClick(() => new TextPromptModal(this.app, "Rename linked item", item.displayTitle, (value) => this.plugin.renameLinkedItem(item.id, value), "Linked item name").open()));
    if (item.type === "card") menu.addItem((entry) => entry
      .setTitle("Convert to shared Markdown…")
      .setIcon("file-output")
      .onClick(() => {
        const fileName = `${item.displayTitle.replace(/[\\/:*?"<>|]/g, " ").trim() || "Card"}.md`;
        const folder = this.app.workspace.getActiveFile()?.parent?.path ?? "";
        new CardToMarkdownModal(this.app, fileName, folder, (name, targetFolder) => this.plugin.convertCardToMarkdown(item.id, name, targetFolder)).open();
      }));
    if (supportsFrontBack(item)) {
      menu.addItem((entry) => entry
        .setTitle(item.facesEnabled ? "Remove Front / Back" : "Enable Front / Back")
        .setIcon(item.facesEnabled ? "circle-off" : "refresh-cw")
        .onClick(() => item.facesEnabled ? this.plugin.store.disableItemFaces(item.id) : this.plugin.store.enableItemFaces(item.id)));
    }
    const allInMini = targetIds.every((id) => this.plugin.store.miniStorageHas(id));
    menu.addItem((entry) => entry
      .setTitle(allInMini ? "Remove from Mini Palette" : "Export to Mini Palette")
      .setIcon(allInMini ? "unlink" : "send")
      .setChecked(allInMini)
      .onClick(() => allInMini ? this.plugin.store.removeMiniStorageItems(targetIds) : this.plugin.sendItemsToMini(targetIds)));
    menu.addItem((entry) => entry.setTitle(`Export ${targetIds.length} item${targetIds.length === 1 ? "" : "s"} to Canvas`).setIcon("share-2").onClick(() => void this.plugin.exportItemsToActiveCanvas(targetIds)));
    if (workspace) menu.addItem((entry) => entry.setTitle("Export Workspace to Canvas").setIcon("download").onClick(() => void this.plugin.exportActiveWorkspace()));
    menu.addItem((entry) => entry.setTitle(fromOutliner ? "Export selection as MindMap to Canvas" : "Export from MindMap to Canvas").setIcon("git-branch").onClick(() => fromOutliner ? void this.plugin.exportOutlineSelectionAsMindMap(this.outlineSelection) : void this.plugin.exportItemsAsMindMap(targetIds)));
    if (workspace) menu.addItem((entry) => entry.setTitle("Move to…").setIcon("folder-input").onClick(() => new MoveItemsModal(this.app, workspace.name, Object.values(this.plugin.store.data.collections).filter((candidate) => candidate.workspaceId === workspace.id), targetIds.length, (collectionId) => this.plugin.store.assignItemsToCollection(workspace.id, targetIds, collectionId)).open()));
    menu.addItem((entry) => entry.setTitle("Archive에 독립 사본 보관").setIcon("archive").onClick(() => void this.plugin.archiveItems(targetIds)));
    const linkedLocations = this.plugin.store.linkedCanvasLocations(item);
    if (linkedLocations.length > 0) menu.addItem((entry) => entry.setTitle("Locate on Canvas").setIcon("locate-fixed").onClick(() => this.plugin.findLinkedCanvas(item)));
    if (item.type === "link" && /^https?:\/\//i.test(item.webLink?.url ?? "")) menu.addItem((entry) => entry.setTitle("Open web link").setIcon("external-link").onClick(() => this.plugin.openWebLink(item)));
    else if (item.origin.filePath) menu.addItem((entry) => entry.setTitle("Open source file").setIcon("external-link").onClick(() => void this.plugin.openOriginal(item)));
    menu.addSeparator(); menu.addItem((entry) => entry.setTitle(`Delete${targetIds.length > 1 ? ` ${targetIds.length} items` : ""}`).setIcon("trash").onClick(() => this.confirmDelete(targetIds)));
    menu.showAtMouseEvent(event);
  }

  private sideSelectedIds(): string[] { return this.plugin.store.data.uiState.sideSelectedItemIds; }
  private outlineKey(target: OutlineSelectionTarget): string { return `${target.kind}:${target.id}`; }
  private outlineTargetSelected(target: OutlineSelectionTarget): boolean { return this.outlineSelection.some((entry) => this.outlineKey(entry) === this.outlineKey(target)); }
  private selectOutlineTarget(target: OutlineSelectionTarget, event?: Pick<MouseEvent | KeyboardEvent, "ctrlKey" | "metaKey" | "shiftKey">): void {
    const targetKey = this.outlineKey(target); const toggle = Boolean(event?.ctrlKey || event?.metaKey);
    if (event?.shiftKey && this.outlineSelectionAnchorKey) {
      const start = this.outlineRows.findIndex((entry) => this.outlineKey(entry) === this.outlineSelectionAnchorKey);
      const end = this.outlineRows.findIndex((entry) => this.outlineKey(entry) === targetKey);
      this.outlineSelection = start >= 0 && end >= 0 ? this.outlineRows.slice(Math.min(start, end), Math.max(start, end) + 1) : [target];
    } else if (toggle) {
      this.outlineSelection = this.outlineTargetSelected(target) ? this.outlineSelection.filter((entry) => this.outlineKey(entry) !== targetKey) : [...this.outlineSelection, target];
      this.outlineSelectionAnchorKey = targetKey;
    } else { this.outlineSelection = [target]; this.outlineSelectionAnchorKey = targetKey; }
    const itemIds = this.outlineSelection.filter((entry) => entry.kind === "item").map((entry) => entry.id);
    this.plugin.store.data.uiState.sideSelectedItemIds = itemIds;
    this.plugin.store.data.uiState.selectedItemId = itemIds.at(-1) ?? null;
    this.plugin.store.changed();
  }
  private selectSideItem(id: string, event?: Pick<MouseEvent | KeyboardEvent, "ctrlKey" | "metaKey" | "shiftKey">, orderedItemIds = this.visibleItemIds): void {
    const selected = this.sideSelectedIds();
    const toggle = Boolean(event?.ctrlKey || event?.metaKey);
    let next: string[];
    if (event?.shiftKey && this.selectionAnchorId) {
      const anchorIndex = orderedItemIds.indexOf(this.selectionAnchorId);
      const targetIndex = orderedItemIds.indexOf(id);
      const range = anchorIndex >= 0 && targetIndex >= 0 ? orderedItemIds.slice(Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex) + 1) : [id];
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
    // Viewport selection is item-only, so it deliberately replaces any Outliner Collection rows.
    this.outlineSelection = next.map((itemId) => ({ kind: "item" as const, id: itemId }));
    this.outlineSelectionAnchorKey = this.selectionAnchorId ? `item:${this.selectionAnchorId}` : null;
    this.plugin.store.changed();
  }
  private clearSideSelection(): void {
    if (this.sideSelectedIds().length === 0) return;
    this.selectionAnchorId = null;
    this.outlineSelection = [];
    this.outlineSelectionAnchorKey = null;
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
