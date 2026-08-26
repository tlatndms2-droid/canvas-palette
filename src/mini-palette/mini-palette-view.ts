import { ItemView, WorkspaceLeaf } from "obsidian";
import type CanvasPalettePlugin from "../main";
import { renderItem, workspaceSelect } from "../ui/render";

export const MINI_PALETTE_VIEW = "canvas-palette-mini";

export class MiniPaletteView extends ItemView {
  private unsubscribe?: () => void;
  private query = "";
  private selected = new Set<string>();

  constructor(leaf: WorkspaceLeaf, private readonly plugin: CanvasPalettePlugin) { super(leaf); }
  getViewType(): string { return MINI_PALETTE_VIEW; }
  getDisplayText(): string { return "Mini Palette"; }
  getIcon(): string { return "panels-top-left"; }
  async onOpen(): Promise<void> { this.unsubscribe = this.plugin.store.subscribe(() => this.render()); this.render(); }
  async onClose(): Promise<void> { this.unsubscribe?.(); }

  private render(): void {
    const root = this.contentEl;
    root.empty(); root.addClass("canvas-palette", "cp-mini");
    const head = root.createDiv({ cls: "cp-mini__head" });
    head.createEl("h3", { text: "Mini Palette" });
    const tabs = head.createDiv({ cls: "cp-tabs" });
    for (const [id, label] of [["collect", `Collect ${this.plugin.store.data.pendingItemIds.length}`], ["storage", "Storage"]] as const) {
      const tab = tabs.createEl("button", { text: label, cls: this.plugin.store.data.uiState.miniTab === id ? "is-active" : "" });
      tab.addEventListener("click", () => { this.plugin.store.data.uiState.miniTab = id; this.plugin.store.changed(); });
    }
    if (this.plugin.store.data.uiState.miniTab === "collect") this.renderCollect(root); else this.renderStorage(root);
  }

  private renderCollect(root: HTMLElement): void {
    const search = root.createEl("input", { cls: "cp-search", attr: { type: "search", placeholder: "Search pending items…" }, value: this.query });
    search.addEventListener("input", () => { this.query = search.value; this.render(); });
    const body = root.createDiv({ cls: "cp-collect" });
    const ids = this.plugin.store.data.pendingItemIds;
    const items = this.plugin.search.filter(ids.map((id) => this.plugin.store.data.items[id]).filter(Boolean), this.query);
    for (const type of ["card", "markdown", "image", "group"] as const) {
      const typed = items.filter((item) => item.type === type);
      if (typed.length === 0) continue;
      body.createEl("h4", { text: `${type.toUpperCase()} ${typed.length}` });
      for (const item of typed) renderItem(body, item, this.selected.has(item.id), () => { this.toggleSelected(item.id); });
    }
    if (items.length === 0) body.createDiv({ cls: "cp-empty", text: "Scrapped Canvas items will wait here for review." });
    const footer = root.createDiv({ cls: "cp-bottom" });
    workspaceSelect(this.plugin, footer, this.plugin.store.data.uiState.activeWorkspaceId, () => undefined);
    const button = footer.createEl("button", { cls: "mod-cta", text: "Import to workspace" });
    button.disabled = this.selected.size === 0;
    button.addEventListener("click", () => {
      const select = footer.querySelector("select");
      if (select) this.plugin.store.importPending(select.value, [...this.selected]);
      this.selected.clear();
    });
  }

  private renderStorage(root: HTMLElement): void {
    const shell = root.createDiv({ cls: "cp-storage" });
    const left = shell.createDiv({ cls: "cp-storage__left" });
    left.createEl("h4", { text: "Browse" });
    workspaceSelect(this.plugin, left, this.plugin.store.data.uiState.activeWorkspaceId, (id) => { this.plugin.store.data.uiState.activeWorkspaceId = id; this.plugin.store.changed(); });
    const search = left.createEl("input", { cls: "cp-search", attr: { type: "search", placeholder: "Search…" }, value: this.query });
    search.addEventListener("input", () => { this.query = search.value; this.render(); });
    left.createDiv({ cls: "cp-filter-note", text: "Type · Tag · Label filters" });
    const main = shell.createDiv({ cls: "cp-storage__main" });
    const workspace = this.plugin.activeWorkspace();
    const items = workspace ? workspace.looseItemIds.map((id) => this.plugin.store.data.items[id]).filter(Boolean) : [];
    for (const item of this.plugin.search.filter(items, this.query)) renderItem(main, item, item.id === this.plugin.store.data.uiState.selectedItemId, () => this.plugin.selectItem(item.id));
    const right = shell.createDiv({ cls: "cp-storage__right" });
    const item = this.plugin.selectedItem();
    right.createEl("h4", { text: "Preview" });
    if (item) {
      right.createEl("h3", { text: item.displayTitle });
      right.createDiv({ cls: "cp-preview", text: item.content ?? item.origin.filePath ?? `${item.group?.nodes.length ?? 0} nodes` });
      right.createEl("h4", { text: "Details" });
      right.createDiv({ text: `Type: ${item.type}` });
      right.createDiv({ text: `Workspace: ${item.origin.workspaceId ?? "Pending"}` });
      right.createDiv({ text: `Modified: ${new Date(item.modifiedAt).toLocaleString()}` });
      if (item.origin.filePath) right.createDiv({ text: `Path: ${item.origin.filePath}` });
    } else right.createDiv({ cls: "cp-empty", text: "Select an item to preview it." });
    const footer = root.createDiv({ cls: "cp-bottom" });
    footer.createSpan({ text: `Total ${items.length} · Selected ${this.selected.size}` });
    footer.createEl("button", { text: "Export" });
    footer.createEl("button", { text: "Tag edit" });
    const remove = footer.createEl("button", { text: "Delete" });
    remove.addEventListener("click", () => { this.plugin.store.removeItems([...this.selected]); this.selected.clear(); });
    footer.createEl("button", { text: "More", attr: { disabled: "true", title: "Reserved for a user-defined action" } });
  }

  private toggleSelected(id: string): void { if (this.selected.has(id)) this.selected.delete(id); else this.selected.add(id); this.render(); }
}
