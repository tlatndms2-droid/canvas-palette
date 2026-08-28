import { Editor, EventRef, Menu, Notice, Plugin, TFile, TFolder, normalizePath } from "obsidian";
import { CanvasAdapter } from "./canvas/canvas-adapter";
import { mergeCanvasNodeIds } from "./core/canvas-node-presence";
import { CanvasMetadataController } from "./canvas/canvas-metadata-controller";
import { CanvasNodeToolbarController } from "./canvas/canvas-node-toolbar-controller";
import { PaletteDropController } from "./canvas/palette-drop-controller";
import { TextScrapHighlights } from "./canvas/text-scrap-highlights";
import { createId } from "./core/ids";
import { PaletteStore } from "./core/store";
import type { PaletteItem, PaletteWorkspace } from "./core/types";
import { PaletteEditorManager } from "./editor/editor-manager";
import { FloatingMiniPalette } from "./mini-palette/floating-mini-palette";
import { PreviewService } from "./preview/preview-service";
import { SearchService } from "./search/search-service";
import { CanvasPaletteSettingTab } from "./settings/settings-tab";
import { SIDE_PALETTE_VIEW, SidePaletteView } from "./side-palette/side-palette-view";
import { ConfirmCanvasReplacementModal, ItemEditorModal, MetadataEditorModal } from "./ui/modal";
import { ItemPreviewModal } from "./ui/item-preview-modal";
import { FindLinkModal } from "./ui/find-link-modal";

export default class CanvasPalettePlugin extends Plugin {
  private readonly canvasSyncTimers = new Map<string, number>();
  store = new PaletteStore(this);
  search = new SearchService();
  canvas = new CanvasAdapter(
    this.app,
    (itemId, canvasPath, nodeIds) => this.store.recordCanvasPlacement(itemId, canvasPath, nodeIds),
    (canvasPath, nodeId) => this.store.getCanvasNodeMetadata(canvasPath, nodeId),
    (canvasPath, nodeId, backContent) => this.store.setCanvasNodeBack(canvasPath, nodeId, backContent),
    (item, canvasPath) => this.store.linkedCanvasNodes(item).filter((location) => location.canvasPath === canvasPath).map((location) => location.nodeId),
    () => new Promise<boolean>((resolve) => new ConfirmCanvasReplacementModal(this.app, resolve).open()),
    (itemId, canvasPath, removedNodeIds, newNodeIds, existingNodeIds) => this.store.replaceCanvasPlacement(itemId, canvasPath, removedNodeIds, newNodeIds, existingNodeIds)
  );
  canvasMetadata = new CanvasMetadataController(this, this.canvas);
  canvasToolbar = new CanvasNodeToolbarController(this.canvas, {
    editMetadata: (nodes) => this.editCanvasNodesMetadata(nodes),
    collectToMini: () => void this.collectCanvasSelection(),
    saveToSide: (anchor) => this.saveCanvasSelectionFromToolbar(anchor),
    supportsFaces: (node) => this.canvas.supportsFrontBack(node),
    facesEnabled: (canvasPath, nodeId) => this.store.getCanvasNodeMetadata(canvasPath, nodeId)?.facesEnabled ?? false,
    enableFaces: (canvasPath, nodeId) => {
      this.store.enableCanvasNodeFaces(canvasPath, nodeId);
      new Notice("Front / Back enabled for this Canvas node.");
    },
    disableFaces: (canvasPath, nodeId) => {
      this.store.disableCanvasNodeFaces(canvasPath, nodeId);
      new Notice("Front / Back removed from this material.");
    },
    isLinked: (canvasPath, nodeId) => Boolean(this.store.linkedItemForNode(canvasPath, nodeId)),
    unlink: (canvasPath, nodeId) => {
      if (this.store.unlinkCanvasNode(canvasPath, nodeId)) new Notice("Canvas node unlinked from Palette. Its Front, Back, and Metadata were preserved.");
    }
  });
  dropController = new PaletteDropController(this.store, this.canvas);
  textScrapHighlights = new TextScrapHighlights(this);
  preview = new PreviewService(this.app, this);
  miniPalette = new FloatingMiniPalette(this);
  editorManager = new PaletteEditorManager(this.app, this);

  async onload(): Promise<void> {
    await this.store.load();
    this.register(this.dropController.mount(this.app.workspace.containerEl.ownerDocument));
    this.register(this.canvasToolbar.mount(this.app.workspace.containerEl.ownerDocument));
    this.registerEditorExtension(this.textScrapHighlights.extension());
    this.register(this.store.subscribe(() => { this.textScrapHighlights.refreshVisibleEditors(); this.canvasMetadata.refreshSoon(); this.canvasToolbar.refreshSoon(); }));
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
    this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor) => this.addCanvasTextCollectionMenu(menu, editor)));
    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (file instanceof TFile && file.extension.toLowerCase() === "canvas") this.scheduleCanvasSync(file);
    }));
    this.registerEvent(this.app.vault.on("delete", (file) => { if (file instanceof TFile) this.store.reconcileDeletedFile(file.path); }));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => {
      const context = this.canvas.activeContext();
      if (context) { this.miniPalette.mount(); this.scheduleCanvasSync(context.file); }
      else this.miniPalette.destroy();
      this.selectRepresentativeWorkspace();
      this.canvasMetadata.refreshSoon();
      this.canvasToolbar.refreshSoon();
    }));
    this.registerEvent(workspaceEvents.on("layout-change", () => { this.canvasMetadata.refreshSoon(); this.canvasToolbar.refreshSoon(); }));
    this.addSettingTab(new CanvasPaletteSettingTab(this));
    const initialCanvas = this.canvas.activeContext();
    if (initialCanvas) { this.miniPalette.mount(); this.scheduleCanvasSync(initialCanvas.file); }
    this.canvasMetadata.refreshSoon();
  }

  async onunload(): Promise<void> { for (const timer of this.canvasSyncTimers.values()) window.clearTimeout(timer); this.canvasSyncTimers.clear(); this.canvasToolbar.destroy(); this.canvasMetadata.destroy(); this.miniPalette.destroy(); await this.editorManager.close(); await this.store.flush(); }

  activeWorkspace(): PaletteWorkspace | undefined {
    const id = this.store.data.uiState.activeWorkspaceId;
    return id ? this.store.data.workspaces[id] : undefined;
  }

  selectedItem(): PaletteItem | undefined {
    const id = this.store.data.uiState.selectedItemId;
    return id ? this.store.data.items[id] : undefined;
  }

  selectItem(id: string): void { this.store.data.uiState.selectedItemId = id; this.store.changed(); }

  async revealPaletteItemForCanvasNode(canvasPath: string, nodeId: string): Promise<void> {
    const item = this.store.linkedItemForNode(canvasPath, nodeId);
    if (!item) { new Notice("This Canvas node is no longer linked to a Palette item."); return; }
    const workspace = this.store.workspaceForItem(item.id);
    if (!workspace) { new Notice("The linked Palette item is not stored in a Workspace."); return; }
    if (this.store.data.uiState.activeWorkspaceId !== workspace.id) {
      this.store.data.uiState.activeWorkspaceId = workspace.id;
      this.store.changed();
    }
    const view = await this.activateSidePalette();
    if (!view) { new Notice("Unable to open Side Palette."); return; }
    view.revealItem(item.id);
  }

  async openItemEditor(itemId: string): Promise<void> {
    if (await this.editorManager.openItem(itemId)) return;
    new ItemEditorModal(this.app, this, itemId).open();
  }

  async openSideItemPreview(itemId: string): Promise<void> {
    const item = this.store.data.items[itemId];
    if (!item) return;
    if (item.type === "card" || item.type === "markdown") {
      await this.openItemEditor(itemId);
      return;
    }
    new ItemPreviewModal(this.app, this, itemId).open();
  }

  openSettings(): void {
    const appWithSettings = this.app as unknown as { setting?: { open: () => Promise<void>; openTabById: (id: string) => void } };
    if (appWithSettings.setting) { void appWithSettings.setting.open(); appWithSettings.setting.openTabById(this.manifest.id); }
  }

  async createMemo(): Promise<void> {
    const now = Date.now();
    const item: PaletteItem = { id: createId("card"), type: "card", displayTitle: "New memo", tags: [], label: "", caption: "", backContent: "", facesEnabled: false, createdAt: now, modifiedAt: now, origin: {}, canvasPlacements: [], content: "" };
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
    this.store.addPending({ id: createId("card"), type: "card", displayTitle: text.split(/\r?\n/, 1)[0].slice(0, 60) || "Text scrap", tags: [], label: "", caption: "Text scrap", backContent: "", facesEnabled: false, createdAt: now, modifiedAt: now, origin: { filePath: sourcePath, textRange }, canvasPlacements: [], content: text });
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

  private editCanvasNodesMetadata(nodes: unknown[]): void {
    const targets = nodes.map((node) => this.canvas.nodeContext(node)).filter((target): target is { canvasPath: string; nodeId: string } => Boolean(target));
    if (targets.length === 0) { new Notice("Unable to identify the selected Canvas items."); return; }
    const first = targets[0];
    const current = this.store.getCanvasNodeMetadata(first.canvasPath, first.nodeId) ?? { tags: [], label: "", caption: "", modifiedAt: Date.now() };
    new MetadataEditorModal(this.app, this, current, (metadata) => {
      for (const target of targets) this.store.setCanvasNodeMetadata(target.canvasPath, target.nodeId, metadata);
      new Notice(`Palette metadata applied to ${targets.length} Canvas item${targets.length === 1 ? "" : "s"}.`);
    }).open();
  }

  private saveCanvasSelectionFromToolbar(anchor: HTMLElement): void {
    const workspaces = Object.values(this.store.data.workspaces);
    if (workspaces.length === 0) { new Notice("Create a Workspace before saving Canvas items."); return; }
    if (workspaces.length === 1) { void this.collectCanvasSelectionToWorkspace(workspaces[0].id); return; }
    const currentId = this.store.data.uiState.activeWorkspaceId;
    const ordered = [...workspaces].sort((a, b) => Number(b.id === currentId) - Number(a.id === currentId));
    const menu = new Menu();
    for (const workspace of ordered) menu.addItem((item) => item
      .setTitle(workspace.name)
      .setIcon(workspace.id === currentId ? "check" : "panel-right")
      .onClick(() => void this.collectCanvasSelectionToWorkspace(workspace.id)));
    const rect = anchor.getBoundingClientRect();
    menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 });
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
    return { id: createId("card"), type: "card", displayTitle: text.split(/\r?\n/, 1)[0].slice(0, 60) || "Text scrap", tags: [], label: "", caption: "Text scrap", backContent: "", facesEnabled: false, createdAt: now, modifiedAt: now, origin: { canvasPath, textRange }, canvasPlacements: [], content: text };
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

  private async collectCanvasSelectionToWorkspace(workspaceId: string): Promise<void> {
    const items = await this.canvas.collectSelection();
    if (items.length === 0) return;
    for (const item of items) this.store.addToWorkspace(workspaceId, item);
    this.store.data.uiState.activeWorkspaceId = workspaceId;
    this.store.data.uiState.selectedItemId = items[0].id;
    this.store.changed();
    await this.openSidePalette();
    new Notice(`${items.length} Canvas item${items.length === 1 ? "" : "s"} saved to Side Palette.`);
  }

  async openOriginal(item: PaletteItem): Promise<void> {
    if (item.origin.canvasPath && item.origin.canvasNodeId && await this.canvas.revealNode(item.origin.canvasPath, item.origin.canvasNodeId)) return;
    if (item.origin.filePath) {
      const file = this.app.vault.getAbstractFileByPath(item.origin.filePath);
      if (file instanceof TFile) { await this.app.workspace.getLeaf("tab").openFile(file); return; }
    }
    new Notice("The original item is unavailable.");
  }

  async convertCardToMarkdown(itemId: string, requestedName: string, requestedFolder: string): Promise<boolean> {
    const item = this.store.data.items[itemId];
    if (!item || item.type !== "card") { new Notice("Only Card items can be converted to Markdown."); return false; }
    const baseName = requestedName.trim().replace(/\.md$/i, "").replace(/[.\s]+$/g, "");
    if (!baseName || /[\\/:*?"<>|]/.test(baseName)) { new Notice("Enter a valid Markdown file name."); return false; }
    const folder = requestedFolder.trim().replace(/^\/+|\/+$/g, "");
    const path = normalizePath(`${folder ? `${folder}/` : ""}${baseName}.md`);
    if (this.app.vault.getAbstractFileByPath(path)) { new Notice(`A file already exists at ${path}.`); return false; }
    try {
      await this.ensureVaultFolder(folder);
      await this.app.vault.create(path, item.content ?? "");
      await this.canvas.convertLinkedCardsToMarkdown(this.store.linkedCanvasNodes(item), path);
      if (!this.store.convertCardToMarkdown(item.id, path)) return false;
      new Notice(`${item.displayTitle} and its linked Canvas Cards now share ${path}.`);
      return true;
    } catch (error) {
      console.error("Canvas Palette failed to convert a Card to shared Markdown", error);
      new Notice("Could not create the Markdown file.");
      return false;
    }
  }

  async renameLinkedItem(itemId: string, requestedTitle: string): Promise<boolean> {
    const item = this.store.data.items[itemId];
    if (!item || item.type === "card") return false;
    const title = requestedTitle.trim();
    if (!title) return false;
    const locations = this.store.linkedCanvasNodes(item);
    try {
      if (item.type === "markdown" || item.type === "image") {
        const source = item.origin.filePath ? this.app.vault.getAbstractFileByPath(item.origin.filePath) : null;
        if (!(source instanceof TFile)) { new Notice("The linked source file is unavailable."); return false; }
        const baseName = title.replace(new RegExp(`\\.${source.extension}$`, "i"), "");
        if (!baseName || /[\\/:*?"<>|]/.test(baseName)) { new Notice("Enter a valid file name."); return false; }
        const parentPath = source.parent?.path && source.parent.path !== "/" ? `${source.parent.path}/` : "";
        const nextPath = normalizePath(`${parentPath}${baseName}.${source.extension}`);
        if (nextPath !== source.path && this.app.vault.getAbstractFileByPath(nextPath)) { new Notice(`A file already exists at ${nextPath}.`); return false; }
        if (nextPath !== source.path) await this.app.fileManager.renameFile(source, nextPath);
        item.origin.filePath = nextPath;
        await this.canvas.renameLinkedFileNodes(locations, nextPath);
      } else if (item.type === "group") {
        const rootGroup = item.group?.nodes.find((node) => node.type === "group" && !node.parentId) ?? item.group?.nodes.find((node) => node.type === "group");
        if (rootGroup) rootGroup.label = title;
        await this.canvas.renameLinkedGroupNodes(locations, title);
      }
      this.store.updateItem(item.id, { displayTitle: title, tags: item.tags, label: item.label, labelColor: item.labelColor, caption: item.caption });
      new Notice(`Renamed linked ${item.type} item to ${title}.`);
      return true;
    } catch (error) {
      console.error("Canvas Palette failed to rename a linked item", error);
      new Notice("Could not rename every linked item.");
      this.store.changed();
      return false;
    }
  }

  private async ensureVaultFolder(folder: string): Promise<void> {
    if (!folder) return;
    let current = "";
    for (const segment of folder.split("/").filter(Boolean)) {
      current = normalizePath(current ? `${current}/${segment}` : segment);
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (existing && !(existing instanceof TFolder)) throw new Error(`${current} is not a folder`);
      if (!existing) await this.app.vault.createFolder(current);
    }
  }

  async syncPaletteItemToCanvas(item: PaletteItem): Promise<void> {
    const locations = this.store.linkedCanvasNodes(item);
    if (locations.length === 0) return;
    try { await this.canvas.syncItemToCanvases(item, locations); }
    catch (error) { console.error("Canvas Palette failed to synchronize an item to its linked Canvas nodes", error); }
  }

  async locateItemOnCanvas(item: PaletteItem): Promise<void> {
    const canvasPath = item.origin.canvasPath;
    const nodeId = item.origin.canvasNodeId;
    if (!canvasPath || !nodeId || !(await this.canvas.revealNode(canvasPath, nodeId))) new Notice("The original Canvas item is unavailable.");
  }

  findLinkedCanvas(item: PaletteItem): void {
    const locations = this.store.linkedCanvasLocations(item);
    if (locations.length === 0) { new Notice("This Palette item has no linked Canvas location."); return; }
    const reveal = async (location: { canvasPath: string; nodeId: string }): Promise<void> => {
      if (!(await this.canvas.revealNode(location.canvasPath, location.nodeId))) new Notice("The linked Canvas location is unavailable.");
    };
    if (locations.length === 1) { void reveal(locations[0]); return; }
    new FindLinkModal(this.app, item.displayTitle, locations, (location) => void reveal(location)).open();
  }

  private scheduleCanvasSync(file: TFile): void {
    const previous = this.canvasSyncTimers.get(file.path);
    if (previous !== undefined) window.clearTimeout(previous);
    this.canvasSyncTimers.set(file.path, window.setTimeout(() => {
      this.canvasSyncTimers.delete(file.path);
      void this.syncCanvasFileToPalette(file);
    }, 150));
  }

  private async syncCanvasFileToPalette(file: TFile): Promise<void> {
    try {
      const result = await this.canvas.syncItemsFromCanvas(file, this.store.allItems());
      const existingNodeIds = mergeCanvasNodeIds(result.nodeIds, this.canvas.openNodeIds(file.path));
      const linksChanged = this.store.reconcileCanvasLinks(file.path, existingNodeIds);
      if (result.changedItems > 0 || linksChanged) {
        this.store.changed();
        for (const item of this.store.allItems()) if (item.type === "card") void this.syncPaletteItemToCanvas(item);
      }
    } catch (error) { console.error("Canvas Palette failed to synchronize original Canvas items", error); }
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

  private async activateSidePalette(): Promise<SidePaletteView | null> {
    const existing = this.app.workspace.getLeavesOfType(SIDE_PALETTE_VIEW)[0];
    const leaf = existing ?? this.app.workspace.getRightLeaf(false);
    if (!leaf) return null;
    if (!existing) await leaf.setViewState({ type: SIDE_PALETTE_VIEW, active: true });
    this.app.workspace.revealLeaf(leaf);
    return leaf.view instanceof SidePaletteView ? leaf.view : null;
  }
}
