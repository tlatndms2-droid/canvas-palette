import { ItemView, WorkspaceLeaf } from "obsidian";
import type CanvasPalettePlugin from "../main";
import { renderItem, workspaceSelect } from "../ui/render";

export const SIDE_PALETTE_VIEW = "canvas-palette-side";

export class SidePaletteView extends ItemView {
  private unsubscribe?: () => void;
  private query = "";

  constructor(leaf: WorkspaceLeaf, private readonly plugin: CanvasPalettePlugin) { super(leaf); }
  getViewType(): string { return SIDE_PALETTE_VIEW; }
  getDisplayText(): string { return "Canvas Palette"; }
  getIcon(): string { return "library-big"; }

  async onOpen(): Promise<void> {
    this.unsubscribe = this.plugin.store.subscribe(() => this.render());
    this.render();
  }

  async onClose(): Promise<void> { this.unsubscribe?.(); }

  private render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("canvas-palette", "cp-side");
    const toolbar = root.createDiv({ cls: "cp-toolbar" });
    workspaceSelect(this.plugin, toolbar, this.plugin.store.data.uiState.activeWorkspaceId, (id) => {
      this.plugin.store.data.uiState.activeWorkspaceId = id;
      this.plugin.store.changed();
    });
    const addMemo = toolbar.createEl("button", { text: "New memo" });
    addMemo.addEventListener("click", () => void this.plugin.createMemo());
    const search = root.createEl("input", { cls: "cp-search", attr: { type: "search", placeholder: "Search cards, files, tags, labels…" }, value: this.query });
    search.addEventListener("input", () => { this.query = search.value; this.render(); requestAnimationFrame(() => this.contentEl.querySelector<HTMLInputElement>(".cp-search")?.focus()); });

    const split = root.createDiv({ cls: "cp-side__split" });
    const viewport = split.createDiv({ cls: "cp-panel cp-viewport" });
    viewport.createEl("h4", { text: "Viewport" });
    const workspace = this.plugin.activeWorkspace();
    const items = workspace ? workspace.looseItemIds.map((id) => this.plugin.store.data.items[id]).filter(Boolean) : [];
    const matches = this.plugin.search.filter(items, this.query);
    const grid = viewport.createDiv({ cls: "cp-grid" });
    for (const item of matches) renderItem(grid, item, item.id === this.plugin.store.data.uiState.selectedItemId, () => this.plugin.selectItem(item.id));
    if (matches.length === 0) grid.createDiv({ cls: "cp-empty", text: "No items in this workspace." });

    const outliner = split.createDiv({ cls: "cp-panel cp-outliner" });
    const outlinerHeader = outliner.createDiv({ cls: "cp-panel__header" });
    outlinerHeader.createEl("h4", { text: "Collections" });
    const addCollection = outlinerHeader.createEl("button", { text: "+" });
    addCollection.addEventListener("click", () => this.plugin.createCollection());
    if (workspace) {
      for (const collectionId of workspace.rootCollectionIds) this.renderCollection(outliner, collectionId, 0);
      for (const item of items) outliner.createDiv({ cls: `cp-outline-item${this.plugin.search.matches(item, this.query) && this.query ? " is-match" : ""}`, text: `${item.type.toUpperCase()} · ${item.displayTitle}` });
    }

    const indexes = root.createDiv({ cls: "cp-indexes" });
    this.renderIndex(indexes.createDiv({ cls: "cp-panel" }), "Tags", items.flatMap((item) => item.tags));
    this.renderIndex(indexes.createDiv({ cls: "cp-panel" }), "Labels", items.map((item) => item.label).filter(Boolean));
  }

  private renderCollection(parent: HTMLElement, id: string, depth: number): void {
    const collection = this.plugin.store.data.collections[id];
    if (!collection) return;
    parent.createDiv({ cls: "cp-collection", text: `${"  ".repeat(depth)}▸ ${collection.name}` });
    for (const childId of collection.childCollectionIds) this.renderCollection(parent, childId, depth + 1);
  }

  private renderIndex(parent: HTMLElement, title: string, values: string[]): void {
    parent.createEl("h4", { text: title });
    const counts = new Map<string, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    for (const [value, count] of [...counts].sort((a, b) => b[1] - a[1])) {
      const row = parent.createDiv({ cls: "cp-index-row" }); row.createSpan({ text: value }); row.createSpan({ text: String(count) });
    }
  }
}
