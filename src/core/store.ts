import type CanvasPalettePlugin from "../main";
import { migrateData } from "./defaults";
import { createId } from "./ids";
import type { Collection, PaletteData, PaletteItem, PaletteWorkspace } from "./types";

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
    const workspace: PaletteWorkspace = { id, name, canvasPaths: [], isRepresentativeFor: [], rootCollectionIds: [], looseItemIds: [] };
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

  importPending(workspaceId: string, itemIds: string[]): void {
    const workspace = this.data.workspaces[workspaceId];
    if (!workspace) return;
    for (const id of itemIds) {
      const item = this.data.items[id];
      if (!item) continue;
      item.origin.workspaceId = workspaceId;
      if (!workspace.looseItemIds.includes(id)) workspace.looseItemIds.push(id);
    }
    this.data.pendingItemIds = this.data.pendingItemIds.filter((id) => !itemIds.includes(id));
    this.changed();
  }

  removeItems(itemIds: string[]): void {
    for (const id of itemIds) delete this.data.items[id];
    this.data.pendingItemIds = this.data.pendingItemIds.filter((id) => !itemIds.includes(id));
    for (const workspace of Object.values(this.data.workspaces)) workspace.looseItemIds = workspace.looseItemIds.filter((id) => !itemIds.includes(id));
    for (const collection of Object.values(this.data.collections)) collection.itemIds = collection.itemIds.filter((id) => !itemIds.includes(id));
    this.changed();
  }
}
