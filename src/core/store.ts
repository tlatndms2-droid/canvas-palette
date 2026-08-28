import type CanvasPalettePlugin from "../main";
import { DEFAULT_SIDE_LAYOUT, migrateData } from "./defaults";
import { createId } from "./ids";
import type { CardFace, Collection, PaletteData, PaletteItem, PaletteMetadata, PaletteWorkspace } from "./types";

type Listener = () => void;

export class PaletteStore {
  data: PaletteData = migrateData(null);
  private listeners = new Set<Listener>();
  private saveTimer: number | null = null;

  constructor(private readonly plugin: CanvasPalettePlugin) {}

  async load(): Promise<void> {
    this.data = migrateData(await this.plugin.loadData() as Partial<PaletteData> | null);
    if (Object.keys(this.data.workspaces).length === 0) this.createWorkspace("My Workspace");
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

  createWorkspace(name: string): PaletteWorkspace {
    const id = createId("workspace");
    const workspace: PaletteWorkspace = { id, name, canvasPaths: [], representativeCanvasPath: null, rootCollectionIds: [], looseItemIds: [], sideLayout: structuredClone(DEFAULT_SIDE_LAYOUT) };
    this.data.workspaces[id] = workspace;
    this.data.uiState.activeWorkspaceId ??= id;
    this.changed();
    return workspace;
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

  addPending(item: PaletteItem): void {
    this.data.items[item.id] = item;
    if (!this.data.pendingItemIds.includes(item.id)) this.data.pendingItemIds.push(item.id);
    this.changed();
  }

  addToWorkspace(workspaceId: string, item: PaletteItem): void {
    const workspace = this.data.workspaces[workspaceId];
    if (!workspace) return;
    item.origin.workspaceId = workspaceId;
    this.data.items[item.id] = item;
    if (!workspace.looseItemIds.includes(item.id)) workspace.looseItemIds.push(item.id);
    if (item.origin.canvasPath && !workspace.canvasPaths.includes(item.origin.canvasPath)) workspace.canvasPaths.push(item.origin.canvasPath);
    if (item.origin.canvasPath && !workspace.representativeCanvasPath) workspace.representativeCanvasPath = item.origin.canvasPath;
    this.changed();
  }

  importPending(workspaceId: string, itemIds: string[]): void {
    const workspace = this.data.workspaces[workspaceId];
    if (!workspace) return;
    for (const id of itemIds) {
      const item = this.data.items[id];
      if (!item) continue;
      item.origin.workspaceId = workspaceId;
      if (item.origin.canvasPath && !workspace.canvasPaths.includes(item.origin.canvasPath)) workspace.canvasPaths.push(item.origin.canvasPath);
      if (item.origin.canvasPath && !workspace.representativeCanvasPath) workspace.representativeCanvasPath = item.origin.canvasPath;
      if (!workspace.looseItemIds.includes(id)) workspace.looseItemIds.push(id);
    }
    this.data.pendingItemIds = this.data.pendingItemIds.filter((id) => !itemIds.includes(id));
    this.changed();
  }

  updateItem(id: string, changes: Pick<PaletteItem, "displayTitle" | "tags" | "label" | "caption"> & Partial<Pick<PaletteItem, "content" | "backContent" | "labelColor">>): void {
    const item = this.data.items[id];
    if (!item) return;
    Object.assign(item, changes, { modifiedAt: Date.now() });
    this.applyItemMetadataToLinkedNodes(item);
    this.changed();
    void this.plugin.syncPaletteItemToCanvas(item);
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
    this.setMetadataRecord(canvasPath, nodeId, { ...current, tags: [...item.tags], label: item.label, labelColor: item.labelColor ?? "", caption: item.caption, backContent: item.backContent, facesEnabled: item.facesEnabled }, item.modifiedAt);
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
    const containers = [workspace.looseItemIds, ...Object.values(this.data.collections).filter((collection) => collection.workspaceId === workspaceId).map((collection) => collection.itemIds)];
    const target = containers.find((ids) => ids.includes(targetId));
    if (!target || !containers.some((ids) => ids.includes(sourceId))) return;
    for (const ids of containers) { const index = ids.indexOf(sourceId); if (index >= 0) ids.splice(index, 1); }
    const targetIndex = target.indexOf(targetId);
    target.splice(targetIndex + (insertAfter ? 1 : 0), 0, sourceId);
    this.changed();
  }

  assignItemsToCollection(workspaceId: string, itemIds: string[], collectionId: string | null): void {
    const workspace = this.data.workspaces[workspaceId];
    if (!workspace) return;
    for (const collection of Object.values(this.data.collections)) {
      if (collection.workspaceId === workspaceId) collection.itemIds = collection.itemIds.filter((id) => !itemIds.includes(id));
    }
    workspace.looseItemIds = workspace.looseItemIds.filter((id) => !itemIds.includes(id));
    const target = collectionId ? this.data.collections[collectionId] : undefined;
    if (target) target.itemIds.push(...itemIds.filter((id) => !target.itemIds.includes(id)));
    else workspace.looseItemIds.push(...itemIds.filter((id) => !workspace.looseItemIds.includes(id)));
    this.changed();
  }

  renameCollection(id: string, name: string): void {
    const collection = this.data.collections[id];
    if (!collection || !name.trim()) return;
    collection.name = name.trim();
    this.changed();
  }

  moveCollection(id: string, parentId: string | null): void {
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
    if (parentId) this.data.collections[parentId]?.childCollectionIds.push(id);
    else workspace.rootCollectionIds.push(id);
    this.changed();
  }

  associateCanvas(workspaceId: string, canvasPath: string, representative = false): void {
    const workspace = this.data.workspaces[workspaceId];
    if (!workspace) return;
    if (!workspace.canvasPaths.includes(canvasPath)) workspace.canvasPaths.push(canvasPath);
    if (representative || !workspace.representativeCanvasPath) workspace.representativeCanvasPath = canvasPath;
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

  linkedCanvasNodes(item: PaletteItem): Array<{ canvasPath: string; nodeId: string }> {
    const locations: Array<{ canvasPath: string; nodeId: string }> = [];
    if (item.origin.canvasPath && item.origin.canvasNodeId) locations.push({ canvasPath: item.origin.canvasPath, nodeId: item.origin.canvasNodeId });
    for (const placement of item.canvasPlacements) for (const nodeId of placement.nodeIds) locations.push({ canvasPath: placement.canvasPath, nodeId });
    return locations.filter((location, index, all) => all.findIndex((candidate) => candidate.canvasPath === location.canvasPath && candidate.nodeId === location.nodeId) === index);
  }

  linkedCanvasLocations(item: PaletteItem): Array<{ canvasPath: string; nodeId: string }> {
    const locations = new Map<string, { canvasPath: string; nodeId: string }>();
    for (const location of this.linkedCanvasNodes(item)) if (!locations.has(location.canvasPath)) locations.set(location.canvasPath, location);
    return [...locations.values()];
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

  reconcileDeletedFile(path: string): void {
    let changed = path.toLocaleLowerCase().endsWith(".canvas") ? this.reconcileCanvasLinks(path, new Set()) : false;
    for (const item of this.allItems()) if (item.origin.filePath === path) { delete item.origin.filePath; changed = true; }
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
    const replacedOrigin = item.origin.canvasPath === canvasPath && Boolean(item.origin.canvasNodeId && removed.has(item.origin.canvasNodeId));
    if (replacedOrigin) {
      item.origin.canvasPath = canvasPath;
      item.origin.canvasNodeId = newNodeIds[0];
    }
    for (const placement of item.canvasPlacements) {
      if (placement.canvasPath === canvasPath) placement.nodeIds = placement.nodeIds.filter((nodeId) => !removed.has(nodeId));
    }
    item.canvasPlacements = item.canvasPlacements.filter((placement) => placement.nodeIds.length > 0);
    const placementIds = replacedOrigin ? newNodeIds.slice(1) : newNodeIds;
    if (placementIds.length > 0) {
      const placement = item.canvasPlacements.find((candidate) => candidate.canvasPath === canvasPath);
      if (placement) {
        placement.nodeIds = [...new Set([...placement.nodeIds, ...placementIds])];
        placement.placedAt = Date.now();
      } else item.canvasPlacements.push({ canvasPath, nodeIds: [...new Set(placementIds)], placedAt: Date.now() });
    }
    this.reconcileCanvasLinks(canvasPath, existingNodeIds);
    this.applyItemMetadataToLinkedNodes(item);
    const workspaceId = item.origin.workspaceId;
    if (workspaceId) this.associateCanvas(workspaceId, canvasPath);
    else this.changed();
  }

  private canvasNodeState(canvasPath: string, nodeId: string): PaletteMetadata {
    return this.data.canvasNodeMetadata[canvasPath]?.[nodeId] ?? { tags: [], label: "", labelColor: "", caption: "", backContent: "", currentFace: "front", facesEnabled: false, modifiedAt: Date.now() };
  }

  private setMetadataRecord(canvasPath: string, nodeId: string, metadata: Pick<PaletteMetadata, "tags" | "label" | "labelColor" | "caption"> & Partial<Pick<PaletteMetadata, "backContent" | "currentFace" | "facesEnabled">>, modifiedAt: number): void {
    const previous = this.data.canvasNodeMetadata[canvasPath]?.[nodeId];
    const record: PaletteMetadata = { tags: metadata.tags, label: metadata.label, labelColor: metadata.labelColor, caption: metadata.caption, backContent: metadata.backContent ?? previous?.backContent ?? "", currentFace: metadata.currentFace ?? previous?.currentFace ?? "front", facesEnabled: metadata.facesEnabled ?? previous?.facesEnabled ?? false, modifiedAt };
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

  itemsForWorkspace(workspaceId: string | null, includeCollections = true): PaletteItem[] {
    if (!workspaceId) return [];
    const workspace = this.data.workspaces[workspaceId];
    if (!workspace) return [];
    const ids = new Set(workspace.looseItemIds);
    if (includeCollections) for (const collection of Object.values(this.data.collections)) if (collection.workspaceId === workspaceId) for (const id of collection.itemIds) ids.add(id);
    return [...ids].map((id) => this.data.items[id]).filter((item): item is PaletteItem => Boolean(item));
  }

  workspaceForItem(itemId: string): PaletteWorkspace | undefined {
    const contains = (workspace: PaletteWorkspace): boolean => {
      if (workspace.looseItemIds.includes(itemId)) return true;
      return Object.values(this.data.collections).some((collection) => collection.workspaceId === workspace.id && collection.itemIds.includes(itemId));
    };
    const preferredId = this.data.items[itemId]?.origin.workspaceId;
    const preferred = preferredId ? this.data.workspaces[preferredId] : undefined;
    if (preferred && contains(preferred)) return preferred;
    return Object.values(this.data.workspaces).find(contains);
  }

  allItems(): PaletteItem[] { return Object.values(this.data.items); }

  private wouldCreateCycle(id: string, parentId: string | null): boolean {
    let cursor = parentId;
    while (cursor) {
      if (cursor === id) return true;
      cursor = this.data.collections[cursor]?.parentId ?? null;
    }
    return false;
  }

  removeItems(itemIds: string[]): void {
    for (const id of itemIds) delete this.data.items[id];
    this.data.pendingItemIds = this.data.pendingItemIds.filter((id) => !itemIds.includes(id));
    for (const workspace of Object.values(this.data.workspaces)) workspace.looseItemIds = workspace.looseItemIds.filter((id) => !itemIds.includes(id));
    for (const collection of Object.values(this.data.collections)) collection.itemIds = collection.itemIds.filter((id) => !itemIds.includes(id));
    this.data.uiState.sideSelectedItemIds = this.data.uiState.sideSelectedItemIds.filter((id) => !itemIds.includes(id));
    for (const id of itemIds) { delete this.data.uiState.sideItemFaces[id]; delete this.data.uiState.miniItemFaces[id]; }
    this.data.uiState.miniPalette.selectedItemIds = this.data.uiState.miniPalette.selectedItemIds.filter((id) => !itemIds.includes(id));
    if (this.data.uiState.selectedItemId && itemIds.includes(this.data.uiState.selectedItemId)) this.data.uiState.selectedItemId = null;
    this.changed();
  }
}
