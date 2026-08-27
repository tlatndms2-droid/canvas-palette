import { App, Notice, TFile, normalizePath } from "obsidian";
import { createId } from "../core/ids";
import type { CanvasEdgeSnapshot, CanvasNodeSnapshot, PaletteItem, PaletteItemType, PaletteMetadata } from "../core/types";
import { restoreGroup, serializeGroup } from "./group-serializer";

interface CanvasDocument { nodes: CanvasNodeSnapshot[]; edges: CanvasEdgeSnapshot[]; [key: string]: unknown; }
interface CanvasRuntimeLike {
  getData?: () => unknown;
  setData?: (data: CanvasDocument) => void | Promise<void>;
  requestSave?: () => void;
  posFromEvt?: (event: MouseEvent) => { x: number; y: number };
  posFromClient?: (point: { x: number; y: number }) => { x: number; y: number };
  selection?: unknown;
  selectedNodes?: unknown;
  nodes?: Map<string, CanvasRuntimeNodeLike>;
  selectOnly?: (node: CanvasRuntimeNodeLike) => void;
  zoomToSelection?: () => void;
}
export interface CanvasRuntimeNodeLike { id?: string; nodeEl?: HTMLElement; getData?: () => CanvasNodeSnapshot; }
interface CanvasViewLike { getViewType?: () => string; file?: TFile; containerEl?: HTMLElement; canvas?: CanvasRuntimeLike; }
export interface CanvasContext { file: TFile; view: CanvasViewLike; runtime: CanvasRuntimeLike; }

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"]);

export class CanvasAdapter {
  constructor(private readonly app: App, private readonly onRestored: (itemId: string, canvasPath: string, nodeIds: string[]) => void, private readonly getMetadata: (canvasPath: string, nodeId: string) => PaletteMetadata | undefined, private readonly restoreNodeBack: (canvasPath: string, nodeId: string, backContent: string) => void) {}

  activeContext(): CanvasContext | null {
    const leaf = this.app.workspace.activeLeaf;
    const view = leaf?.view as unknown as CanvasViewLike | undefined;
    if (!view || view.getViewType?.() !== "canvas" || !view.file || !view.canvas) return null;
    return { file: view.file, view, runtime: view.canvas };
  }

  activeContainer(): HTMLElement | null { return this.activeContext()?.view.containerEl ?? null; }

  contextForTarget(target: EventTarget | null): CanvasContext | null {
    if (!(target instanceof Node)) return null;
    for (const leaf of this.app.workspace.getLeavesOfType("canvas")) {
      const view = leaf.view as unknown as CanvasViewLike;
      if (view.file && view.canvas && view.containerEl?.contains(target)) return { file: view.file, view, runtime: view.canvas };
    }
    return null;
  }

  openContexts(): CanvasContext[] {
    return this.app.workspace.getLeavesOfType("canvas").map((leaf) => {
      const view = leaf.view as unknown as CanvasViewLike;
      return view.file && view.canvas ? { file: view.file, view, runtime: view.canvas } : null;
    }).filter((value): value is CanvasContext => Boolean(value));
  }

  nodeContext(value: unknown): { canvasPath: string; nodeId: string } | null {
    const nodeId = this.runtimeNodeId(value);
    if (!nodeId) return null;
    const context = this.openContexts().find((candidate) => candidate.runtime.nodes?.get(nodeId) === value) ?? this.activeContext();
    return context ? { canvasPath: context.file.path, nodeId } : null;
  }

  async collectSelection(): Promise<PaletteItem[]> {
    const context = this.activeContext();
    if (!context) { new Notice("Open a Canvas before collecting Canvas items."); return []; }
    const document = await this.read(context.file);
    const selectedIds = this.runtimeSelectionIds(context.view);
    return this.collectIds(document, context.file.path, selectedIds);
  }

  async collectNode(node: unknown): Promise<PaletteItem[]> {
    const context = this.activeContext();
    if (!context) { new Notice("Open a Canvas before collecting Canvas items."); return []; }
    const document = await this.read(context.file);
    const id = this.runtimeNodeId(node);
    if (!id) { new Notice("Unable to identify the selected Canvas item."); return []; }
    return this.collectIds(document, context.file.path, [id]);
  }

  private async collectIds(document: CanvasDocument, canvasPath: string, selectedIds: string[]): Promise<PaletteItem[]> {
    if (selectedIds.length === 0) { new Notice("Select one or more Canvas items first."); return []; }
    const selectedNodes = document.nodes.filter((node) => selectedIds.includes(node.id));
    const selectedGroups = selectedNodes.filter((node) => node.type === "group");
    const groupNodes = new Map<string, CanvasNodeSnapshot[]>();
    for (const group of selectedGroups) groupNodes.set(group.id, this.expandGroupNodes(document.nodes, [group.id]));
    const rootGroups = selectedGroups.filter((group) => !selectedGroups.some((other) => other.id !== group.id && groupNodes.get(other.id)?.some((node) => node.id === group.id)));
    const capturedByGroup = new Set(rootGroups.flatMap((group) => groupNodes.get(group.id)?.map((node) => node.id) ?? []));
    const items: PaletteItem[] = [];
    for (const group of rootGroups) {
      const item = this.groupItem(groupNodes.get(group.id) ?? [group], document.edges, canvasPath, group.id);
      if (item) items.push(item);
    }
    for (const node of selectedNodes) {
      if (node.type === "group" || capturedByGroup.has(node.id)) continue;
      items.push(await this.itemFromNode(node, canvasPath));
    }
    return items;
  }

  async syncItemToCanvases(item: PaletteItem, locations: Array<{ canvasPath: string; nodeId: string }>): Promise<void> {
    if (item.type !== "card") return;
    const byCanvas = new Map<string, string[]>();
    for (const location of locations) byCanvas.set(location.canvasPath, [...(byCanvas.get(location.canvasPath) ?? []), location.nodeId]);
    for (const [canvasPath, nodeIds] of byCanvas) await this.syncCardToCanvas(item, canvasPath, nodeIds);
  }

  private async syncCardToCanvas(item: PaletteItem, canvasPath: string, nodeIds: string[]): Promise<void> {
    const open = this.openContexts().find((context) => context.file.path === canvasPath);
    if (open?.runtime.getData && open.runtime.setData) {
      const current = open.runtime.getData();
      if (!current || typeof current !== "object") return;
      const document = this.parse(JSON.stringify(current));
      const nodes = document.nodes.filter((candidate) => nodeIds.includes(candidate.id) && candidate.type === "text");
      const changed = nodes.some((node) => node.text !== (item.content ?? ""));
      if (!changed) return;
      for (const node of nodes) node.text = item.content ?? "";
      await open.runtime.setData(document);
      open.runtime.requestSave?.();
      return;
    }
    const file = this.app.vault.getAbstractFileByPath(canvasPath);
    if (!(file instanceof TFile)) return;
    const document = await this.read(file);
    const nodes = document.nodes.filter((candidate) => nodeIds.includes(candidate.id) && candidate.type === "text");
    const changed = nodes.some((node) => node.text !== (item.content ?? ""));
    if (!changed) return;
    for (const node of nodes) node.text = item.content ?? "";
    await this.app.vault.modify(file, JSON.stringify(document, null, 2));
  }

  async syncItemsFromCanvas(file: TFile, items: PaletteItem[]): Promise<{ changedItems: number; nodeIds: Set<string> }> {
    const document = await this.read(file);
    let changed = 0;
    for (const item of items) {
      const linkedNodeIds = [
        ...(item.origin.canvasPath === file.path && item.origin.canvasNodeId ? [item.origin.canvasNodeId] : []),
        ...item.canvasPlacements.filter((placement) => placement.canvasPath === file.path).flatMap((placement) => placement.nodeIds)
      ];
      if (linkedNodeIds.length === 0) continue;
      const linkedNodes = document.nodes.filter((candidate) => linkedNodeIds.includes(candidate.id) && candidate.type === (item.type === "card" ? "text" : "group"));
      const node = item.type === "card"
        ? linkedNodes.find((candidate) => (candidate.text ?? "") !== (item.content ?? "")) ?? linkedNodes[0]
        : linkedNodes[0];
      if (!node) continue;
      if (item.type === "card" && node.type === "text") {
        const content = node.text ?? "";
        const displayTitle = content.split(/\r?\n/, 1)[0].slice(0, 80) || "Canvas card";
        if (item.content !== content || item.displayTitle !== displayTitle) {
          item.content = content;
          item.displayTitle = displayTitle;
          item.modifiedAt = Date.now();
          changed++;
        }
      } else if (item.type === "group" && node.type === "group") {
        const nodes = this.expandGroupNodes(document.nodes, [node.id]);
        const group = serializeGroup(nodes, document.edges);
        const displayTitle = (node.label ?? nodes.find((candidate) => candidate.text)?.text?.split(/\r?\n/, 1)[0] ?? "Canvas group").slice(0, 80);
        if (JSON.stringify(item.group) !== JSON.stringify(group) || item.displayTitle !== displayTitle) {
          item.group = group;
          item.displayTitle = displayTitle;
          item.modifiedAt = Date.now();
          changed++;
        }
      }
    }
    return { changedItems: changed, nodeIds: new Set(document.nodes.map((node) => node.id)) };
  }

  async revealNode(canvasPath: string, nodeId: string): Promise<boolean> {
    const file = this.app.vault.getAbstractFileByPath(canvasPath);
    if (!(file instanceof TFile)) return false;
    let context = this.openContexts().find((candidate) => candidate.file.path === canvasPath);
    let leaf = context ? this.app.workspace.getLeavesOfType("canvas").find((candidate) => (candidate.view as unknown as CanvasViewLike).file?.path === canvasPath) : undefined;
    if (!context || !leaf) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.openFile(file);
      const view = leaf.view as unknown as CanvasViewLike;
      if (!view.canvas) return false;
      context = { file, view, runtime: view.canvas };
    }
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
    const node = context.runtime.nodes?.get(nodeId);
    if (!node || !context.runtime.selectOnly) return false;
    context.runtime.selectOnly(node);
    context.runtime.zoomToSelection?.();
    return true;
  }

  async restoreItem(item: PaletteItem, screenX: number, screenY: number): Promise<boolean> {
    const context = this.activeContext();
    if (!context) { new Notice("Open a Canvas before dropping an item."); return false; }
    const point = context.runtime.posFromClient?.({ x: screenX, y: screenY });
    if (!point) { new Notice("Unable to calculate the Canvas drop position."); return false; }
    return this.restoreToRuntime(context, item, point);
  }

  async restoreItemFromDrop(item: PaletteItem, event: DragEvent): Promise<boolean> {
    const context = this.contextForTarget(event.target);
    if (!context) return false;
    const point = context.runtime.posFromEvt?.(event);
    if (!point) { new Notice("Unable to calculate the Canvas drop position."); return false; }
    return this.restoreToRuntime(context, item, point);
  }

  async exportCollection(name: string, nodes: Array<{ id: string; name: string; depth: number; item?: PaletteItem }>): Promise<TFile | null> {
    if (nodes.length === 0) { new Notice("The collection is empty."); return null; }
    const context = this.activeContext();
    const folder = context?.file.parent?.path ?? "";
    const path = await this.availablePath(normalizePath(`${folder}/${name || "Canvas Palette Export"}.canvas`));
    const canvasNodes: CanvasNodeSnapshot[] = [];
    const edges: CanvasEdgeSnapshot[] = [];
    const anchors = new Map<string, string>();
    const restoredByItem = new Map<string, string[]>();
    const restoredBacks: Array<{ nodeId: string; backContent: string }> = [];
    const rowByDepth = new Map<number, number>();
    for (const entry of nodes) {
      const row = rowByDepth.get(entry.depth) ?? 0;
      rowByDepth.set(entry.depth, row + 1);
      const position = { x: entry.depth * 330, y: row * 180 };
      if (entry.item?.type === "group" && entry.item.group) {
        const snapshot = restoreGroup(entry.item.group, position.x, position.y, () => createId("node"), () => createId("node"));
        canvasNodes.push(...snapshot.nodes);
        edges.push(...snapshot.edges);
        const ids = snapshot.nodes.map((node) => node.id);
        const anchor = snapshot.nodes.find((node) => node.type === "group")?.id ?? ids[0];
        if (anchor) anchors.set(entry.id, anchor);
        restoredByItem.set(entry.item.id, snapshot.nodes.filter((node) => node.type === "group").map((node) => node.id));
        for (let index = 0; index < entry.item.group.nodes.length; index++) {
          const backContent = entry.item.group.nodeBacks?.[entry.item.group.nodes[index].id];
          const restored = snapshot.nodes[index];
          if (backContent && restored) restoredBacks.push({ nodeId: restored.id, backContent });
        }
      } else {
        const node = entry.item
          ? this.nodeForItem(entry.item, position.x, position.y)
          : { id: createId("node"), type: "text", text: entry.name, x: position.x, y: position.y, width: Math.max(180, 300 - entry.depth * 18), height: entry.depth === 0 ? 90 : 64 };
        canvasNodes.push(node);
        anchors.set(entry.id, node.id);
        if (entry.item) restoredByItem.set(entry.item.id, [node.id]);
      }
    }
    for (const entry of nodes) {
      const parent = entry.id.split("/").slice(0, -1).join("/");
      const fromNode = anchors.get(parent); const toNode = anchors.get(entry.id);
      if (fromNode && toNode) edges.push({ id: createId("edge"), fromNode, toNode, fromSide: "right", toSide: "left" });
    }
    const file = await this.app.vault.create(path, JSON.stringify({ nodes: canvasNodes, edges }, null, 2));
    for (const [itemId, nodeIds] of restoredByItem) this.onRestored(itemId, file.path, nodeIds);
    for (const state of restoredBacks) this.restoreNodeBack(file.path, state.nodeId, state.backContent);
    new Notice(`Collection exported to ${file.name}`);
    return file;
  }

  private async itemFromNode(node: CanvasNodeSnapshot, canvasPath: string): Promise<PaletteItem> {
    const now = Date.now();
    const metadata = this.getMetadata(canvasPath, node.id);
    const common = { tags: metadata?.tags ?? [], label: metadata?.label ?? "", labelColor: metadata?.labelColor ?? "", caption: metadata?.caption ?? "", backContent: metadata?.backContent ?? "", facesEnabled: metadata?.facesEnabled ?? false, modifiedAt: metadata?.modifiedAt ?? now };
    if (node.type === "file" && node.file) {
      const file = this.app.vault.getAbstractFileByPath(node.file);
      const isImage = file instanceof TFile && IMAGE_EXTENSIONS.has(file.extension.toLowerCase());
      const type: PaletteItemType = isImage ? "image" : "markdown";
      return { id: createId(type), type, displayTitle: file instanceof TFile ? file.basename : node.file, ...common, createdAt: now, origin: { canvasPath, canvasNodeId: node.id, filePath: node.file }, canvasPlacements: [], content: type === "markdown" && file instanceof TFile ? await this.app.vault.cachedRead(file) : undefined };
    }
    return { id: createId("card"), type: "card", displayTitle: (node.text ?? "Canvas card").split(/\r?\n/, 1)[0].slice(0, 80), ...common, createdAt: now, origin: { canvasPath, canvasNodeId: node.id }, canvasPlacements: [], content: node.text ?? "" };
  }

  private groupItem(nodes: CanvasNodeSnapshot[], edges: CanvasEdgeSnapshot[], canvasPath: string, nodeId: string): PaletteItem | null {
    if (nodes.length === 0) return null;
    const now = Date.now();
    const metadata = this.getMetadata(canvasPath, nodeId);
    const snapshot = serializeGroup(nodes, edges);
    snapshot.nodeBacks = Object.fromEntries(nodes.map((node) => [node.id, this.getMetadata(canvasPath, node.id)?.backContent ?? ""]).filter(([, back]) => Boolean(back)));
    const title = nodes.find((node) => node.type === "group")?.label ?? nodes.find((node) => node.text)?.text?.split(/\r?\n/, 1)[0] ?? "Canvas group";
    return { id: createId("group"), type: "group", displayTitle: title.slice(0, 80), tags: metadata?.tags ?? [], label: metadata?.label ?? "", labelColor: metadata?.labelColor ?? "", caption: metadata?.caption ?? "", backContent: metadata?.backContent ?? "", facesEnabled: metadata?.facesEnabled ?? false, createdAt: now, modifiedAt: metadata?.modifiedAt ?? now, origin: { canvasPath, canvasNodeId: nodeId }, canvasPlacements: [], group: snapshot };
  }

  private nodeForItem(item: PaletteItem, x: number, y: number): CanvasNodeSnapshot {
    if ((item.type === "markdown" || item.type === "image") && item.origin.filePath) return { id: createId("node"), type: "file", file: item.origin.filePath, x, y, width: item.type === "image" ? 360 : 280, height: item.type === "image" ? 240 : 180 };
    return { id: createId("node"), type: "text", text: item.content ?? item.displayTitle, x, y, width: 280, height: 180 };
  }

  private restoreNodeForItem(item: PaletteItem, x: number, y: number): CanvasNodeSnapshot | null {
    if (item.type === "markdown" || item.type === "image") {
      const file = item.origin.filePath ? this.app.vault.getAbstractFileByPath(item.origin.filePath) : null;
      if (!(file instanceof TFile)) { new Notice(`Original file for ${item.displayTitle} is unavailable.`); return null; }
      return { id: createId("node"), type: "file", file: file.path, x, y, width: item.type === "image" ? 360 : 280, height: item.type === "image" ? 240 : 180 };
    }
    if (item.type === "card") return { id: createId("node"), type: "text", text: item.content ?? "", x, y, width: 280, height: 180 };
    return null;
  }

  private async read(file: TFile): Promise<CanvasDocument> { return this.parse(await this.app.vault.cachedRead(file)); }
  private parse(raw: string): CanvasDocument {
    try {
      const parsed = JSON.parse(raw) as Partial<CanvasDocument>;
      return { ...parsed, nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [], edges: Array.isArray(parsed.edges) ? parsed.edges : [] };
    } catch { return { nodes: [], edges: [] }; }
  }

  private runtimeSelectionIds(view: CanvasViewLike): string[] {
    const canvas = view.canvas;
    const candidate = canvas?.selection ?? canvas?.selectedNodes;
    const values = candidate instanceof Set ? [...candidate] : Array.isArray(candidate) ? candidate : [];
    return values.map((value) => {
      const row = value as Record<string, unknown>;
      const data = row.data as Record<string, unknown> | undefined;
      const node = row.node as Record<string, unknown> | undefined;
      const nodeData = node?.data as Record<string, unknown> | undefined;
      return typeof row.id === "string" ? row.id : typeof data?.id === "string" ? data.id : typeof node?.id === "string" ? node.id : typeof nodeData?.id === "string" ? nodeData.id : "";
    }).filter(Boolean);
  }

  private runtimeNodeId(value: unknown): string | null {
    const row = value as Record<string, unknown> | null;
    if (!row) return null;
    const data = row.data as Record<string, unknown> | undefined;
    const node = row.node as Record<string, unknown> | undefined;
    const nodeData = node?.data as Record<string, unknown> | undefined;
    const id = typeof row.id === "string" ? row.id : typeof data?.id === "string" ? data.id : typeof node?.id === "string" ? node.id : typeof nodeData?.id === "string" ? nodeData.id : null;
    return id;
  }

  private expandGroupNodes(nodes: CanvasNodeSnapshot[], selectedIds: string[]): CanvasNodeSnapshot[] {
    const ids = new Set(selectedIds);
    let changed = true;
    while (changed) {
      changed = false;
      for (const node of nodes) {
        if (ids.has(node.id)) continue;
        if (node.parentId && ids.has(node.parentId)) { ids.add(node.id); changed = true; continue; }
        const enclosingGroup = nodes.find((group) => ids.has(group.id) && group.type === "group" && this.isInside(node, group));
        if (enclosingGroup) { ids.add(node.id); changed = true; }
      }
    }
    return nodes.filter((node) => ids.has(node.id));
  }

  private isInside(node: CanvasNodeSnapshot, group: CanvasNodeSnapshot): boolean {
    return node.x >= group.x && node.y >= group.y && node.x + node.width <= group.x + group.width && node.y + node.height <= group.y + group.height;
  }

  private async restoreToRuntime(context: CanvasContext, item: PaletteItem, point: { x: number; y: number }): Promise<boolean> {
    const current = context.runtime.getData?.();
    if (!current || typeof current !== "object" || !context.runtime.setData) { new Notice("This Canvas runtime cannot accept dropped items."); return false; }
    const document = this.parse(JSON.stringify(current));
    let restoredNodeIds: string[];
    if (item.type === "group") {
      if (!item.group) { new Notice(`Stored group data for ${item.displayTitle} is unavailable.`); return false; }
      const snapshot = restoreGroup(item.group, point.x, point.y, () => createId("node"), () => createId("edge"));
      document.nodes.push(...snapshot.nodes);
      document.edges.push(...snapshot.edges);
      restoredNodeIds = snapshot.nodes.filter((node) => node.type === "group").map((node) => node.id);
      for (let index = 0; index < item.group.nodes.length; index++) {
        const back = item.group.nodeBacks?.[item.group.nodes[index].id];
        const restored = snapshot.nodes[index];
        if (back && restored) this.restoreNodeBack(context.file.path, restored.id, back);
      }
    } else {
      const node = this.restoreNodeForItem(item, point.x, point.y);
      if (!node) return false;
      document.nodes.push(node);
      restoredNodeIds = [node.id];
    }
    try {
      await context.runtime.setData(document);
      context.runtime.requestSave?.();
    } catch (error) {
      console.error("Canvas Palette failed to restore an item", error);
      new Notice(`Unable to add ${item.displayTitle} to Canvas.`);
      return false;
    }
    this.onRestored(item.id, context.file.path, restoredNodeIds);
    new Notice(`${item.displayTitle} added to Canvas`);
    return true;
  }

  private async availablePath(path: string): Promise<string> {
    if (!this.app.vault.getAbstractFileByPath(path)) return path;
    const dot = path.lastIndexOf(".");
    const base = dot >= 0 ? path.slice(0, dot) : path;
    const extension = dot >= 0 ? path.slice(dot) : "";
    let index = 2;
    while (this.app.vault.getAbstractFileByPath(`${base} ${index}${extension}`)) index++;
    return `${base} ${index}${extension}`;
  }
}
