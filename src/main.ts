import { Editor, EventRef, Menu, Notice, Plugin, TAbstractFile, TFile, TFolder, normalizePath } from "obsidian";
import { CanvasAdapter } from "./canvas/canvas-adapter";
import { ExportPlacementController } from "./canvas/export-placement-controller";
import { mergeCanvasNodeIds } from "./core/canvas-node-presence";
import { CanvasMetadataController } from "./canvas/canvas-metadata-controller";
import { CanvasCaptionControl } from "./canvas/canvas-caption-control";
import { CanvasNodeToolbarController } from "./canvas/canvas-node-toolbar-controller";
import { PaletteDropController } from "./canvas/palette-drop-controller";
import { TextScrapHighlights } from "./canvas/text-scrap-highlights";
import { createId } from "./core/ids";
import { PaletteStore } from "./core/store";
import { SerialTaskQueue } from "./core/serial-task-queue";
import type { NumberedCanvasLink, OutlineSelectionTarget, PaletteItem, PaletteWorkspace } from "./core/types";
import { PaletteEditorManager } from "./editor/editor-manager";
import { FloatingMiniPalette } from "./mini-palette/floating-mini-palette";
import { PreviewService } from "./preview/preview-service";
import { SearchService } from "./search/search-service";
import { CanvasPaletteSettingTab } from "./settings/settings-tab";
import { SIDE_PALETTE_VIEW, SidePaletteView } from "./side-palette/side-palette-view";
import { AlreadySavedToWorkspaceModal, CanvasTargetModal, CanvasWorkspaceModal, ConfirmDeleteModal, ConfirmExportDuplicateModal, ConfirmForeignCanvasWorkspaceModal, DeletedCanvasWorkspacesModal, ItemEditorModal, MetadataEditorModal, OutlineStructureRuleModal, TextPromptModal } from "./ui/modal";
import { ItemPreviewModal } from "./ui/item-preview-modal";
import { FindLinkModal } from "./ui/find-link-modal";
import { WorkspaceExplorerModal } from "./ui/workspace-explorer-modal";

export default class CanvasPalettePlugin extends Plugin {
  private readonly canvasSyncTimers = new Map<string, number>();
  private readonly canvasSyncQueue = new SerialTaskQueue();
  private readonly cleanupDialogs = new Set<string>();
  private workspaceExplorer?: WorkspaceExplorerModal;
  private lastCanvasPath: string | null = null;
  store = new PaletteStore(this);
  search = new SearchService();
  canvas = new CanvasAdapter(
    this.app,
    (itemId, canvasPath, nodeIds) => this.store.recordCanvasPlacement(itemId, canvasPath, nodeIds),
    (canvasPath, nodeId) => this.store.getCanvasNodeMetadata(canvasPath, nodeId),
    (canvasPath, records) => this.store.restoreCanvasNodeMetadata(canvasPath, records),
    (item, canvasPath) => this.store.linkedCanvasNodes(item).filter((location) => location.canvasPath === canvasPath).map((location) => location.nodeId),
    (itemId, canvasPath, removedNodeIds, newNodeIds, existingNodeIds) => this.store.replaceCanvasPlacement(itemId, canvasPath, removedNodeIds, newNodeIds, existingNodeIds)
  );
  exportPlacement = new ExportPlacementController(this.canvas);
  canvasMetadata = new CanvasMetadataController(this, this.canvas);
  canvasCaptionControl = new CanvasCaptionControl(this, this.canvas);
  canvasToolbar = new CanvasNodeToolbarController(this.canvas, {
    editMetadata: (nodes) => this.editCanvasNodesMetadata(nodes),
    collectToMini: () => void this.collectCanvasSelection(),
    cutToMini: () => void this.cutCanvasSelection(),
    saveToSide: (anchor) => this.saveCanvasSelectionFromToolbar(anchor),
    exportStructure: () => this.exportCanvasSelectionStructure(),
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
    this.app.workspace.onLayoutReady(() => window.setTimeout(() => {
      if (!this.store.repairIndependentImageReferences()) return;
      this.store.changed(); new Notice("독립 이미지 카드의 원본 경로를 복구했습니다.");
    }, 0));
    this.lastCanvasPath = this.store.data.uiState.lastCanvasPath;
    this.reconcileLoadedMarkdownSources();
    this.register(this.dropController.mount(this.app.workspace.containerEl.ownerDocument));
    this.register(this.canvasToolbar.mount(this.app.workspace.containerEl.ownerDocument));
    this.registerEditorExtension(this.textScrapHighlights.extension());
    this.register(this.store.subscribe((change) => { if (change.kind === "selection" || change.kind === "ui") return; this.textScrapHighlights.refreshVisibleEditors(); this.canvasMetadata.refreshSoon(); this.canvasCaptionControl.refresh(); this.canvasToolbar.refreshSoon(); }));
    this.registerView(SIDE_PALETTE_VIEW, (leaf) => new SidePaletteView(leaf, this));
    this.addRibbonIcon("library-big", "Open Canvas Palette", () => void this.activateSidePalette());
    this.addRibbonIcon("panels-top-left", "Toggle Canvas Mini Palette", () => this.miniPalette.toggle());
    this.addCommand({ id: "open-side-palette", name: "Open Side Palette", callback: () => void this.activateSidePalette() });
    this.addCommand({ id: "open-mini-palette", name: "Toggle Mini Palette on Canvas", callback: () => this.miniPalette.toggle() });
    this.addCommand({ id: "collect-canvas-selection", name: "Collect selected Canvas items", callback: () => void this.collectCanvasSelection() });
    this.addCommand({ id: "cut-canvas-selection", name: "Cut selected Canvas items to Mini Palette", callback: () => void this.cutCanvasSelection() });
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
      if (!(file instanceof TFile)) return;
      if (file.extension.toLowerCase() === "canvas") this.scheduleCanvasSync(file);
      else if (file.extension.toLowerCase() === "md") void this.refreshMarkdownSource(file);
    }));
    this.registerEvent(this.app.vault.on("delete", (file) => {
      this.store.reconcileDeletedFile(file.path, file instanceof TFolder);
      if (file instanceof TFile && file.extension.toLowerCase() === "canvas") this.handleDeletedCanvas(file.path);
      if (file instanceof TFolder) {
        const prefix = `${file.path}/`;
        for (const workspace of Object.values(this.store.data.workspaces)) if (workspace.kind === "canvas" && workspace.ownerCanvasPath?.startsWith(prefix)) this.handleDeletedCanvas(workspace.ownerCanvasPath);
      }
    }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => void this.handleVaultRename(file, oldPath)));
    this.registerEvent(this.app.vault.on("create", (file) => { if (file instanceof TFile && file.extension.toLowerCase() === "md") void this.reconnectMovedMarkdown(file); }));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => {
      const context = this.canvas.activeContext();
      if (!this.exportPlacement.isFor(context)) this.exportPlacement.cancel();
      if (context) {
        this.lastCanvasPath = context.file.path;
        if (this.store.data.uiState.lastCanvasPath !== context.file.path) {
          this.store.data.uiState.lastCanvasPath = context.file.path;
          this.store.changed();
        }
        this.miniPalette.mount(); this.canvasCaptionControl.mount();
        this.scheduleCanvasSync(context.file);
      }
      else { this.miniPalette.destroy(); this.canvasCaptionControl.destroy(); }
      this.canvasMetadata.refreshSoon();
      this.canvasToolbar.refreshSoon();
    }));
    this.registerEvent(workspaceEvents.on("layout-change", () => { this.canvasMetadata.refreshSoon(); this.canvasCaptionControl.mount(); this.canvasToolbar.refreshSoon(); }));
    this.addSettingTab(new CanvasPaletteSettingTab(this));
    const initialCanvas = this.canvas.activeContext();
    if (initialCanvas) {
      this.lastCanvasPath = initialCanvas.file.path;
      this.store.data.uiState.lastCanvasPath = initialCanvas.file.path;
      this.miniPalette.mount(); this.canvasCaptionControl.mount();
      this.scheduleCanvasSync(initialCanvas.file);
    }
    this.canvasMetadata.refreshSoon();
    window.setTimeout(() => {
      for (const path of this.store.data.uiState.pendingCanvasWorkspaceCleanup) if (!this.app.vault.getAbstractFileByPath(path)) this.handleDeletedCanvas(path);
    }, 0);
  }

  async onunload(): Promise<void> { this.workspaceExplorer?.close(); for (const timer of this.canvasSyncTimers.values()) window.clearTimeout(timer); this.canvasSyncTimers.clear(); this.exportPlacement.cancel(); this.canvasToolbar.destroy(); this.canvasMetadata.destroy(); this.canvasCaptionControl.destroy(); this.miniPalette.destroy(); await this.editorManager.close(); await this.store.flush(); }

  activeWorkspace(): PaletteWorkspace | undefined {
    const id = this.store.data.uiState.activeWorkspaceId;
    return id ? this.store.data.workspaces[id] : undefined;
  }

  currentCanvasPath(): string | null { return this.canvas.activeContext()?.file.path ?? this.lastCanvasPath; }

  workspaceDisplayName(workspace: PaletteWorkspace): string {
    const currentPath = this.currentCanvasPath();
    const representativePath = workspace.kind === "canvas" ? workspace.representativeCanvasPath : null;
    const representativeMark = representativePath ? representativePath === currentPath ? "★ " : "☆ " : "";
    const ownerCanvas = workspace.kind === "canvas" ? this.canvasBaseName(workspace.ownerCanvasPath ?? "") : "";
    return workspace.kind === "canvas" ? `${representativeMark}${workspace.name} · ${ownerCanvas}` : `${representativeMark}${workspace.name}`;
  }

  isForeignCanvasWorkspace(workspaceId: string, canvasPath = this.currentCanvasPath()): boolean {
    const workspace = this.store.data.workspaces[workspaceId];
    return Boolean(canvasPath && workspace?.kind === "canvas" && workspace.ownerCanvasPath !== canvasPath);
  }

  canSaveCanvasToWorkspace(workspace: PaletteWorkspace, canvasPath: string): boolean {
    return Boolean(workspace && canvasPath);
  }

  confirmWorkspaceSave(workspaceId: string, onConfirm: () => void): void {
    const workspace = this.store.data.workspaces[workspaceId];
    if (!workspace) return;
    if (!this.isForeignCanvasWorkspace(workspaceId)) { onConfirm(); return; }
    new ConfirmForeignCanvasWorkspaceModal(this.app, workspace.name, onConfirm).open();
  }

  showAlreadySavedToWorkspace(workspaceId: string, savedCount: number, alreadySavedCount: number): void {
    new AlreadySavedToWorkspaceModal(this.app, this.store.data.workspaces[workspaceId]?.name ?? "Side Palette", savedCount, alreadySavedCount).open();
  }

  openCurrentCanvasWorkspace(): void {
    const canvasPath = this.currentCanvasPath();
    if (!canvasPath) { new Notice("Open a Canvas first."); return; }
    const workspace = this.store.representativeWorkspaceForCanvas(canvasPath);
    if (!workspace) {
      const candidates = this.store.canvasWorkspaces(canvasPath);
      if (candidates.length) { this.openWorkspaceExplorer(); new Notice("대표 Workspace를 선택하거나 새로 만들어 주세요."); return; }
      this.openCanvasWorkspaceCreator(canvasPath); return;
    }
    this.store.data.uiState.activeWorkspaceId = workspace.id;
    this.store.changed();
  }

  openCanvasWorkspaceCreator(canvasPath = this.currentCanvasPath()): void {
    if (!canvasPath) { new Notice("Open a Canvas first."); return; }
    new CanvasWorkspaceModal(this.app, this.canvasBaseName(canvasPath), (name) => {
      const workspace = this.store.createWorkspace(name, "canvas", canvasPath, this.store.canvasWorkspaces(canvasPath).length === 0);
      this.store.data.uiState.activeWorkspaceId = workspace.id;
      this.store.changed();
    }).open();
  }

  showWorkspaceMenu(anchor: HTMLElement): void {
    const menu = new Menu();
    const canvasPath = this.currentCanvasPath();
    menu.addItem((entry) => entry.setTitle("Create general Workspace…").setIcon("folder-plus").onClick(() => new TextPromptModal(this.app, "New general Workspace", "", (name) => {
      const workspace = this.store.createWorkspace(name, "general");
      this.store.data.uiState.activeWorkspaceId = workspace.id; this.store.changed();
    }, "Workspace name").open()));
    menu.addItem((entry) => entry.setTitle("Create Workspace for current Canvas…").setIcon("layout-dashboard").setDisabled(!canvasPath).onClick(() => this.openCanvasWorkspaceCreator(canvasPath)));
    const active = this.activeWorkspace();
    if (active) {
      menu.addSeparator();
      menu.addItem((entry) => entry.setTitle("Rename current Workspace…").setIcon("pencil").onClick(() => new TextPromptModal(this.app, "Rename Workspace", active.name, (name) => this.store.renameWorkspace(active.id, name), "Workspace name").open()));
      const canRepresent = Boolean(canvasPath && active.kind === "canvas" && active.ownerCanvasPath === canvasPath);
      const isRepresentative = Boolean(canRepresent && active.representativeCanvasPath === canvasPath);
      menu.addItem((entry) => entry.setTitle(isRepresentative ? "Representative Workspace" : "Set as representative").setIcon("star").setChecked(isRepresentative).setDisabled(!canRepresent).onClick(() => {
        if (canvasPath && this.store.setRepresentativeWorkspace(active.id, canvasPath)) new Notice(`${active.name} is now the representative Workspace.`);
      }));
    }
    const rect = anchor.getBoundingClientRect(); menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 });
  }

  openWorkspaceExplorer(): void { (this.workspaceExplorer ??= new WorkspaceExplorerModal(this.app, this)).open(); }

  openPendingCanvasWorkspaceCleanup(): void {
    const pending = this.store.data.uiState.pendingCanvasWorkspaceCleanup.find((path) => !this.app.vault.getAbstractFileByPath(path));
    if (pending) this.handleDeletedCanvas(pending);
  }

  openArchive(): void { this.store.data.uiState.activeWorkspaceId = this.store.archiveWorkspace().id; this.store.changed(); }

  async archiveItems(itemIds: string[]): Promise<void> {
    const sources = itemIds.map((id) => this.store.data.items[id]).filter((item): item is PaletteItem => Boolean(item));
    if (!sources.length) return;
    const filePaths = new Set<string>();
    for (const item of sources) {
      if ((item.type === "markdown" || item.type === "image" || item.type === "video") && item.origin.filePath) filePaths.add(item.origin.filePath);
      for (const node of item.group?.nodes ?? []) if (node.type === "file" && typeof node.file === "string") filePaths.add(node.file);
    }
    for (const path of filePaths) if (!(this.app.vault.getAbstractFileByPath(path) instanceof TFile)) { new Notice(`Archive copy failed: ${path} is unavailable.`); return; }
    const archiveId = createId("snapshot");
    const folder = normalizePath(`Canvas Palette Archive/${archiveId}`);
    const fileMap = new Map<string, string>();
    let index = 0;
    for (const path of filePaths) {
      const file = this.app.vault.getAbstractFileByPath(path) as TFile;
      fileMap.set(path, normalizePath(`${folder}/${String(++index).padStart(2, "0")}-${file.name}`));
    }
    const copies = this.store.cloneItemsToArchive(itemIds);
    const created: string[] = [];
    try {
      await this.ensureVaultFolder(folder);
      for (const [source, destination] of fileMap) { await this.app.vault.adapter.copy(source, destination); created.push(destination); }
      for (const copy of copies) {
        const source = copy.archivedFromItemId ? this.store.data.items[copy.archivedFromItemId] : undefined;
        if (source?.origin.filePath && fileMap.has(source.origin.filePath)) copy.origin.filePath = fileMap.get(source.origin.filePath)!;
        for (const node of copy.group?.nodes ?? []) if (node.type === "file" && typeof node.file === "string" && fileMap.has(node.file)) node.file = fileMap.get(node.file)!;
      }
      this.store.changed();
      this.openArchive();
      new Notice(`${copies.length} independent item${copies.length === 1 ? "" : "s"} saved to Archive.`);
    } catch (error) {
      console.error("Canvas Palette failed to create Archive copies", error);
      for (const path of created) {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file) await this.app.vault.delete(file, true);
      }
      const createdFolder = this.app.vault.getAbstractFileByPath(folder);
      if (createdFolder instanceof TFolder) await this.app.vault.delete(createdFolder, true);
      this.store.removeItems(copies.map((item) => item.id));
      new Notice("Archive copy failed. No Archive item was kept.");
    }
  }

  private handleDeletedCanvas(canvasPath: string): void {
    if (this.cleanupDialogs.has(canvasPath)) return;
    const workspaces = this.store.canvasWorkspaces(canvasPath);
    if (!workspaces.length) return;
    this.cleanupDialogs.add(canvasPath);
    this.store.queueDeletedCanvasWorkspaceCleanup(canvasPath);
    new DeletedCanvasWorkspacesModal(this.app, this.canvasBaseName(canvasPath), workspaces, (id) => this.store.itemsForWorkspace(id).length, (choices) => {
      if (this.app.vault.getAbstractFileByPath(canvasPath)) { this.store.clearDeletedCanvasWorkspaceCleanup(canvasPath); this.cleanupDialogs.delete(canvasPath); return; }
      const eligible = workspaces.filter((workspace) => this.store.data.workspaces[workspace.id]?.ownerCanvasPath === canvasPath);
      this.store.moveWorkspaces(eligible.filter((workspace) => (choices.get(workspace.id) ?? "general") === "general").map((workspace) => workspace.id), null);
      this.store.removeWorkspaces(eligible.filter((workspace) => choices.get(workspace.id) === "delete").map((workspace) => workspace.id));
      this.store.clearDeletedCanvasWorkspaceCleanup(canvasPath);
      this.cleanupDialogs.delete(canvasPath);
    }, () => this.cleanupDialogs.delete(canvasPath)).open();
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

  async revealNewSideItem(workspaceId: string, itemId: string): Promise<void> {
    if (!this.store.data.workspaces[workspaceId] || !this.store.data.items[itemId]) return;
    if (this.store.data.uiState.activeWorkspaceId !== workspaceId) {
      this.store.data.uiState.activeWorkspaceId = workspaceId;
      this.store.changed();
    }
    const view = await this.activateSidePalette();
    if (!view) { new Notice("Unable to open Side Palette."); return; }
    view.revealItem(itemId);
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

  async createMemo(): Promise<string> {
    const now = Date.now();
    const workspace = this.activeWorkspace();
    const item: PaletteItem = { id: createId("card"), type: "card", displayTitle: "New memo", tags: [], label: "", caption: "", backContent: "", facesEnabled: false, createdAt: now, modifiedAt: now, origin: { canvasPath: workspace?.kind === "canvas" ? workspace.ownerCanvasPath ?? undefined : undefined }, canvasPlacements: [], content: "" };
    this.store.addPending(item);
    if (workspace) this.store.importPending(workspace.id, [item.id]);
    if (workspace) await this.revealNewSideItem(workspace.id, item.id);
    else this.selectItem(item.id);
    return item.id;
  }

  private async exportCanvasSelectionStructure(): Promise<void> {
    const workspace = this.activeWorkspace();
    if (!workspace) { new Notice("Side Palette에서 Workspace를 먼저 선택하세요."); return; }
    const selection = await this.canvas.collectOutlineSelection();
    if (!selection) return;
    new OutlineStructureRuleModal(this.app, (folderName) => void this.saveCanvasSelectionStructure(workspace.id, selection, folderName)).open();
  }

  private async saveCanvasSelectionStructure(workspaceId: string, selection: Awaited<ReturnType<CanvasAdapter["collectOutlineSelection"]>>, folderName: string): Promise<void> {
    if (!selection) return;
    const ids = new Set(selection.items.map((item) => item.origin.canvasNodeId).filter((id): id is string => Boolean(id)));
    const compareCanvasOrder = (left: string, right: string): number => {
      const leftPosition = selection.positions[left]; const rightPosition = selection.positions[right];
      if (leftPosition && rightPosition) return leftPosition.y - rightPosition.y || leftPosition.x - rightPosition.x || left.localeCompare(right);
      return left.localeCompare(right);
    };
    const edges = selection.edges.filter((edge) => ids.has(edge.fromNode) && ids.has(edge.toNode)).map((edge) => {
      const from = selection.positions[edge.fromNode]; const to = selection.positions[edge.toNode];
      return from && to && from.x > to.x ? { fromNode: edge.toNode, toNode: edge.fromNode } : edge;
    });
    const children: Record<string, string[]> = {}; const parents = new Set<string>();
    const reaches = (start: string, goal: string, seen = new Set<string>()): boolean => {
      if (start === goal) return true; if (seen.has(start)) return false; seen.add(start);
      return (children[start] ?? []).some((child) => reaches(child, goal, seen));
    };
    for (const edge of edges) {
      if (edge.fromNode === edge.toNode || reaches(edge.toNode, edge.fromNode)) continue;
      const row = children[edge.fromNode] ??= [];
      if (!row.includes(edge.toNode)) row.push(edge.toNode);
      parents.add(edge.toNode);
    }
    for (const row of Object.values(children)) row.sort(compareCanvasOrder);
    const roots = [...ids].filter((id) => !parents.has(id)).sort(compareCanvasOrder);
    const result = this.store.saveOutlineCollection(workspaceId, { name: folderName, roots, children, items: selection.items });
    if (result === "missing") { new Notice("선택한 Workspace를 찾을 수 없습니다."); return; }
    this.store.data.uiState.activeWorkspaceId = workspaceId; this.store.changed();
    await this.openSidePalette();
    new Notice("선택한 Canvas 구조를 일반 Outliner 폴더로 추가했습니다.");
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
    const collected = this.store.collectCanvasItems(items);
    this.store.data.uiState.miniPalette.tab = "collect";
    this.miniPalette.open();
    new Notice(`${collected.length} Canvas item${collected.length === 1 ? "" : "s"} collected in Mini Palette.`);
  }

  async cutCanvasSelection(): Promise<void> {
    const cut = await this.canvas.cutSelection();
    if (!cut) return;
    if (this.store.reconcileCanvasLinks(cut.canvasPath, cut.remainingNodeIds)) this.store.changed();
    this.store.collectCanvasItems([cut.item]);
    this.store.data.uiState.miniPalette.tab = "collect";
    this.miniPalette.open();
    new Notice("Selected Canvas items were cut to Mini Palette.");
  }

  sendItemsToMini(itemIds: string[]): void {
    const validIds = [...new Set(itemIds)].filter((id) => Boolean(this.store.data.items[id]));
    if (validIds.length === 0) { new Notice("Select one or more Side Palette items first."); return; }
    const added = this.store.addMiniStorageItems(validIds);
    this.store.data.uiState.miniPalette.tab = "storage";
    this.miniPalette.open();
    new Notice(added.length > 0 ? `${added.length} item${added.length === 1 ? "" : "s"} exported to Mini Palette.` : "The selected items are already in Mini Palette.");
  }

  async exportItemsToActiveCanvas(itemIds: string[]): Promise<boolean> {
    const items = [...new Set(itemIds)].map((id) => this.store.data.items[id]).filter((item): item is PaletteItem => Boolean(item));
    if (items.length === 0) { new Notice("Select one or more Palette items first."); return false; }
    return this.beginExport((context) => this.canvas.createItemBundle(items, context));
  }

  async exportItemsAsMindMap(itemIds: string[]): Promise<boolean> {
    const tree = this.exportSelectedItemTree(itemIds);
    if (tree.length === 0) { new Notice("Select one or more Palette items first."); return false; }
    return this.beginExport((context) => this.canvas.createTreeBundle(tree, context));
  }

  async exportOutlineSelectionAsMindMap(targets: OutlineSelectionTarget[]): Promise<boolean> {
    const tree = this.exportOutlineSelectionTree(targets);
    if (tree.length === 0) { new Notice("Select one or more Outliner rows first."); return false; }
    return this.beginExport((context) => this.canvas.createTreeBundle(tree, context));
  }

  private editCanvasNodesMetadata(nodes: unknown[]): void {
    const targets = nodes.map((node) => this.canvas.nodeContext(node)).filter((target): target is { canvasPath: string; nodeId: string } => Boolean(target));
    if (targets.length === 0) { new Notice("Unable to identify the selected Canvas items."); return; }
    const first = targets[0];
    const current = this.store.getCanvasNodeMetadata(first.canvasPath, first.nodeId) ?? { tags: [], label: "", caption: "", modifiedAt: Date.now() };
    const linkedItem = targets.length === 1 ? this.store.linkedItemForNode(first.canvasPath, first.nodeId) : undefined;
    const sourcePath = targets.length === 1 ? (nodes[0] as { getData?: () => { file?: string } }).getData?.().file : undefined;
    const source = sourcePath ? this.app.vault.getAbstractFileByPath(sourcePath) : null;
    const fileRename = linkedItem && (linkedItem.type === "markdown" || linkedItem.type === "image" || linkedItem.type === "video")
      ? { name: linkedItem.displayTitle, rename: (name: string) => this.renameLinkedItem(linkedItem.id, name) }
      : source instanceof TFile ? { name: source.basename, rename: (name: string) => this.renameCanvasSourceFile(source.path, name) } : undefined;
    new MetadataEditorModal(this.app, this, current, (metadata) => {
      for (const target of targets) this.store.setCanvasNodeMetadata(target.canvasPath, target.nodeId, metadata);
      new Notice(`Palette metadata applied to ${targets.length} Canvas item${targets.length === 1 ? "" : "s"}.`);
    }, fileRename).open();
  }

  private saveCanvasSelectionFromToolbar(anchor: HTMLElement): void {
    const workspaces = Object.values(this.store.data.workspaces);
    if (workspaces.length === 0) { new Notice("Create a Workspace before saving Canvas items."); return; }
    const canvasPath = this.currentCanvasPath();
    if (workspaces.length === 1 && canvasPath && this.canSaveCanvasToWorkspace(workspaces[0], canvasPath)) { this.confirmWorkspaceSave(workspaces[0].id, () => void this.collectCanvasSelectionToWorkspace(workspaces[0].id)); return; }
    const currentId = this.store.data.uiState.activeWorkspaceId;
    const ordered = [...workspaces].sort((a, b) => Number(b.id === currentId) - Number(a.id === currentId));
    const menu = new Menu();
    for (const workspace of ordered) menu.addItem((item) => item
      .setTitle(this.workspaceDisplayName(workspace))
      .setIcon(workspace.id === currentId ? "check" : "panel-right")
      .setDisabled(!canvasPath || !this.canSaveCanvasToWorkspace(workspace, canvasPath))
      .onClick(() => this.confirmWorkspaceSave(workspace.id, () => void this.collectCanvasSelectionToWorkspace(workspace.id))));
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
    if (currentWorkspace) menu.addItem((item) => item.setTitle(`Save text directly to Side Palette — ${currentWorkspace.name}`).setIcon("panel-right").setDisabled(!this.canSaveCanvasToWorkspace(currentWorkspace, context.file.path)).onClick(() => this.confirmWorkspaceSave(currentWorkspace.id, () => this.collectCanvasTextToWorkspace(text, context.file.path, range, currentWorkspace.id))));
    for (const workspace of Object.values(this.store.data.workspaces)) {
      if (workspace.id === currentWorkspace?.id) continue;
      menu.addItem((item) => item.setTitle(`Save text directly to Side Palette — ${workspace.name}`).setIcon("panel-right").setDisabled(!this.canSaveCanvasToWorkspace(workspace, context.file.path)).onClick(() => this.confirmWorkspaceSave(workspace.id, () => this.collectCanvasTextToWorkspace(text, context.file.path, range, workspace.id))));
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
    const saved = this.isForeignCanvasWorkspace(workspaceId, canvasPath) ? this.store.addToWorkspaceAsUnlinked(workspaceId, item) : this.store.addToWorkspace(workspaceId, item);
    if (!saved) { new Notice("This Canvas Workspace only accepts items from its own Canvas."); return; }
    void this.revealNewSideItem(workspaceId, item.id);
    new Notice("Selected Canvas text saved to Side Palette.");
  }

  private async collectCanvasSelectionToWorkspace(workspaceId: string): Promise<void> {
    const items = await this.canvas.collectSelection();
    if (items.length === 0) return;
    const candidates = items.map((item) => this.store.existingCollectedItem(item) ?? item);
    const save = this.isForeignCanvasWorkspace(workspaceId) ? (item: PaletteItem) => this.store.addToWorkspaceAsUnlinked(workspaceId, item) : (item: PaletteItem) => this.store.addToWorkspace(workspaceId, item);
    const unique = candidates.filter((item, index) => candidates.findIndex((candidate) => candidate.id === item.id) === index);
    const alreadySaved = unique.filter((item) => this.store.workspaceForItem(item.id)?.id === workspaceId);
    const accepted = unique.filter((item) => !alreadySaved.includes(item) && save(item));
    if (accepted.length === 0 && alreadySaved.length === 0) { new Notice("This Canvas Workspace only accepts items from its own Canvas."); return; }
    if (accepted.length > 0) await this.revealNewSideItem(workspaceId, accepted[0].id);
    if (alreadySaved.length > 0) this.showAlreadySavedToWorkspace(workspaceId, accepted.length, alreadySaved.length);
    else new Notice(`${accepted.length} Canvas item${accepted.length === 1 ? "" : "s"} saved to Side Palette.`);
  }

  markdownSourceStatus(item: PaletteItem): "deleted" | null {
    if (item.type !== "markdown") return null;
    if (item.sourceDeletedAt) return "deleted";
    return null;
  }

  showMarkdownSourceMenu(item: PaletteItem, event: MouseEvent): void {
    const status = this.markdownSourceStatus(item);
    if (!status) return;
    const menu = new Menu();
    menu.addItem((entry) => entry.setTitle("MD 복구").setIcon("file-up").onClick(() => void this.restoreMarkdownSource(item.id)));
    menu.addItem((entry) => entry.setTitle("Palette에서 삭제").setIcon("trash").onClick(() => new ConfirmDeleteModal(this.app, 1, () => this.store.removeItems([item.id])).open()));
    menu.showAtMouseEvent(event);
  }

  async restoreMarkdownSource(itemId: string): Promise<boolean> {
    const item = this.store.data.items[itemId];
    const path = item?.origin.filePath;
    if (!item || item.type !== "markdown" || !path) return false;
    const relatedItems = this.store.allItems().filter((candidate) => candidate.type === "markdown" && candidate.origin.filePath === path);
    try {
      const existing = this.app.vault.getAbstractFileByPath(path);
      if (existing && !(existing instanceof TFile)) { new Notice(`Cannot restore Markdown at ${path}.`); return false; }
      if (!existing) {
        const slash = path.lastIndexOf("/");
        await this.ensureVaultFolder(slash >= 0 ? path.slice(0, slash) : "");
        const restoredContent = item.content ?? "";
        await this.app.vault.create(path, restoredContent);
      }
      const restored = this.store.restoreSource(item.id, path);
      if (!restored) return false;
      for (const related of relatedItems) await this.canvas.convertLinkedCardsToMarkdown(this.store.linkedCanvasNodes(related), path);
      new Notice(`Restored ${path} and reconnected its Canvas cards.`);
      return true;
    } catch (error) {
      console.error("Canvas Palette failed to restore a deleted Markdown source", error);
      new Notice("Could not restore the Markdown source.");
      return false;
    }
  }

  private reconcileLoadedMarkdownSources(): void {
    for (const item of this.store.allItems()) {
      if (item.type !== "markdown" || !item.origin.filePath) continue;
      const file = this.app.vault.getAbstractFileByPath(item.origin.filePath);
      if (!(file instanceof TFile)) this.store.reconcileDeletedFile(item.origin.filePath);
      else if (item.sourceDeletedAt) this.store.restoreSource(item.id, file.path);
    }
  }

  private async refreshMarkdownSource(file: TFile): Promise<void> {
    try { this.store.updateMarkdownSource(file.path, await this.app.vault.cachedRead(file)); }
    catch (error) { console.error("Canvas Palette failed to refresh a Markdown source", error); }
  }

  private async handleVaultRename(file: TAbstractFile, oldPath: string): Promise<void> {
    this.store.renameCanvasPath(oldPath, file.path, file instanceof TFolder);
    const changedItems = this.store.renameSourcePath(oldPath, file.path, file instanceof TFolder);
    for (const item of changedItems) {
      const path = item.origin.filePath;
      if (path) await this.canvas.renameLinkedFileNodes(this.store.linkedCanvasNodes(item), path);
    }
    if (file instanceof TFile && file.extension.toLowerCase() === "md") await this.refreshMarkdownSource(file);
  }

  private async reconnectMovedMarkdown(file: TFile): Promise<void> {
    const deleted = this.store.allItems().filter((item) => item.type === "markdown" && Boolean(item.sourceDeletedAt) && Boolean(item.origin.filePath));
    if (deleted.length === 0) return;
    try {
      const content = await this.app.vault.cachedRead(file);
      const matches = deleted.filter((item) => item.content === content && item.origin.filePath?.split("/").pop()?.toLocaleLowerCase() === file.name.toLocaleLowerCase());
      const previousPaths = [...new Set(matches.map((item) => item.origin.filePath).filter((path): path is string => Boolean(path)))];
      if (previousPaths.length !== 1) return;
      const relatedItems = deleted.filter((item) => item.origin.filePath === previousPaths[0]);
      const item = this.store.restoreSource(matches[0].id, file.path);
      if (!item) return;
      for (const related of relatedItems) await this.canvas.renameLinkedFileNodes(this.store.linkedCanvasNodes(related), file.path);
      new Notice(`Canvas Palette followed ${file.name} to its new folder.`);
    } catch (error) { console.error("Canvas Palette failed to reconnect a moved Markdown source", error); }
  }

  async openOriginal(item: PaletteItem): Promise<void> {
    if (item.origin.canvasPath && item.origin.canvasNodeId && await this.canvas.revealNode(item.origin.canvasPath, item.origin.canvasNodeId)) return;
    const sourcePath = item.origin.filePath ?? ((item.type === "image" || item.type === "video") ? item.sourceReferencePath : undefined);
    if (sourcePath) {
      const file = this.app.vault.getAbstractFileByPath(sourcePath);
      if (file instanceof TFile) { await this.app.workspace.getLeaf("tab").openFile(file); return; }
    }
    new Notice("The original item is unavailable.");
  }

  openWebLink(item: PaletteItem): void {
    const url = item.webLink?.url ?? "";
    if (!/^https?:\/\//i.test(url)) { new Notice("Only http and https web links can be opened."); return; }
    window.open(url, "_blank", "noopener,noreferrer");
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
      if (item.type === "markdown" || item.type === "image" || item.type === "video") {
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

  private async renameCanvasSourceFile(filePath: string, requestedTitle: string): Promise<boolean> {
    const source = this.app.vault.getAbstractFileByPath(filePath);
    const baseName = requestedTitle.trim().replace(new RegExp(`\\.${source instanceof TFile ? source.extension : ""}$`, "i"), "");
    if (!(source instanceof TFile) || !baseName || /[\\/:*?"<>|]/.test(baseName)) { new Notice("Enter a valid file name."); return false; }
    const parentPath = source.parent?.path && source.parent.path !== "/" ? `${source.parent.path}/` : "";
    const nextPath = normalizePath(`${parentPath}${baseName}.${source.extension}`);
    if (nextPath !== source.path && this.app.vault.getAbstractFileByPath(nextPath)) { new Notice(`A file already exists at ${nextPath}.`); return false; }
    try {
      if (nextPath !== source.path) await this.app.fileManager.renameFile(source, nextPath);
      new Notice(`Renamed file to ${baseName}.`);
      return true;
    } catch (error) {
      console.error("Canvas Palette failed to rename a Canvas source file", error);
      new Notice("Could not rename the file.");
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
    this.findLinkedCanvas(item);
  }

  findLinkedCanvas(item: PaletteItem): void {
    const locations = this.store.numberedCanvasLinks(item);
    if (locations.length === 0) { new Notice("This Palette item has no linked Canvas location."); return; }
    const reveal = async (location: NumberedCanvasLink): Promise<void> => {
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
      void this.canvasSyncQueue.enqueue(file.path, () => this.syncCanvasFileToPalette(file));
    }, 150));
  }

  private async syncCanvasFileToPalette(file: TFile): Promise<void> {
    try {
      const result = await this.canvas.syncItemsFromCanvas(file, this.store.allItems());
      const existingNodeIds = mergeCanvasNodeIds(result.nodeIds, this.canvas.openNodeIds(file.path));
      const linksChanged = this.store.reconcileCanvasLinks(file.path, existingNodeIds);
      if (result.changedItems > 0 || linksChanged) {
        this.store.changed(linksChanged ? { kind: "all" } : { kind: "items", itemIds: result.changedItemIds });
        for (const id of result.changedItemIds) { const item = this.store.data.items[id]; if (item?.type === "card") await this.syncPaletteItemToCanvas(item); }
      }
    } catch (error) { console.error("Canvas Palette failed to synchronize original Canvas items", error); }
  }

  async exportActiveWorkspace(): Promise<void> {
    const workspace = this.activeWorkspace();
    if (!workspace) return;
    await this.beginExport((context) => this.canvas.createTreeBundle(this.exportTree(workspace.id), context));
  }

  async exportCollectionSubtree(collectionId: string): Promise<void> {
    const collection = this.store.data.collections[collectionId];
    if (!collection) return;
    await this.beginExport((context) => this.canvas.createTreeBundle(this.exportTree(collection.workspaceId, collectionId), context));
  }

  private async beginExport(createBundle: (context: import("./canvas/canvas-adapter").CanvasContext) => import("./canvas/canvas-adapter").ExportBundle): Promise<boolean> {
    const target = await new Promise<TFile | null>((resolve) => new CanvasTargetModal(this.app, this.canvas.canvasFiles(), this.canvas.activeContext()?.file.path ?? this.lastCanvasPath, resolve).open());
    if (!target) return false;
    const context = await this.canvas.openContext(target);
    if (!context) { new Notice("Unable to open the selected Canvas."); return false; }
    const bundle = createBundle(context);
    if (bundle.nodes.length === 0) { new Notice(bundle.warnings[0] ?? "There is nothing available to export."); return false; }
    const duplicateItemIds = this.canvas.bundleDuplicateItemIds(bundle, context);
    const mode = duplicateItemIds.length === 0 ? "copy" : await new Promise<"replace" | "copy" | null>((resolve) => new ConfirmExportDuplicateModal(this.app, duplicateItemIds.length, resolve).open());
    if (!mode) return false;
    this.exportPlacement.start(context, bundle, mode);
    return true;
  }

  private exportTree(workspaceId: string, rootCollectionId?: string): Array<{ id: string; name: string; parentId: string | null; item?: PaletteItem }> {
    const workspace = this.store.data.workspaces[workspaceId];
    if (!workspace) return [];
    const entries: Array<{ id: string; name: string; parentId: string | null; item?: PaletteItem }> = [];
    const stack = new Set<string>();
    const addEntries = (parentId: string, collectionId: string | null, parentItemId: string | null): void => {
      for (const childId of this.store.outlineEntryIds(workspaceId, collectionId, parentItemId)) {
        if (this.store.data.collections[childId]) addCollection(childId, parentId);
        else addItem(childId, parentId);
      }
    };
    const addItem = (itemId: string, parentId: string): void => {
      const item = this.store.data.items[itemId];
      if (!item || stack.has(itemId)) return;
      const id = `${parentId}/item:${item.id}`;
      entries.push({ id, name: item.displayTitle, parentId, item });
      stack.add(itemId); addEntries(id, null, item.id); stack.delete(itemId);
    };
    const addCollection = (collectionId: string, parentId: string): void => {
      const collection = this.store.data.collections[collectionId];
      if (!collection || collection.workspaceId !== workspaceId || stack.has(collectionId)) return;
      const id = `${parentId}/collection:${collection.id}`;
      entries.push({ id, name: collection.name, parentId });
      stack.add(collectionId); addEntries(id, collection.id, null); stack.delete(collectionId);
    };
    if (rootCollectionId) {
      const collection = this.store.data.collections[rootCollectionId];
      if (!collection || collection.workspaceId !== workspaceId) return [];
      const root = `collection:${collection.id}`;
      entries.push({ id: root, name: collection.name, parentId: null });
      addEntries(root, collection.id, null);
      return entries;
    }
    const root = `workspace:${workspace.id}`;
    entries.push({ id: root, name: workspace.name, parentId: null });
    addEntries(root, null, null);
    return entries;
  }

  private exportSelectedItemTree(itemIds: string[]): Array<{ id: string; name: string; parentId: string | null; item: PaletteItem }> {
    const selected = new Set(itemIds.filter((id) => Boolean(this.store.data.items[id])));
    if (selected.size === 0) return [];
    const parentByChild = new Map<string, string>();
    for (const item of this.store.allItems()) for (const childId of item.childItemIds ?? []) if (!parentByChild.has(childId)) parentByChild.set(childId, item.id);
    const hasSelectedAncestor = (itemId: string): boolean => {
      const visited = new Set<string>();
      let parentId = this.store.data.items[itemId]?.parentItemId ?? parentByChild.get(itemId) ?? null;
      while (parentId && !visited.has(parentId)) {
        if (selected.has(parentId)) return true;
        visited.add(parentId);
        parentId = this.store.data.items[parentId]?.parentItemId ?? parentByChild.get(parentId) ?? null;
      }
      return false;
    };
    const entries: Array<{ id: string; name: string; parentId: string | null; item: PaletteItem }> = [];
    const added = new Set<string>();
    const addItem = (itemId: string, parentId: string | null, path: Set<string>): void => {
      const item = this.store.data.items[itemId];
      if (!item || path.has(itemId) || added.has(itemId)) return;
      const id = `mindmap:item:${item.id}`;
      entries.push({ id, name: item.displayTitle, parentId, item });
      added.add(itemId);
      const nextPath = new Set(path); nextPath.add(itemId);
      for (const childId of item.childItemIds ?? []) addItem(childId, id, nextPath);
    };
    for (const itemId of selected) if (!hasSelectedAncestor(itemId)) addItem(itemId, null, new Set<string>());
    return entries;
  }

  private exportOutlineSelectionTree(targets: OutlineSelectionTarget[]): Array<{ id: string; name: string; parentId: string | null; item?: PaletteItem }> {
    const workspace = this.activeWorkspace();
    if (!workspace) return [];
    const selectedCollections = new Set(targets.filter((target) => target.kind === "collection").map((target) => target.id)
      .filter((id) => this.store.data.collections[id]?.workspaceId === workspace.id));
    const selectedItems = new Set(targets.filter((target) => target.kind === "item").map((target) => target.id)
      .filter((id) => Boolean(this.store.data.items[id])));
    const entries: Array<{ id: string; name: string; parentId: string | null; item?: PaletteItem }> = [];
    for (const collectionId of selectedCollections) {
      const collection = this.store.data.collections[collectionId];
      entries.push({ id: `mindmap:collection:${collection.id}`, name: collection.name, parentId: collection.parentId && selectedCollections.has(collection.parentId) ? `mindmap:collection:${collection.parentId}` : null });
    }
    const parentByChild = new Map<string, string>();
    for (const candidate of this.store.allItems()) for (const childId of candidate.childItemIds ?? []) if (!parentByChild.has(childId)) parentByChild.set(childId, candidate.id);
    for (const itemId of selectedItems) {
      const item = this.store.data.items[itemId];
      const parentItemId = item.parentItemId ?? parentByChild.get(item.id) ?? null;
      const containingCollection = Object.values(this.store.data.collections).find((collection) => collection.workspaceId === workspace.id && collection.itemIds.includes(item.id));
      const parentId = parentItemId && selectedItems.has(parentItemId)
        ? `mindmap:item:${parentItemId}`
        : containingCollection && selectedCollections.has(containingCollection.id) ? `mindmap:collection:${containingCollection.id}` : null;
      entries.push({ id: `mindmap:item:${item.id}`, name: item.displayTitle, parentId, item });
    }
    return entries;
  }

  async openSidePalette(): Promise<void> { await this.activateSidePalette(); }

  private canvasBaseName(path: string): string { return path.split("/").pop()?.replace(/\.canvas$/i, "") || "Canvas"; }

  private async activateSidePalette(): Promise<SidePaletteView | null> {
    const existing = this.app.workspace.getLeavesOfType(SIDE_PALETTE_VIEW)[0];
    const leaf = existing ?? this.app.workspace.getRightLeaf(false);
    if (!leaf) return null;
    if (!existing) await leaf.setViewState({ type: SIDE_PALETTE_VIEW, active: true });
    this.app.workspace.revealLeaf(leaf);
    return leaf.view instanceof SidePaletteView ? leaf.view : null;
  }
}
