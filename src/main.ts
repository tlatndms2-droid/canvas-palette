import { Editor, EventRef, Menu, Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { CanvasAdapter } from "./canvas/canvas-adapter";
import { TextScrapHighlights } from "./canvas/text-scrap-highlights";
import { createId } from "./core/ids";
import { PaletteStore } from "./core/store";
import type { PaletteItem, PaletteWorkspace } from "./core/types";
import { FloatingMiniPalette } from "./mini-palette/floating-mini-palette";
import { PreviewService } from "./preview/preview-service";
import { SearchService } from "./search/search-service";
import { CanvasPaletteSettingTab } from "./settings/settings-tab";
import { SIDE_PALETTE_VIEW, SidePaletteView } from "./side-palette/side-palette-view";

export default class CanvasPalettePlugin extends Plugin {
  store = new PaletteStore(this);
  search = new SearchService();
  canvas = new CanvasAdapter(this.app, (itemId, canvasPath, nodeIds) => this.store.recordCanvasPlacement(itemId, canvasPath, nodeIds));
  textScrapHighlights = new TextScrapHighlights(this);
  preview = new PreviewService(this.app, this);
  miniPalette = new FloatingMiniPalette(this);

  async onload(): Promise<void> {
    await this.store.load();
    this.registerEditorExtension(this.textScrapHighlights.extension());
    this.register(this.store.subscribe(() => this.textScrapHighlights.refreshVisibleEditors()));
    this.registerView(SIDE_PALETTE_VIEW, (leaf) => new SidePaletteView(leaf, this));
    this.addRibbonIcon("library-big", "Open Canvas Palette", () => void this.activateSidePalette());
    this.addRibbonIcon("panels-top-left", "Open Canvas Mini Palette", () => this.miniPalette.open());
    this.addCommand({ id: "open-side-palette", name: "Open Side Palette", callback: () => void this.activateSidePalette() });
    this.addCommand({ id: "open-mini-palette", name: "Open Mini Palette on Canvas", callback: () => this.miniPalette.open() });
    this.addCommand({ id: "collect-canvas-selection", name: "Collect selected Canvas items", callback: () => void this.collectCanvasSelection() });
    this.addCommand({ id: "collect-selected-text", name: "Collect selected text as card", editorCheckCallback: (checking, editor, view) => {
      const selection = editor.getSelection();
      if (!selection) return false;
      if (!checking) this.collectText(selection, view.file?.path, { from: editor.getCursor("from"), to: editor.getCursor("to") });
      return true;
    }});
    this.addCommand({ id: "new-workspace", name: "Create workspace", callback: () => {
      const workspace = this.store.createWorkspace(`Workspace ${Object.keys(this.store.data.workspaces).length + 1}`);
      this.store.data.uiState.activeWorkspaceId = workspace.id; this.store.changed(); new Notice(`Created ${workspace.name}`);
    }});
    const workspaceEvents = this.app.workspace as unknown as { on: (name: string, callback: (...args: unknown[]) => unknown) => EventRef };
    this.registerEvent(workspaceEvents.on("canvas:node-menu", (...args: unknown[]) => {
      const menu = args[0] as Menu | undefined;
      const node = args[1];
      if (!menu || typeof menu.addItem !== "function") return;
      this.addCanvasNodeCollectionMenu(menu, node);
    }));
    this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor) => this.addCanvasTextCollectionMenu(menu, editor)));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => {
      if (this.canvas.activeContext()) this.miniPalette.mount();
      else this.miniPalette.destroy();
      this.selectRepresentativeWorkspace();
    }));
    this.addSettingTab(new CanvasPaletteSettingTab(this));
    if (this.canvas.activeContext()) this.miniPalette.mount();
  }

  async onunload(): Promise<void> { this.miniPalette.destroy(); await this.store.flush(); }

  activeWorkspace(): PaletteWorkspace | undefined {
    const id = this.store.data.uiState.activeWorkspaceId;
    return id ? this.store.data.workspaces[id] : undefined;
  }

  selectedItem(): PaletteItem | undefined {
    const id = this.store.data.uiState.selectedItemId;
    return id ? this.store.data.items[id] : undefined;
  }

  selectItem(id: string): void { this.store.data.uiState.selectedItemId = id; this.store.changed(); }

  openSettings(): void {
    const appWithSettings = this.app as unknown as { setting?: { open: () => Promise<void>; openTabById: (id: string) => void } };
    if (appWithSettings.setting) { void appWithSettings.setting.open(); appWithSettings.setting.openTabById(this.manifest.id); }
  }

  async createMemo(): Promise<void> {
    const now = Date.now();
    const item: PaletteItem = { id: createId("card"), type: "card", displayTitle: "New memo", tags: [], label: "", caption: "", createdAt: now, modifiedAt: now, origin: {}, canvasPlacements: [], content: "" };
    this.store.addPending(item);
    const workspace = this.activeWorkspace();
    if (workspace) this.store.importPending(workspace.id, [item.id]);
    this.selectItem(item.id);
  }

  createCollection(): void {
    const workspace = this.activeWorkspace();
    if (!workspace) return;
    this.store.createCollection(workspace.id, `Collection ${workspace.rootCollectionIds.length + 1}`);
  }

  collectText(text: string, sourcePath?: string, textRange?: { from: { line: number; ch: number }; to: { line: number; ch: number } }): void {
    const now = Date.now();
    this.store.addPending({ id: createId("card"), type: "card", displayTitle: text.split(/\r?\n/, 1)[0].slice(0, 60) || "Text scrap", tags: [], label: "", caption: "Text scrap", createdAt: now, modifiedAt: now, origin: { filePath: sourcePath, textRange }, canvasPlacements: [], content: text });
    new Notice("Text collected in Mini Palette");
  }

  async collectCanvasSelection(): Promise<void> {
    const items = await this.canvas.collectSelection();
    if (items.length === 0) return;
    for (const item of items) this.store.addPending(item);
    this.store.data.uiState.miniPalette.tab = "collect";
    this.miniPalette.open();
    new Notice(`${items.length} Canvas item${items.length === 1 ? "" : "s"} collected.`);
  }

  private addCanvasNodeCollectionMenu(menu: Menu, node: unknown): void {
    menu.addSeparator();
    menu.addItem((item) => item.setTitle("Canvas Palette").setIcon("library-big").setIsLabel(true));
    menu.addItem((item) => item.setTitle("Collect to Mini Palette").setIcon("inbox").onClick(() => void this.collectCanvasNodeToMini(node)));
    const currentWorkspace = this.activeWorkspace();
    if (currentWorkspace) menu.addItem((item) => item.setTitle(`Save directly to Side Palette — ${currentWorkspace.name}`).setIcon("panel-right").onClick(() => void this.collectCanvasNodeToWorkspace(node, currentWorkspace.id)));
    for (const workspace of Object.values(this.store.data.workspaces)) {
      if (workspace.id === currentWorkspace?.id) continue;
      menu.addItem((item) => item.setTitle(`Save directly to Side Palette — ${workspace.name}`).setIcon("panel-right").onClick(() => void this.collectCanvasNodeToWorkspace(node, workspace.id)));
    }
  }

  private addCanvasTextCollectionMenu(menu: Menu, editor: Editor): void {
    const text = editor.getSelection();
    const context = this.canvas.activeContext();
    if (!text || !context) return;
    const range = { from: editor.getCursor("from"), to: editor.getCursor("to") };
    menu.addSeparator();
    menu.addItem((item) => item.setTitle("Canvas Palette — collect selected text").setIcon("library-big").setIsLabel(true));
    menu.addItem((item) => item.setTitle("Collect text to Mini Palette").setIcon("inbox").onClick(() => this.collectCanvasTextToMini(text, context.file.path, range)));
    const currentWorkspace = this.activeWorkspace();
    if (currentWorkspace) menu.addItem((item) => item.setTitle(`Save text directly to Side Palette — ${currentWorkspace.name}`).setIcon("panel-right").onClick(() => this.collectCanvasTextToWorkspace(text, context.file.path, range, currentWorkspace.id)));
    for (const workspace of Object.values(this.store.data.workspaces)) {
      if (workspace.id === currentWorkspace?.id) continue;
      menu.addItem((item) => item.setTitle(`Save text directly to Side Palette — ${workspace.name}`).setIcon("panel-right").onClick(() => this.collectCanvasTextToWorkspace(text, context.file.path, range, workspace.id)));
    }
  }

  private textItem(text: string, canvasPath: string, textRange: { from: { line: number; ch: number }; to: { line: number; ch: number } }): PaletteItem {
    const now = Date.now();
    return { id: createId("card"), type: "card", displayTitle: text.split(/\r?\n/, 1)[0].slice(0, 60) || "Text scrap", tags: [], label: "", caption: "Text scrap", createdAt: now, modifiedAt: now, origin: { canvasPath, textRange }, canvasPlacements: [], content: text };
  }

  private collectCanvasTextToMini(text: string, canvasPath: string, textRange: { from: { line: number; ch: number }; to: { line: number; ch: number } }): void {
    this.store.addPending(this.textItem(text, canvasPath, textRange));
    this.store.data.uiState.miniPalette.tab = "collect";
    this.miniPalette.open();
    new Notice("Selected Canvas text collected in Mini Palette.");
  }

  private collectCanvasTextToWorkspace(text: string, canvasPath: string, textRange: { from: { line: number; ch: number }; to: { line: number; ch: number } }, workspaceId: string): void {
    const item = this.textItem(text, canvasPath, textRange);
    this.store.addToWorkspace(workspaceId, item);
    this.store.data.uiState.activeWorkspaceId = workspaceId;
    this.selectItem(item.id);
    void this.openSidePalette();
    new Notice("Selected Canvas text saved to Side Palette.");
  }

  private async collectCanvasNodeToMini(node: unknown): Promise<void> {
    const items = await this.canvas.collectNode(node);
    if (items.length === 0) return;
    for (const item of items) this.store.addPending(item);
    this.store.data.uiState.miniPalette.tab = "collect";
    this.miniPalette.open();
    new Notice(`${items.length} Canvas item${items.length === 1 ? "" : "s"} added to Mini Palette.`);
  }

  private async collectCanvasNodeToWorkspace(node: unknown, workspaceId: string): Promise<void> {
    const items = await this.canvas.collectNode(node);
    if (items.length === 0) return;
    for (const item of items) this.store.addToWorkspace(workspaceId, item);
    this.store.data.uiState.activeWorkspaceId = workspaceId;
    this.store.data.uiState.selectedItemId = items[0].id;
    this.store.changed();
    await this.openSidePalette();
    new Notice(`${items.length} Canvas item${items.length === 1 ? "" : "s"} saved to Side Palette.`);
  }

  async openOriginal(item: PaletteItem): Promise<void> {
    if (item.origin.filePath) {
      const file = this.app.vault.getAbstractFileByPath(item.origin.filePath);
      if (file instanceof TFile) { await this.app.workspace.getLeaf("tab").openFile(file); return; }
    }
    if (item.origin.canvasPath) {
      const file = this.app.vault.getAbstractFileByPath(item.origin.canvasPath);
      if (file instanceof TFile) { await this.app.workspace.getLeaf("tab").openFile(file); return; }
    }
    new Notice("The original item is unavailable.");
  }

  async exportActiveWorkspace(): Promise<void> {
    const workspace = this.activeWorkspace();
    if (!workspace) return;
    const rows: Array<{ id: string; name: string; depth: number; item?: PaletteItem }> = [];
    const walk = (collectionId: string, depth: number, parentPath: string): void => {
      const collection = this.store.data.collections[collectionId]; if (!collection) return;
      const id = `${parentPath}/${collection.id}`; rows.push({ id, name: collection.name, depth });
      for (const itemId of collection.itemIds) { const item = this.store.data.items[itemId]; if (item) rows.push({ id: `${id}/${item.id}`, name: item.displayTitle, depth: depth + 1, item }); }
      for (const childId of collection.childCollectionIds) walk(childId, depth + 1, id);
    };
    const root = `${workspace.id}`; rows.push({ id: root, name: workspace.name, depth: 0 });
    for (const itemId of workspace.looseItemIds) { const item = this.store.data.items[itemId]; if (item) rows.push({ id: `${root}/${item.id}`, name: item.displayTitle, depth: 1, item }); }
    for (const collectionId of workspace.rootCollectionIds) walk(collectionId, 1, root);
    await this.canvas.exportCollection(`${workspace.name} Export`, rows);
  }

  async openSidePalette(): Promise<void> { await this.activateSidePalette(); }

  private selectRepresentativeWorkspace(): void {
    const context = this.canvas.activeContext();
    if (!context) return;
    const workspace = Object.values(this.store.data.workspaces).find((candidate) => candidate.representativeCanvasPath === context.file.path);
    if (workspace && workspace.id !== this.store.data.uiState.activeWorkspaceId) { this.store.data.uiState.activeWorkspaceId = workspace.id; this.store.changed(); }
  }

  private async activateSidePalette(): Promise<void> {
    await this.activateView(SIDE_PALETTE_VIEW, this.app.workspace.getRightLeaf(false));
  }

  private async activateView(type: string, leaf: WorkspaceLeaf | null): Promise<void> {
    if (!leaf) return;
    await leaf.setViewState({ type, active: true });
    this.app.workspace.revealLeaf(leaf);
  }
}
