import type CanvasPalettePlugin from "../main";
import { DEFAULT_SIDE_LAYOUT, migrateData } from "./defaults";
import { createId } from "./ids";
import type { Collection, PaletteData, PaletteItem, PaletteMetadata, PaletteWorkspace } from "./types";

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

  updateItem(id: string, changes: Pick<PaletteItem, "displayTitle" | "tags" | "label" | "caption"> & Partial<Pick<PaletteItem, "content" | "labelColor">>): void {
    const item = this.data.items[id];
    if (!item) return;
    Object.assign(item, changes, { modifiedAt: Date.now() });
    this.applyItemMetadataToLinkedNodes(item);
    this.changed();
    void this.plugin.syncPaletteItemToCanvas(item);
  }

  getCanvasNodeMetadata(canvasPath: string, nodeId: string): PaletteMetadata | undefined {
    return this.data.canvasNodeMetadata[canvasPath]?.[nodeId];
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

  addLabelColorPreset(color: string): void {
    const normalized = color.trim().toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(normalized) || this.data.settings.labelColorPresets.includes(normalized)) return;
    this.data.settings.labelColorPresets.push(normalized);
    this.changed();
  }

  reorderItems(workspaceId: string, sourceId: string, targetId: string, collectionId: string | null = null): void {
    const workspace = this.data.workspaces[workspaceId];
    if (!workspace || sourceId === targetId) return;
    const target = collectionId ? this.data.collections[collectionId]?.itemIds : workspace.looseItemIds;
    if (!target) return;
    const sourceIndex = target.indexOf(sourceId); const targetIndex = target.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    target.splice(sourceIndex, 1); target.splice(targetIndex, 0, sourceId);
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
    if (item.type !== "group") {
      for (const placement of item.canvasPlacements) for (const nodeId of placement.nodeIds) locations.push({ canvasPath: placement.canvasPath, nodeId });
    }
    return locations.filter((location, index, all) => all.findIndex((candidate) => candidate.canvasPath === location.canvasPath && candidate.nodeId === location.nodeId) === index);
  }

  private itemHasLinkedNode(item: PaletteItem, canvasPath: string, nodeId: string): boolean {
    return this.linkedCanvasNodes(item).some((location) => location.canvasPath === canvasPath && location.nodeId === nodeId);
  }

  private applyItemMetadataToLinkedNodes(item: PaletteItem): void {
    const normalized = { tags: [...new Set(item.tags)], label: item.label, labelColor: item.label ? item.labelColor ?? "" : "", caption: item.caption };
    for (const location of this.linkedCanvasNodes(item)) this.setMetadataRecord(location.canvasPath, location.nodeId, normalized, item.modifiedAt);
  }

  private setMetadataRecord(canvasPath: string, nodeId: string, metadata: Pick<PaletteMetadata, "tags" | "label" | "labelColor" | "caption">, modifiedAt: number): void {
    const isEmpty = metadata.tags.length === 0 && !metadata.label && !metadata.caption;
    if (isEmpty) {
      const canvas = this.data.canvasNodeMetadata[canvasPath];
      if (!canvas) return;
      delete canvas[nodeId];
      if (Object.keys(canvas).length === 0) delete this.data.canvasNodeMetadata[canvasPath];
      return;
    }
    const canvas = this.data.canvasNodeMetadata[canvasPath] ??= {};
    canvas[nodeId] = { ...metadata, modifiedAt };
  }

  itemsForWorkspace(workspaceId: string | null, includeCollections = true): PaletteItem[] {
    if (!workspaceId) return [];
    const workspace = this.data.workspaces[workspaceId];
    if (!workspace) return [];
    const ids = new Set(workspace.looseItemIds);
    if (includeCollections) for (const collection of Object.values(this.data.collections)) if (collection.workspaceId === workspaceId) for (const id of collection.itemIds) ids.add(id);
    return [...ids].map((id) => this.data.items[id]).filter((item): item is PaletteItem => Boolean(item));
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
    this.data.uiState.miniPalette.selectedItemIds = this.data.uiState.miniPalette.selectedItemIds.filter((id) => !itemIds.includes(id));
    if (this.data.uiState.selectedItemId && itemIds.includes(this.data.uiState.selectedItemId)) this.data.uiState.selectedItemId = null;
    this.changed();
  }
}
