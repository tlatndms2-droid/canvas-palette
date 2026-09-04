import type CanvasPalettePlugin from "../main";
import { DEFAULT_SIDE_LAYOUT, migrateData } from "./defaults";
import { createId } from "./ids";
import type { CardFace, Collection, NumberedCanvasLink, PaletteData, PaletteItem, PaletteMetadata, PaletteWorkspace } from "./types";

type Listener = () => void;

export class PaletteStore {
  data: PaletteData = migrateData(null);
  private listeners = new Set<Listener>();
  private saveTimer: number | null = null;

  constructor(private readonly plugin: CanvasPalettePlugin) {}

  async load(): Promise<void> {
    this.data = migrateData(await this.plugin.loadData() as Partial<PaletteData> | null);
    this.ensureArchiveWorkspace(false);
    const migratedOutlineStructures = this.migrateOutlineStructuresToCollections();
    const repairedDuplicates = this.repairDuplicateCanvasItems();
    if (!this.data.uiState.activeWorkspaceId || !this.data.workspaces[this.data.uiState.activeWorkspaceId]) this.data.uiState.activeWorkspaceId = this.archiveWorkspace().id;
    if (migratedOutlineStructures || repairedDuplicates) await this.flush();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  changed(): void {
    for (const listener of this.listeners) listener();
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.flush(), 150);
  }

  async flush(): Promise<void> {
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = null;
    await this.plugin.saveData(this.data);
  }

  createWorkspace(name: string, kind: "general" | "canvas" = "general", ownerCanvasPath: string | null = null, representative = false): PaletteWorkspace {
    const id = createId("workspace");
    const now = Date.now();
    const owner = kind === "canvas" ? ownerCanvasPath : null;
    const workspace: PaletteWorkspace = { id, name, kind, ownerCanvasPath: owner, canvasPaths: owner ? [owner] : [], representativeCanvasPath: representative && owner ? owner : null, rootCollectionIds: [], looseItemIds: [], sideLayout: structuredClone(DEFAULT_SIDE_LAYOUT), createdAt: now, modifiedAt: now };
    this.data.workspaces[id] = workspace;
    if (representative && owner) this.setRepresentativeWorkspace(id, owner, false);
    this.data.uiState.activeWorkspaceId ??= id;
    this.changed();
    return workspace;
  }

  saveOutlineCollection(workspaceId: string, input: { name: string; roots: string[]; children: Record<string, string[]>; items: PaletteItem[] }): "saved" | "missing" {
    const workspace = this.data.workspaces[workspaceId];
    if (!workspace) return "missing";
    const collection = this.createCollection(workspaceId, input.name);
    const mapped = new Map<string, string>();
    for (const item of input.items) {
      const sourceReferencePath = item.type === "markdown" ? item.origin.filePath : item.sourceReferencePath;
      const stored: PaletteItem = {
        ...structuredClone(item),
        id: createId(item.type === "markdown" ? "card" : item.type),
        type: item.type === "markdown" ? "card" : item.type,
        origin: { workspaceId },
        canvasPlacements: [],
        parentItemId: null,
        childItemIds: [],
        ...(sourceReferencePath ? { sourceReferencePath } : {})
      };
      this.data.items[stored.id] = stored;
      const nodeId = item.origin.canvasNodeId;
      if (nodeId) mapped.set(nodeId, stored.id);
    }
    const roots = [...new Set(input.roots.map((id) => mapped.get(id)).filter((id): id is string => Boolean(id)))];
    const children: Record<string, string[]> = {};
    for (const [parentNodeId, nodeIds] of Object.entries(input.children)) {
      const parentId = mapped.get(parentNodeId); if (!parentId || !this.data.items[parentId]) continue;
      children[parentId] = [...new Set(nodeIds.map((nodeId) => mapped.get(nodeId)).filter((id): id is string => Boolean(id)))];
    }
    collection.itemIds.push(...roots);
    for (const [parentId, childIds] of Object.entries(children)) {
      const parent = this.data.items[parentId]; if (!parent) continue;
      parent.childItemIds = childIds;
      for (const childId of childIds) { const child = this.data.items[childId]; if (child) child.parentItemId = parentId; }
    }
    workspace.modifiedAt = Date.now(); this.changed();
    return "saved";
  }

  private migrateOutlineStructuresToCollections(): boolean {
    let migrated = false;
    for (const workspace of Object.values(this.data.workspaces)) {
      const structures = workspace.outlineStructures ?? [];
      if (structures.length === 0) continue;
      for (const structure of structures) {
        const name = structure.canvasPath.split("/").pop()?.replace(/\.canvas$/i, "") || "Canvas 구조";
        const collection = this.createCollection(workspace.id, name);
        const roots = structure.rootItemIds.filter((id) => Boolean(this.data.items[id]));
        collection.itemIds.push(...roots);
        workspace.looseItemIds = workspace.looseItemIds.filter((id) => !roots.includes(id));
        for (const [parentId, childIds] of Object.entries(structure.childItemIds)) {
          const parent = this.data.items[parentId]; if (!parent) continue;
          const children = childIds.filter((id) => Boolean(this.data.items[id]));
          parent.childItemIds = children;
          for (const childId of children) this.data.items[childId].parentItemId = parentId;
        }
      }
      workspace.outlineStructures = [];
      migrated = true;
    }
    return migrated;
  }


  archiveWorkspace(): PaletteWorkspace { return this.ensureArchiveWorkspace(true); }

  private ensureArchiveWorkspace(notify: boolean): PaletteWorkspace {
    const existing = Object.values(this.data.workspaces).find((workspace) => workspace.kind === "archive");
    if (existing) return existing;
    const now = Date.now();
    const archive: PaletteWorkspace = { id: "canvas-palette-archive", name: "Archive", kind: "archive", ownerCanvasPath: null, canvasPaths: [], representativeCanvasPath: null, rootCollectionIds: [], looseItemIds: [], sideLayout: structuredClone(DEFAULT_SIDE_LAYOUT), createdAt: now, modifiedAt: now };
    this.data.workspaces[archive.id] = archive;
    if (notify) this.changed();
    return archive;
  }

  ensureCanvasWorkspace(canvasPath: string, name: string): PaletteWorkspace {
    const existing = this.canvasWorkspaces(canvasPath);
    if (existing.length > 0) {
      if (!existing.some((workspace) => workspace.representativeCanvasPath === canvasPath)) this.setRepresentativeWorkspace(existing[0].id, canvasPath);
      return this.representativeWorkspaceForCanvas(canvasPath) ?? existing[0];
    }
    return this.createWorkspace(name, "canvas", canvasPath, true);
  }

  canvasWorkspaces(canvasPath: string): PaletteWorkspace[] {
    return Object.values(this.data.workspaces).filter((workspace) => workspace.kind === "canvas" && workspace.ownerCanvasPath === canvasPath);
  }

  representativeWorkspaceForCanvas(canvasPath: string): PaletteWorkspace | undefined {
    return this.canvasWorkspaces(canvasPath).find((workspace) => workspace.representativeCanvasPath === canvasPath);
  }

  setRepresentativeWorkspace(workspaceId: string, canvasPath: string, notify = true): boolean {
    const workspace = this.data.workspaces[workspaceId];
    if (!workspace || workspace.kind !== "canvas" || workspace.ownerCanvasPath !== canvasPath) return false;
    const now = Date.now();
    for (const candidate of this.canvasWorkspaces(canvasPath)) { candidate.representativeCanvasPath = candidate.id === workspaceId ? canvasPath : null; candidate.modifiedAt = now; }
    if (notify) this.changed();
    return true;
  }

  makeWorkspaceGeneral(id: string): boolean {
    const workspace = this.data.workspaces[id];
    if (!workspace || workspace.kind !== "canvas") return false;
    workspace.kind = "general";
    workspace.ownerCanvasPath = null;
    workspace.canvasPaths = [];
    workspace.representativeCanvasPath = null;
    workspace.modifiedAt = Date.now();
    this.changed();
    return true;
  }

  /** Changes only the Workspace's organizing Canvas. Item identity and Canvas placements stay intact. */
  moveWorkspaces(ids: string[], ownerCanvasPath: string | null): string[] {
    const moved: string[] = [];
    const now = Date.now();
    for (const id of new Set(ids)) {
      const workspace = this.data.workspaces[id];
      if (!workspace || workspace.kind === "archive") continue;
      if (ownerCanvasPath && workspace.kind === "canvas" && workspace.ownerCanvasPath === ownerCanvasPath) continue;
      if (!ownerCanvasPath && workspace.kind === "general") continue;
      workspace.kind = ownerCanvasPath ? "canvas" : "general";
      workspace.ownerCanvasPath = ownerCanvasPath;
      workspace.canvasPaths = ownerCanvasPath ? [ownerCanvasPath] : [];
      workspace.representativeCanvasPath = null;
      workspace.modifiedAt = now;
      moved.push(id);
    }
    if (moved.length) this.changed();
    return moved;
  }

  removeWorkspaces(ids: string[]): string[] {
    const removed = [...new Set(ids)].filter((id) => {
      const workspace = this.data.workspaces[id];
      return Boolean(workspace && workspace.kind !== "archive");
    });
    if (!removed.length) return [];
    const removedSet = new Set(removed);
    const archive = this.archiveWorkspace();
    const itemIds = new Set<string>();
    for (const id of removed) for (const item of this.itemsForWorkspace(id)) itemIds.add(item.id);
    const survivingWorkspaceForItem = (itemId: string): PaletteWorkspace | undefined => Object.values(this.data.workspaces).find((workspace) => !removedSet.has(workspace.id) && workspace.kind !== "archive" && this.itemsForWorkspace(workspace.id).some((item) => item.id === itemId));
    const removeCollection = (collectionId: string): void => {
      const collection = this.data.collections[collectionId];
      if (!collection) return;
      for (const childId of collection.childCollectionIds) removeCollection(childId);
      delete this.data.collections[collectionId];
    };
    for (const id of removed) {
      const workspace = this.data.workspaces[id];
      if (!workspace) continue;
      for (const collectionId of workspace.rootCollectionIds) removeCollection(collectionId);
      delete this.data.workspaces[id];
    }
    for (const itemId of itemIds) {
      const item = this.data.items[itemId];
      if (!item) continue;
      const survivor = survivingWorkspaceForItem(itemId);
      if (survivor) {
        if (removedSet.has(item.origin.workspaceId ?? "")) item.origin.workspaceId = survivor.id;
        continue;
      }
      item.origin.workspaceId = archive.id;
      if (!archive.looseItemIds.includes(itemId)) archive.looseItemIds.push(itemId);
    }
    if (this.data.uiState.activeWorkspaceId && removedSet.has(this.data.uiState.activeWorkspaceId)) this.data.uiState.activeWorkspaceId = archive.id;
    this.changed();
    return removed;
  }

  canStoreItem(workspaceId: string, item: PaletteItem): boolean {
    const workspace = this.data.workspaces[workspaceId];
    if (!workspace) return false;
    if (workspace.kind === "general") return true;
    const owner = workspace.ownerCanvasPath;
    if (!owner) return false;
    return item.origin.canvasPath === owner || item.canvasPlacements.some((placement) => placement.canvasPath === owner && placement.nodeIds.length > 0);
  }

  createCollection(workspaceId: string, name: string, parentId: string | null = null): Collection {
    const id = createId("collection");
    const collection: Collection = { id, workspaceId, parentId, name, childCollectionIds: [], itemIds: [] };
    this.data.collections[id] = collection;
    if (parentId) this.data.collections[parentId]?.childCollectionIds.push(id);
    else this.data.workspaces[workspaceId]?.rootCollectionIds.push(id);
    this.changed();
    return collection;
  }

  renameWorkspace(id: string, name: string): boolean {
    const workspace = this.data.workspaces[id];
    const next = name.trim();
    if (!workspace || !next) return false;
    workspace.name = next;
    workspace.modifiedAt = Date.now();
    this.changed();
    return true;
  }

  removeWorkspace(id: string): boolean {
    return this.removeWorkspaces([id]).length > 0;
  }

  queueDeletedCanvasWorkspaceCleanup(canvasPath: string): void {
    if (!this.data.uiState.pendingCanvasWorkspaceCleanup.includes(canvasPath)) this.data.uiState.pendingCanvasWorkspaceCleanup.push(canvasPath);
    this.changed();
  }

  clearDeletedCanvasWorkspaceCleanup(canvasPath: string): void {
    this.data.uiState.pendingCanvasWorkspaceCleanup = this.data.uiState.pendingCanvasWorkspaceCleanup.filter((path) => path !== canvasPath);
    this.changed();
  }

  cloneItemsToArchive(itemIds: string[]): PaletteItem[] {
    const archive = this.archiveWorkspace();
    const selected = new Set(itemIds.filter((id) => Boolean(this.data.items[id])));
    const idMap = new Map<string, string>();
    for (const id of selected) idMap.set(id, createId("archive"));
    const copies: PaletteItem[] = [];
    const now = Date.now();
    for (const id of selected) {
      const source = this.data.items[id];
      const copy = structuredClone(source);
      copy.id = idMap.get(id)!;
      copy.archivedFromItemId = source.id;
      copy.createdAt = now; copy.modifiedAt = now;
      copy.origin = { workspaceId: archive.id };
      copy.canvasPlacements = [];
      copy.parentItemId = source.parentItemId && idMap.has(source.parentItemId) ? idMap.get(source.parentItemId)! : null;
      copy.childItemIds = (source.childItemIds ?? []).filter((childId) => idMap.has(childId)).map((childId) => idMap.get(childId)!);
      this.data.items[copy.id] = copy;
      archive.looseItemIds.push(copy.id);
      copies.push(copy);
    }
    if (copies.length) this.changed();
    return copies;
  }

  addPending(item: PaletteItem): void {
    if (this.existingCollectedItem(item)) return;
    this.data.items[item.id] = item;
    if (!this.data.pendingItemIds.includes(item.id)) this.data.pendingItemIds.push(item.id);
    this.changed();
  }

  collectCanvasItems(items: PaletteItem[]): string[] {
    const collected: string[] = [];
    for (const captured of items) {
      const item = this.existingCollectedItem(captured) ?? captured;
      if (!this.data.items[item.id]) this.data.items[item.id] = item;
      if (!this.data.pendingItemIds.includes(item.id)) this.data.pendingItemIds.push(item.id);
      if (!collected.includes(item.id)) collected.push(item.id);
    }
    this.changed();
    return collected;
  }

  addToWorkspace(workspaceId: string, item: PaletteItem): boolean {
    return this.addToWorkspaceWithCanvasOverride(workspaceId, item, false);
  }

  addToWorkspaceAsUnlinked(workspaceId: string, item: PaletteItem): boolean {
    return this.addToWorkspaceWithCanvasOverride(workspaceId, item, true);
  }

  private addToWorkspaceWithCanvasOverride(workspaceId: string, item: PaletteItem, allowForeignCanvas: boolean): boolean {
    item = this.existingCollectedItem(item) ?? item;
    const workspace = this.data.workspaces[workspaceId];
    if (!workspace || (!allowForeignCanvas && !this.canStoreItem(workspaceId, item))) return false;
    this.detachWorkspaceLinks(item.id);
    if (allowForeignCanvas) this.detachCanvasLinks(item);
    item.origin.workspaceId = workspaceId;
    item.parentItemId ??= null;
    item.childItemIds ??= [];
    this.data.items[item.id] = item;
    if (!workspace.looseItemIds.includes(item.id)) workspace.looseItemIds.push(item.id);
    if (item.origin.canvasPath && !workspace.canvasPaths.includes(item.origin.canvasPath)) workspace.canvasPaths.push(item.origin.canvasPath);
    if (workspace.kind === "general" && item.origin.canvasPath && !workspace.representativeCanvasPath) workspace.representativeCanvasPath = item.origin.canvasPath;
    this.changed();
    return true;
  }

  importPending(workspaceId: string, itemIds: string[], asUnlinked = false): { imported: string[]; rejected: string[]; alreadySaved: string[] } {
    const workspace = this.data.workspaces[workspaceId];
    if (!workspace) return { imported: [], rejected: [...itemIds], alreadySaved: [] };
    const imported: string[] = []; const rejected: string[] = []; const alreadySaved: string[] = [];
    for (const id of itemIds) {
      const item = this.data.items[id];
      if (!item) continue;
      if (this.workspaceForItem(id)?.id === workspaceId) { alreadySaved.push(id); continue; }
      this.detachWorkspaceLinks(id);
      if (asUnlinked) this.detachCanvasLinks(item);
      item.origin.workspaceId = workspaceId;
      item.parentItemId = null;
      item.childItemIds ??= [];
      if (workspace.kind === "general" && item.origin.canvasPath && !workspace.canvasPaths.includes(item.origin.canvasPath)) workspace.canvasPaths.push(item.origin.canvasPath);
      if (workspace.kind === "general" && item.origin.canvasPath && !workspace.representativeCanvasPath) workspace.representativeCanvasPath = item.origin.canvasPath;
      if (!workspace.looseItemIds.includes(id)) workspace.looseItemIds.push(id);
      imported.push(id);
    }
    this.data.pendingItemIds = this.data.pendingItemIds.filter((id) => !imported.includes(id));
    this.changed();
    return { imported, rejected, alreadySaved };
  }

  updateItem(id: string, changes: Pick<PaletteItem, "displayTitle" | "tags" | "label" | "caption"> & Partial<Pick<PaletteItem, "content" | "backContent" | "labelColor" | "captionFontSize">>): void {
    const item = this.data.items[id];
    if (!item) return;
    Object.assign(item, changes, { modifiedAt: Date.now() });
    this.applyItemMetadataToLinkedNodes(item);
    this.changed();
    void this.plugin.syncPaletteItemToCanvas(item);
  }

  convertCardToMarkdown(id: string, filePath: string): boolean {
    const item = this.data.items[id];
    if (!item || item.type !== "card") return false;
    item.type = "markdown";
    item.origin.filePath = filePath;
    delete item.sourceDeletedAt;
    delete item.origin.textRange;
    item.modifiedAt = Date.now();
    this.changed();
    return true;
  }

  setItemBack(id: string, backContent: string): void {
    const item = this.data.items[id];
    if (!item || item.backContent === backContent) return;
    item.facesEnabled = true;
    this.updateItem(id, { displayTitle: item.displayTitle, tags: item.tags, label: item.label, labelColor: item.labelColor, caption: item.caption, backContent });
  }

  setPaletteFace(location: "side" | "mini", itemId: string, face: CardFace): void {
    if (location === "side") (this.data.uiState.sideItemFaces ??= {})[itemId] = face;
    else (this.data.uiState.miniItemFaces ??= {})[itemId] = face;
    this.changed();
  }

  enableItemFaces(itemId: string): void {
    const item = this.data.items[itemId];
    if (!item || item.type === "group" || item.facesEnabled) return;
    item.facesEnabled = true;
    item.modifiedAt = Date.now();
    this.applyItemMetadataToLinkedNodes(item);
    this.changed();
  }

  disableItemFaces(itemId: string): void {
    const item = this.data.items[itemId];
    if (!item || item.type === "group" || !item.facesEnabled) return;
    const modifiedAt = Date.now();
    item.facesEnabled = false;
    item.modifiedAt = modifiedAt;
    delete (this.data.uiState.sideItemFaces ??= {})[item.id];
    delete (this.data.uiState.miniItemFaces ??= {})[item.id];
    for (const location of this.linkedCanvasNodes(item)) {
      const linkedState = this.canvasNodeState(location.canvasPath, location.nodeId);
      this.setMetadataRecord(location.canvasPath, location.nodeId, { ...linkedState, currentFace: "front", facesEnabled: false }, modifiedAt);
    }
    this.changed();
  }

  getCanvasNodeMetadata(canvasPath: string, nodeId: string): PaletteMetadata | undefined {
    return this.data.canvasNodeMetadata[canvasPath]?.[nodeId];
  }

  linkedItemForNode(canvasPath: string, nodeId: string): PaletteItem | undefined {
    return this.allItems().find((item) => this.itemHasLinkedNode(item, canvasPath, nodeId));
  }

  existingCollectedItem(item: PaletteItem): PaletteItem | undefined {
    for (const location of this.linkedCanvasNodes(item)) {
      const existing = this.linkedItemForNode(location.canvasPath, location.nodeId);
      if (existing && existing.id !== item.id) return existing;
    }
    return this.data.items[item.id];
  }

  setCanvasNodeMetadata(canvasPath: string, nodeId: string, metadata: Pick<PaletteMetadata, "tags" | "label" | "labelColor" | "caption">): void {
    const modifiedAt = Date.now();
    const normalized = {
      tags: [...new Set(metadata.tags)],
      label: metadata.label,
      labelColor: metadata.label ? metadata.labelColor ?? "" : "",
      caption: metadata.caption
    };
    this.setMetadataRecord(canvasPath, nodeId, normalized, modifiedAt);
    const linkedItems = Object.values(this.data.items).filter((item) => this.itemHasLinkedNode(item, canvasPath, nodeId));
    for (const item of linkedItems) {
      Object.assign(item, normalized, { modifiedAt });
      this.applyItemMetadataToLinkedNodes(item);
    }
    this.changed();
    for (const item of linkedItems) void this.plugin.syncPaletteItemToCanvas(item);
  }

  setCanvasCaptionFontSize(value: number): void {
    const next = this.captionFontSize(value);
    if (this.data.settings.canvasCaptionFontSize === next) return;
    this.data.settings.canvasCaptionFontSize = next;
    this.changed();
  }

  setCanvasNodeBack(canvasPath: string, nodeId: string, backContent: string): void {
    const current = this.canvasNodeState(canvasPath, nodeId);
    const modifiedAt = Date.now();
    this.setMetadataRecord(canvasPath, nodeId, { ...current, backContent, facesEnabled: true }, modifiedAt);
    const linkedItems = Object.values(this.data.items).filter((item) => this.itemHasLinkedNode(item, canvasPath, nodeId));
    for (const item of linkedItems) {
      item.backContent = backContent;
      item.facesEnabled = true;
      item.modifiedAt = modifiedAt;
      this.applyItemMetadataToLinkedNodes(item);
    }
    this.changed();
  }

  setCanvasNodeFace(canvasPath: string, nodeId: string, currentFace: CardFace): void {
    const current = this.canvasNodeState(canvasPath, nodeId);
    this.setMetadataRecord(canvasPath, nodeId, { ...current, currentFace }, current.modifiedAt);
    this.changed();
  }

  enableCanvasNodeFaces(canvasPath: string, nodeId: string): void {
    const current = this.canvasNodeState(canvasPath, nodeId);
    const linkedItems = Object.values(this.data.items).filter((item) => this.itemHasLinkedNode(item, canvasPath, nodeId));
    if (current.facesEnabled && linkedItems.every((item) => item.facesEnabled)) return;
    this.setMetadataRecord(canvasPath, nodeId, { ...current, facesEnabled: true }, current.modifiedAt);
    for (const item of linkedItems) {
      item.facesEnabled = true;
      this.applyItemMetadataToLinkedNodes(item);
    }
    this.changed();
  }

  disableCanvasNodeFaces(canvasPath: string, nodeId: string): void {
    const current = this.canvasNodeState(canvasPath, nodeId);
    const linkedItems = Object.values(this.data.items).filter((item) => this.itemHasLinkedNode(item, canvasPath, nodeId));
    const modifiedAt = Date.now();
    this.setMetadataRecord(canvasPath, nodeId, { ...current, currentFace: "front", facesEnabled: false }, modifiedAt);
    for (const item of linkedItems) {
      item.facesEnabled = false;
      item.modifiedAt = modifiedAt;
      delete (this.data.uiState.sideItemFaces ??= {})[item.id];
      delete (this.data.uiState.miniItemFaces ??= {})[item.id];
      this.applyItemMetadataToLinkedNodes(item);
      for (const location of this.linkedCanvasNodes(item)) {
        const linkedState = this.canvasNodeState(location.canvasPath, location.nodeId);
        this.setMetadataRecord(location.canvasPath, location.nodeId, { ...linkedState, currentFace: "front", facesEnabled: false }, modifiedAt);
      }
    }
    this.changed();
  }

  unlinkCanvasNode(canvasPath: string, nodeId: string): boolean {
    const item = this.allItems().find((candidate) => this.itemHasLinkedNode(candidate, canvasPath, nodeId));
    if (!item) return false;
    const current = this.canvasNodeState(canvasPath, nodeId);
    this.setMetadataRecord(canvasPath, nodeId, { ...current, tags: [...item.tags], label: item.label, labelColor: item.labelColor ?? "", caption: item.caption, captionFontSize: this.captionFontSize(item.captionFontSize), backContent: item.backContent, facesEnabled: item.facesEnabled }, item.modifiedAt);
    if (item.origin.canvasPath === canvasPath && item.origin.canvasNodeId === nodeId) { delete item.origin.canvasPath; delete item.origin.canvasNodeId; }
    for (const placement of item.canvasPlacements) if (placement.canvasPath === canvasPath) placement.nodeIds = placement.nodeIds.filter((id) => id !== nodeId);
    item.canvasPlacements = item.canvasPlacements.filter((placement) => placement.nodeIds.length > 0);
    this.promotePlacement(item);
    this.changed();
    return true;
  }

  addLabelColorPreset(color: string): void {
    const normalized = color.trim().toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(normalized) || this.data.settings.labelColorPresets.includes(normalized)) return;
    this.data.settings.labelColorPresets.push(normalized);
    this.changed();
  }

  reorderItems(workspaceId: string, sourceId: string, targetId: string, insertAfter = false): void {
    const workspace = this.data.workspaces[workspaceId];
    if (!workspace || sourceId === targetId) return;
    const containers = this.itemContainers(workspaceId);
    const target = containers.find((ids) => ids.includes(targetId));
    if (!target || !containers.some((ids) => ids.includes(sourceId))) return;
    for (const ids of containers) { const index = ids.indexOf(sourceId); if (index >= 0) ids.splice(index, 1); }
    const targetIndex = target.indexOf(targetId);
    target.splice(targetIndex + (insertAfter ? 1 : 0), 0, sourceId);
    this.changed();
  }

  moveItems(workspaceId: string, itemIds: string[], collectionId: string | null, targetId: string | null = null, insertAfter = false, parentItemId: string | null = null): void {
    const workspace = this.data.workspaces[workspaceId];
    if (!workspace) return;
    const requested = [...new Set(itemIds)].filter((id) => this.data.items[id]);
    const valid = requested.filter((id) => !requested.some((candidate) => candidate !== id && this.isItemDescendant(id, candidate)));
    if (parentItemId && (valid.includes(parentItemId) || valid.some((id) => this.isItemDescendant(parentItemId, id)))) return;
    const containers = this.itemContainers(workspaceId);
    if (!valid.some((id) => containers.some((ids) => ids.includes(id)))) return;
    for (const ids of containers) for (const id of valid) { const index = ids.indexOf(id); if (index >= 0) ids.splice(index, 1); }
    for (const id of valid) this.data.items[id].parentItemId = parentItemId;
    const collection = collectionId ? this.data.collections[collectionId] : null;
    const parentItem = parentItemId ? this.data.items[parentItemId] : null;
    const target = parentItem ? (parentItem.childItemIds ??= []) : collection?.workspaceId === workspaceId ? collection.itemIds : workspace.looseItemIds;
    const targetIndex = targetId ? target.indexOf(targetId) : -1;
    target.splice(targetIndex >= 0 ? targetIndex + (insertAfter ? 1 : 0) : target.length, 0, ...valid);
    this.changed();
  }

  assignItemsToCollection(workspaceId: string, itemIds: string[], collectionId: string | null): void {
    this.moveItems(workspaceId, itemIds, collectionId);
  }

  renameCollection(id: string, name: string): void {
    const collection = this.data.collections[id];
    if (!collection || !name.trim()) return;
    collection.name = name.trim();
    this.changed();
  }

  removeCollection(id: string): void {
    const collection = this.data.collections[id];
    if (!collection) return;
    const workspace = this.data.workspaces[collection.workspaceId];
    if (!workspace) return;
    const parent = collection.parentId ? this.data.collections[collection.parentId] : undefined;
    const siblingIds = parent?.childCollectionIds ?? workspace.rootCollectionIds;
    const index = siblingIds.indexOf(id);
    const promotedChildren = collection.childCollectionIds.filter((childId) => this.data.collections[childId]);
    if (index >= 0) siblingIds.splice(index, 1, ...promotedChildren);
    else siblingIds.push(...promotedChildren.filter((childId) => !siblingIds.includes(childId)));
    for (const childId of promotedChildren) this.data.collections[childId].parentId = collection.parentId;
    const itemTarget = parent?.itemIds ?? workspace.looseItemIds;
    itemTarget.push(...collection.itemIds.filter((itemId) => !itemTarget.includes(itemId)));
    workspace.sideLayout.collapsedCollectionIds = workspace.sideLayout.collapsedCollectionIds.filter((collectionId) => collectionId !== id);
    if (workspace.sideLayout.focusedCollectionId === id) workspace.sideLayout.focusedCollectionId = collection.parentId;
    if (workspace.sideLayout.selectedCollectionId === id) workspace.sideLayout.selectedCollectionId = collection.parentId;
    delete this.data.collections[id];
    this.changed();
  }

  moveCollection(id: string, parentId: string | null, targetId: string | null = null, insertAfter = false): void {
    const collection = this.data.collections[id];
    if (!collection || id === parentId || this.wouldCreateCycle(id, parentId)) return;
    const workspace = this.data.workspaces[collection.workspaceId];
    if (!workspace) return;
    if (collection.parentId) {
      const siblings = this.data.collections[collection.parentId]?.childCollectionIds;
      const index = siblings?.indexOf(id) ?? -1;
      if (siblings && index >= 0) siblings.splice(index, 1);
    }
    else workspace.rootCollectionIds = workspace.rootCollectionIds.filter((childId) => childId !== id);
    collection.parentId = parentId;
    const target = parentId ? this.data.collections[parentId]?.childCollectionIds : workspace.rootCollectionIds;
    if (!target) return;
    const targetIndex = targetId ? target.indexOf(targetId) : -1;
    target.splice(targetIndex >= 0 ? targetIndex + (insertAfter ? 1 : 0) : target.length, 0, id);
    this.changed();
  }

  associateCanvas(workspaceId: string, canvasPath: string, representative = false): void {
    const workspace = this.data.workspaces[workspaceId];
    if (!workspace) return;
    if (!workspace.canvasPaths.includes(canvasPath)) workspace.canvasPaths.push(canvasPath);
    if (workspace.kind === "canvas") {
      if (representative && workspace.ownerCanvasPath === canvasPath) this.setRepresentativeWorkspace(workspaceId, canvasPath, false);
    } else if (representative || !workspace.representativeCanvasPath) workspace.representativeCanvasPath = canvasPath;
    this.changed();
  }

  recordCanvasPlacement(itemId: string, canvasPath: string, nodeIds: string[]): void {
    const item = this.data.items[itemId];
    if (!item) return;
    const placement = item.canvasPlacements.find((candidate) => candidate.canvasPath === canvasPath);
    if (placement) {
      placement.nodeIds = [...new Set([...placement.nodeIds, ...nodeIds])];
      placement.placedAt = Date.now();
    } else item.canvasPlacements.push({ canvasPath, nodeIds: [...new Set(nodeIds)], placedAt: Date.now() });
    this.applyItemMetadataToLinkedNodes(item);
    const workspaceId = item.origin.workspaceId;
    if (workspaceId) this.associateCanvas(workspaceId, canvasPath);
    else this.changed();
  }

  restoreCanvasNodeMetadata(canvasPath: string, records: Array<{ nodeId: string; metadata: PaletteMetadata }>): void {
    if (records.length === 0) return;
    for (const { nodeId, metadata } of records) {
      this.setMetadataRecord(canvasPath, nodeId, metadata, metadata.modifiedAt);
    }
    this.changed();
  }

  linkedCanvasNodes(item: PaletteItem): Array<{ canvasPath: string; nodeId: string }> {
    const locations: Array<{ canvasPath: string; nodeId: string }> = [];
    if (item.origin.canvasPath && item.origin.canvasNodeId) locations.push({ canvasPath: item.origin.canvasPath, nodeId: item.origin.canvasNodeId });
    for (const placement of item.canvasPlacements) for (const nodeId of placement.nodeIds) locations.push({ canvasPath: placement.canvasPath, nodeId });
    return locations.filter((location, index, all) => all.findIndex((candidate) => candidate.canvasPath === location.canvasPath && candidate.nodeId === location.nodeId) === index);
  }

  linkedCanvasLocations(item: PaletteItem): Array<{ canvasPath: string; nodeId: string }> {
    return this.linkedCanvasNodes(item);
  }

  numberedCanvasLinks(item: PaletteItem): NumberedCanvasLink[] {
    const byCanvas = new Map<string, Array<{ canvasPath: string; nodeId: string }>>();
    for (const location of this.linkedCanvasNodes(item)) {
      const entries = byCanvas.get(location.canvasPath) ?? [];
      entries.push(location);
      byCanvas.set(location.canvasPath, entries);
    }
    return [...byCanvas.values()].flatMap((entries) => entries.map((location, index) => ({ ...location, number: index + 1, total: entries.length })));
  }

  numberedCanvasLinkForNode(canvasPath: string, nodeId: string): { item: PaletteItem; link: NumberedCanvasLink } | undefined {
    const item = this.linkedItemForNode(canvasPath, nodeId);
    if (!item) return undefined;
    const link = this.numberedCanvasLinks(item).find((candidate) => candidate.canvasPath === canvasPath && candidate.nodeId === nodeId);
    return link ? { item, link } : undefined;
  }

  reconcileCanvasLinks(canvasPath: string, existingNodeIds: Set<string>): boolean {
    let changed = false;
    for (const item of this.allItems()) {
      if (item.origin.canvasPath === canvasPath && item.origin.canvasNodeId && !existingNodeIds.has(item.origin.canvasNodeId)) {
        delete item.origin.canvasPath;
        delete item.origin.canvasNodeId;
        changed = true;
      }
      for (const placement of item.canvasPlacements.filter((candidate) => candidate.canvasPath === canvasPath)) {
        const next = placement.nodeIds.filter((nodeId) => existingNodeIds.has(nodeId));
        if (next.length !== placement.nodeIds.length) { placement.nodeIds = next; changed = true; }
      }
      const before = item.canvasPlacements.length;
      item.canvasPlacements = item.canvasPlacements.filter((placement) => placement.nodeIds.length > 0);
      if (item.canvasPlacements.length !== before) changed = true;
      if (!item.origin.canvasPath || !item.origin.canvasNodeId) changed = this.promotePlacement(item) || changed;
    }
    const metadata = this.data.canvasNodeMetadata[canvasPath];
    if (metadata) {
      for (const nodeId of Object.keys(metadata)) if (!existingNodeIds.has(nodeId)) { delete metadata[nodeId]; changed = true; }
      if (Object.keys(metadata).length === 0) delete this.data.canvasNodeMetadata[canvasPath];
    }
    return changed;
  }

  unlinkItemsFromCanvas(itemIds: string[], canvasPath: string): void {
    let changed = false;
    for (const id of itemIds) {
      const item = this.data.items[id];
      if (!item) continue;
      const linkedNodeIds = this.linkedCanvasNodes(item).filter((location) => location.canvasPath === canvasPath).map((location) => location.nodeId);
      if (item.origin.canvasPath === canvasPath) { delete item.origin.canvasPath; delete item.origin.canvasNodeId; changed = true; }
      const before = item.canvasPlacements.length;
      item.canvasPlacements = item.canvasPlacements.filter((placement) => placement.canvasPath !== canvasPath);
      if (item.canvasPlacements.length !== before) changed = true;
      for (const nodeId of linkedNodeIds) this.setMetadataRecord(canvasPath, nodeId, { tags: [], label: "", labelColor: "", caption: "" }, Date.now());
      this.promotePlacement(item);
    }
    if (changed) this.changed();
  }

  reconcileDeletedFile(path: string, folder = false): void {
    let changed = !folder && path.toLocaleLowerCase().endsWith(".canvas") ? this.reconcileCanvasLinks(path, new Set()) : false;
    const prefix = `${path}/`;
    for (const item of this.allItems()) {
      if (!item.origin.filePath || (folder ? !item.origin.filePath.startsWith(prefix) : item.origin.filePath !== path)) continue;
      item.sourceDeletedAt = Date.now();
      changed = true;
    }
    if (changed) this.changed();
  }

  renameSourcePath(oldPath: string, newPath: string, folder = false): PaletteItem[] {
    const changedItems: PaletteItem[] = [];
    const prefix = `${oldPath}/`;
    for (const item of this.allItems()) {
      const current = item.origin.filePath;
      if (!current || (folder ? !current.startsWith(prefix) : current !== oldPath)) continue;
      item.origin.filePath = folder ? `${newPath}/${current.slice(prefix.length)}` : newPath;
      delete item.sourceDeletedAt;
      item.modifiedAt = Date.now();
      changedItems.push(item);
    }
    if (changedItems.length > 0) this.changed();
    return changedItems;
  }

  renameCanvasPath(oldPath: string, newPath: string, folder = false): void {
    const prefix = `${oldPath}/`;
    const moved = (path: string): string => folder && path.startsWith(prefix) ? `${newPath}/${path.slice(prefix.length)}` : path === oldPath ? newPath : path;
    let changed = false;
    for (const item of this.allItems()) {
      if (item.origin.canvasPath) {
        const next = moved(item.origin.canvasPath);
        if (next !== item.origin.canvasPath) { item.origin.canvasPath = next; changed = true; }
      }
      for (const placement of item.canvasPlacements) {
        const next = moved(placement.canvasPath);
        if (next !== placement.canvasPath) { placement.canvasPath = next; changed = true; }
      }
    }
    for (const workspace of Object.values(this.data.workspaces)) {
      if (workspace.ownerCanvasPath) {
        const next = moved(workspace.ownerCanvasPath);
        if (next !== workspace.ownerCanvasPath) { workspace.ownerCanvasPath = next; changed = true; }
      }
      const nextPaths = [...new Set(workspace.canvasPaths.map(moved))];
      if (nextPaths.some((path, index) => path !== workspace.canvasPaths[index]) || nextPaths.length !== workspace.canvasPaths.length) {
        workspace.canvasPaths = nextPaths;
        changed = true;
      }
      if (workspace.representativeCanvasPath) {
        const next = moved(workspace.representativeCanvasPath);
        if (next !== workspace.representativeCanvasPath) { workspace.representativeCanvasPath = next; changed = true; }
      }
    }
    for (const [canvasPath, metadata] of Object.entries(this.data.canvasNodeMetadata)) {
      const next = moved(canvasPath);
      if (next === canvasPath) continue;
      this.data.canvasNodeMetadata[next] = { ...(this.data.canvasNodeMetadata[next] ?? {}), ...metadata };
      delete this.data.canvasNodeMetadata[canvasPath];
      changed = true;
    }
    if (changed) this.changed();
  }

  restoreSource(itemId: string, filePath: string): PaletteItem | null {
    const item = this.data.items[itemId];
    if (!item || item.type !== "markdown") return null;
    const previousPath = item.origin.filePath;
    const now = Date.now();
    for (const candidate of this.allItems()) {
      if (candidate.type !== "markdown" || candidate.origin.filePath !== previousPath) continue;
      candidate.origin.filePath = filePath;
      delete candidate.sourceDeletedAt;
      candidate.modifiedAt = now;
    }
    this.changed();
    return item;
  }

  updateMarkdownSource(path: string, content: string): void {
    let changed = false;
    for (const item of this.allItems()) {
      if (item.type !== "markdown" || item.origin.filePath !== path) continue;
      if (item.content !== content || item.sourceDeletedAt) {
        item.content = content;
        delete item.sourceDeletedAt;
        item.modifiedAt = Date.now();
        changed = true;
      }
    }
    if (changed) this.changed();
  }

  private itemHasLinkedNode(item: PaletteItem, canvasPath: string, nodeId: string): boolean {
    return this.linkedCanvasNodes(item).some((location) => location.canvasPath === canvasPath && location.nodeId === nodeId);
  }

  private promotePlacement(item: PaletteItem): boolean {
    if (item.origin.canvasPath && item.origin.canvasNodeId) return false;
    const placement = item.canvasPlacements.find((candidate) => candidate.nodeIds.length > 0);
    const nodeId = placement?.nodeIds.shift();
    if (!placement || !nodeId) return false;
    item.origin.canvasPath = placement.canvasPath;
    item.origin.canvasNodeId = nodeId;
    if (placement.nodeIds.length === 0) item.canvasPlacements = item.canvasPlacements.filter((candidate) => candidate !== placement);
    return true;
  }

  private applyItemMetadataToLinkedNodes(item: PaletteItem): void {
    const normalized = { tags: [...new Set(item.tags)], label: item.label, labelColor: item.label ? item.labelColor ?? "" : "", caption: item.caption, backContent: item.backContent, facesEnabled: item.facesEnabled };
    for (const location of this.linkedCanvasNodes(item)) {
      const currentFace = this.data.canvasNodeMetadata[location.canvasPath]?.[location.nodeId]?.currentFace ?? "front";
      this.setMetadataRecord(location.canvasPath, location.nodeId, { ...normalized, currentFace }, item.modifiedAt);
    }
  }

  replaceCanvasPlacement(itemId: string, canvasPath: string, removedNodeIds: string[], newNodeIds: string[], existingNodeIds: Set<string>): void {
    const item = this.data.items[itemId];
    if (!item) return;
    const removed = new Set(removedNodeIds);
    const replacements = [...newNodeIds];
    const replacedOrigin = item.origin.canvasPath === canvasPath && Boolean(item.origin.canvasNodeId && removed.has(item.origin.canvasNodeId));
    if (replacedOrigin) {
      const replacement = replacements.shift();
      if (replacement) item.origin.canvasNodeId = replacement;
      else { delete item.origin.canvasPath; delete item.origin.canvasNodeId; }
    }
    for (const placement of item.canvasPlacements) {
      if (placement.canvasPath !== canvasPath) continue;
      const nextNodeIds: string[] = [];
      for (const nodeId of placement.nodeIds) {
        if (!removed.has(nodeId)) nextNodeIds.push(nodeId);
        else {
          const replacement = replacements.shift();
          if (replacement && !nextNodeIds.includes(replacement)) nextNodeIds.push(replacement);
        }
      }
      placement.nodeIds = nextNodeIds;
    }
    item.canvasPlacements = item.canvasPlacements.filter((placement) => placement.nodeIds.length > 0);
    if (replacements.length > 0) {
      const placement = item.canvasPlacements.find((candidate) => candidate.canvasPath === canvasPath);
      if (placement) {
        placement.nodeIds = [...new Set([...placement.nodeIds, ...replacements])];
        placement.placedAt = Date.now();
      } else item.canvasPlacements.push({ canvasPath, nodeIds: [...new Set(replacements)], placedAt: Date.now() });
    }
    this.reconcileCanvasLinks(canvasPath, existingNodeIds);
    this.applyItemMetadataToLinkedNodes(item);
    const workspaceId = item.origin.workspaceId;
    if (workspaceId) this.associateCanvas(workspaceId, canvasPath);
    else this.changed();
  }

  private canvasNodeState(canvasPath: string, nodeId: string): PaletteMetadata {
    return this.data.canvasNodeMetadata[canvasPath]?.[nodeId] ?? { tags: [], label: "", labelColor: "", caption: "", captionFontSize: 11, backContent: "", currentFace: "front", facesEnabled: false, modifiedAt: Date.now() };
  }

  private setMetadataRecord(canvasPath: string, nodeId: string, metadata: Pick<PaletteMetadata, "tags" | "label" | "labelColor" | "caption"> & Partial<Pick<PaletteMetadata, "captionFontSize" | "backContent" | "currentFace" | "facesEnabled">>, modifiedAt: number): void {
    const previous = this.data.canvasNodeMetadata[canvasPath]?.[nodeId];
    const record: PaletteMetadata = { tags: metadata.tags, label: metadata.label, labelColor: metadata.labelColor, caption: metadata.caption, captionFontSize: this.captionFontSize(metadata.captionFontSize ?? previous?.captionFontSize), backContent: metadata.backContent ?? previous?.backContent ?? "", currentFace: metadata.currentFace ?? previous?.currentFace ?? "front", facesEnabled: metadata.facesEnabled ?? previous?.facesEnabled ?? false, modifiedAt };
    const isEmpty = record.tags.length === 0 && !record.label && !record.caption && !record.backContent && record.currentFace === "front" && !record.facesEnabled;
    if (isEmpty) {
      const canvas = this.data.canvasNodeMetadata[canvasPath];
      if (!canvas) return;
      delete canvas[nodeId];
      if (Object.keys(canvas).length === 0) delete this.data.canvasNodeMetadata[canvasPath];
      return;
    }
    const canvas = this.data.canvasNodeMetadata[canvasPath] ??= {};
    canvas[nodeId] = record;
  }

  private captionFontSize(value: number | undefined): number { return Math.max(8, Math.min(32, Number.isFinite(value) ? Math.round(value as number) : 11)); }

  itemsForWorkspace(workspaceId: string | null, includeCollections = true): PaletteItem[] {
    if (!workspaceId) return [];
    const workspace = this.data.workspaces[workspaceId];
    if (!workspace) return [];
    const ids = new Set(workspace.looseItemIds);
    if (includeCollections) for (const collection of Object.values(this.data.collections)) if (collection.workspaceId === workspaceId) for (const id of collection.itemIds) ids.add(id);
    const addChildren = (id: string): void => { const item = this.data.items[id]; if (!item) return; for (const childId of item.childItemIds ?? []) { ids.add(childId); addChildren(childId); } };
    for (const id of [...ids]) addChildren(id);
    return [...ids].map((id) => this.data.items[id]).filter((item): item is PaletteItem => Boolean(item));
  }

  workspaceForItem(itemId: string): PaletteWorkspace | undefined {
    const contains = (workspace: PaletteWorkspace): boolean => {
      if (workspace.looseItemIds.includes(itemId)) return true;
      return this.itemsForWorkspace(workspace.id).some((item) => item.id === itemId);
    };
    const preferredId = this.data.items[itemId]?.origin.workspaceId;
    const preferred = preferredId ? this.data.workspaces[preferredId] : undefined;
    if (preferred && contains(preferred)) return preferred;
    return Object.values(this.data.workspaces).find(contains);
  }

  allItems(): PaletteItem[] { return Object.values(this.data.items); }

  miniStorageHas(itemId: string): boolean { return this.data.uiState.miniPalette.storageItemIds.includes(itemId); }

  addMiniStorageItems(itemIds: string[]): string[] {
    const linked = new Set(this.data.uiState.miniPalette.storageItemIds);
    const added: string[] = [];
    for (const id of itemIds) if (this.data.items[id] && !linked.has(id)) { linked.add(id); added.push(id); }
    this.data.uiState.miniPalette.storageItemIds = [...linked];
    this.changed();
    return added;
  }

  itemLinkedToWorkspace(item: PaletteItem, workspaceId: string): boolean {
    const workspace = this.data.workspaces[workspaceId];
    if (!workspace) return false;
    const locations = this.linkedCanvasNodes(item);
    return workspace.kind === "canvas" ? Boolean(workspace.ownerCanvasPath && locations.some((location) => location.canvasPath === workspace.ownerCanvasPath)) : locations.length > 0;
  }

  removeMiniStorageItems(itemIds: string[]): void {
    const removed = new Set(itemIds);
    this.data.uiState.miniPalette.storageItemIds = this.data.uiState.miniPalette.storageItemIds.filter((id) => !removed.has(id));
    this.data.uiState.miniPalette.storageSelectedItemIds = this.data.uiState.miniPalette.storageSelectedItemIds.filter((id) => !removed.has(id));
    if (this.data.uiState.selectedItemId && removed.has(this.data.uiState.selectedItemId)) this.data.uiState.selectedItemId = null;
    this.changed();
  }

  removePendingItems(itemIds: string[]): void {
    const pending = new Set(itemIds.filter((id) => this.data.pendingItemIds.includes(id)));
    if (pending.size === 0) return;
    this.data.pendingItemIds = this.data.pendingItemIds.filter((id) => !pending.has(id));
    const disposable = [...pending].filter((id) => !this.workspaceForItem(id) && !this.miniStorageHas(id));
    if (disposable.length > 0) this.removeItems(disposable);
    else this.changed();
  }

  completePendingCanvasPlacement(itemIds: string[]): void {
    const completed = new Set(itemIds.filter((id) => this.data.pendingItemIds.includes(id)));
    if (completed.size === 0) return;
    this.data.pendingItemIds = this.data.pendingItemIds.filter((id) => !completed.has(id));
    this.data.uiState.miniPalette.collectSelectedItemIds = this.data.uiState.miniPalette.collectSelectedItemIds.filter((id) => !completed.has(id));
    if (this.data.uiState.miniPalette.collectSelectionAnchorId && completed.has(this.data.uiState.miniPalette.collectSelectionAnchorId)) this.data.uiState.miniPalette.collectSelectionAnchorId = null;
    if (this.data.uiState.miniPalette.focusedItemId && completed.has(this.data.uiState.miniPalette.focusedItemId)) this.data.uiState.miniPalette.focusedItemId = null;
    this.changed();
  }

  private wouldCreateCycle(id: string, parentId: string | null): boolean {
    let cursor = parentId;
    while (cursor) {
      if (cursor === id) return true;
      cursor = this.data.collections[cursor]?.parentId ?? null;
    }
    return false;
  }

  removeItems(itemIds: string[]): void {
    const removed = new Set(itemIds);
    for (const id of itemIds) {
      const item = this.data.items[id];
      if (!item) continue;
      const destination = item.parentItemId ? this.data.items[item.parentItemId]?.childItemIds : undefined;
      const workspace = this.workspaceForItem(id);
      const collection = workspace ? Object.values(this.data.collections).find((entry) => entry.workspaceId === workspace.id && entry.itemIds.includes(id)) : undefined;
      const fallback = destination ?? collection?.itemIds ?? workspace?.looseItemIds;
      if (fallback) fallback.push(...(item.childItemIds ?? []).filter((childId) => !removed.has(childId) && !fallback.includes(childId)));
      for (const childId of item.childItemIds ?? []) if (!removed.has(childId) && this.data.items[childId]) this.data.items[childId].parentItemId = item.parentItemId ?? null;
    }
    for (const id of itemIds) delete this.data.items[id];
    this.data.pendingItemIds = this.data.pendingItemIds.filter((id) => !itemIds.includes(id));
    for (const workspace of Object.values(this.data.workspaces)) workspace.looseItemIds = workspace.looseItemIds.filter((id) => !itemIds.includes(id));
    for (const collection of Object.values(this.data.collections)) collection.itemIds = collection.itemIds.filter((id) => !itemIds.includes(id));
    for (const item of Object.values(this.data.items)) item.childItemIds = (item.childItemIds ?? []).filter((id) => !itemIds.includes(id));
    this.data.uiState.sideSelectedItemIds = this.data.uiState.sideSelectedItemIds.filter((id) => !itemIds.includes(id));
    for (const id of itemIds) { delete this.data.uiState.sideItemFaces[id]; delete this.data.uiState.miniItemFaces[id]; }
    this.data.uiState.miniPalette.collectSelectedItemIds = this.data.uiState.miniPalette.collectSelectedItemIds.filter((id) => !itemIds.includes(id));
    this.data.uiState.miniPalette.storageSelectedItemIds = this.data.uiState.miniPalette.storageSelectedItemIds.filter((id) => !itemIds.includes(id));
    this.data.uiState.miniPalette.storageItemIds = this.data.uiState.miniPalette.storageItemIds.filter((id) => !itemIds.includes(id));
    this.data.uiState.miniPalette.selectedItemIds = [];
    if (this.data.uiState.miniPalette.focusedItemId && itemIds.includes(this.data.uiState.miniPalette.focusedItemId)) this.data.uiState.miniPalette.focusedItemId = null;
    if (this.data.uiState.selectedItemId && itemIds.includes(this.data.uiState.selectedItemId)) this.data.uiState.selectedItemId = null;
    this.changed();
  }

  private itemContainers(workspaceId: string): string[][] {
    const workspace = this.data.workspaces[workspaceId];
    if (!workspace) return [];
    return [workspace.looseItemIds, ...Object.values(this.data.collections).filter((entry) => entry.workspaceId === workspaceId).map((entry) => entry.itemIds), ...this.itemsForWorkspace(workspaceId).map((item) => item.childItemIds ??= [])];
  }

  private detachWorkspaceLinks(itemId: string): void {
    for (const workspace of Object.values(this.data.workspaces)) workspace.looseItemIds = workspace.looseItemIds.filter((id) => id !== itemId);
    for (const collection of Object.values(this.data.collections)) collection.itemIds = collection.itemIds.filter((id) => id !== itemId);
    for (const item of Object.values(this.data.items)) if (item.id !== itemId) item.childItemIds = (item.childItemIds ?? []).filter((id) => id !== itemId);
  }

  /** Keeps the saved item content, but removes every Canvas-node relationship. */
  private detachCanvasLinks(item: PaletteItem): void {
    delete item.origin.canvasPath;
    delete item.origin.canvasNodeId;
    item.canvasPlacements = [];
  }

  private repairDuplicateCanvasItems(): boolean {
    const ownerByLocation = new Map<string, PaletteItem>();
    const replacements = new Map<string, string>();
    const ordered = Object.values(this.data.items).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    for (const item of ordered) {
      const owners = this.linkedCanvasNodes(item).map((location) => ownerByLocation.get(`${location.canvasPath}\n${location.nodeId}`)).filter((owner): owner is PaletteItem => Boolean(owner));
      const canonical = owners[0];
      if (!canonical) {
        for (const location of this.linkedCanvasNodes(item)) ownerByLocation.set(`${location.canvasPath}\n${location.nodeId}`, item);
        continue;
      }
      replacements.set(item.id, canonical.id);
      canonical.canvasPlacements = [...canonical.canvasPlacements, ...item.canvasPlacements].filter((placement, index, all) => all.findIndex((candidate) => candidate.canvasPath === placement.canvasPath && candidate.nodeIds.join("\n") === placement.nodeIds.join("\n")) === index);
      canonical.childItemIds = [...new Set([...(canonical.childItemIds ?? []), ...(item.childItemIds ?? [])])];
      if (item.modifiedAt > canonical.modifiedAt) {
        const createdAt = canonical.createdAt;
        Object.assign(canonical, item, { id: canonical.id, createdAt, origin: { ...item.origin, workspaceId: canonical.origin.workspaceId ?? item.origin.workspaceId }, canvasPlacements: canonical.canvasPlacements, childItemIds: canonical.childItemIds });
      }
      for (const location of this.linkedCanvasNodes(item)) ownerByLocation.set(`${location.canvasPath}\n${location.nodeId}`, canonical);
    }
    if (replacements.size === 0) return false;
    const replace = (ids: string[]): string[] => [...new Set(ids.map((id) => replacements.get(id) ?? id))];
    for (const workspace of Object.values(this.data.workspaces)) workspace.looseItemIds = replace(workspace.looseItemIds);
    for (const collection of Object.values(this.data.collections)) collection.itemIds = replace(collection.itemIds);
    for (const item of Object.values(this.data.items)) {
      item.childItemIds = replace(item.childItemIds ?? []);
      if (item.parentItemId) item.parentItemId = replacements.get(item.parentItemId) ?? item.parentItemId;
    }
    this.data.pendingItemIds = replace(this.data.pendingItemIds).filter((id) => !this.workspaceForItem(id));
    this.data.uiState.sideSelectedItemIds = replace(this.data.uiState.sideSelectedItemIds);
    this.data.uiState.miniPalette.collectSelectedItemIds = replace(this.data.uiState.miniPalette.collectSelectedItemIds);
    this.data.uiState.miniPalette.storageSelectedItemIds = replace(this.data.uiState.miniPalette.storageSelectedItemIds);
    this.data.uiState.miniPalette.storageItemIds = replace(this.data.uiState.miniPalette.storageItemIds);
    if (this.data.uiState.selectedItemId) this.data.uiState.selectedItemId = replacements.get(this.data.uiState.selectedItemId) ?? this.data.uiState.selectedItemId;
    if (this.data.uiState.miniPalette.focusedItemId) this.data.uiState.miniPalette.focusedItemId = replacements.get(this.data.uiState.miniPalette.focusedItemId) ?? this.data.uiState.miniPalette.focusedItemId;
    for (const duplicateId of replacements.keys()) delete this.data.items[duplicateId];
    return true;
  }

  private isItemDescendant(itemId: string, ancestorId: string): boolean {
    let cursor = this.data.items[itemId]?.parentItemId ?? null;
    while (cursor) { if (cursor === ancestorId) return true; cursor = this.data.items[cursor]?.parentItemId ?? null; }
    return false;
  }
}
