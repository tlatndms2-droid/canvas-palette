import { App, Notice, TFile, normalizePath } from "obsidian";
import { createId } from "../core/ids";
import type { CanvasEdgeSnapshot, CanvasNodeSnapshot, PaletteItem, PaletteItemType } from "../core/types";
import { restoreGroup, serializeGroup } from "./group-serializer";

interface CanvasDocument { nodes: CanvasNodeSnapshot[]; edges: CanvasEdgeSnapshot[]; [key: string]: unknown; }
interface CanvasViewLike { getViewType?: () => string; file?: TFile; containerEl?: HTMLElement; canvas?: unknown; }
interface CanvasContext { file: TFile; view: CanvasViewLike; }

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"]);

export class CanvasAdapter {
  constructor(private readonly app: App, private readonly onRestored: (itemId: string, canvasPath: string, nodeIds: string[]) => void) {}

  activeContext(): CanvasContext | null {
    const leaf = this.app.workspace.activeLeaf;
    const view = leaf?.view as unknown as CanvasViewLike | undefined;
    if (!view || view.getViewType?.() !== "canvas" || !view.file) return null;
    return { file: view.file, view };
  }

  activeContainer(): HTMLElement | null { return this.activeContext()?.view.containerEl ?? null; }

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
    const collectAsGroup = selectedNodes.length > 1 || selectedNodes.some((node) => node.type === "group");
    if (collectAsGroup) {
      const nodes = this.expandGroupNodes(document.nodes, selectedIds);
      const item = this.groupItem(nodes, document.edges, canvasPath, selectedIds[0]);
      return item ? [item] : [];
    }
    const node = selectedNodes[0];
    return node ? [await this.itemFromNode(node, canvasPath)] : [];
  }

  async restoreItem(item: PaletteItem, screenX: number, screenY: number): Promise<boolean> {
    const context = this.activeContext();
    if (!context) { new Notice("Open a Canvas before dropping an item."); return false; }
    const point = this.screenToCanvas(context, screenX, screenY);
    let restoredNodeIds: string[] = [];
    await this.app.vault.process(context.file, (content) => {
      const document = this.parse(content);
      if (item.type === "group" && item.group) {
        const snapshot = restoreGroup(item.group, point.x, point.y, () => createId("node"));
        document.nodes.push(...snapshot.nodes);
        document.edges.push(...snapshot.edges);
        restoredNodeIds = snapshot.nodes.map((node) => node.id);
      } else {
        const node = this.nodeForItem(item, point.x, point.y);
        document.nodes.push(node);
        restoredNodeIds = [node.id];
      }
      return JSON.stringify(document, null, 2);
    });
    this.onRestored(item.id, context.file.path, restoredNodeIds);
    new Notice(`${item.displayTitle} added to Canvas`);
    return true;
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
    const rowByDepth = new Map<number, number>();
    for (const entry of nodes) {
      const row = rowByDepth.get(entry.depth) ?? 0;
      rowByDepth.set(entry.depth, row + 1);
      const position = { x: entry.depth * 330, y: row * 180 };
      if (entry.item?.type === "group" && entry.item.group) {
        const snapshot = restoreGroup(entry.item.group, position.x, position.y, () => createId("node"));
        canvasNodes.push(...snapshot.nodes);
        edges.push(...snapshot.edges);
        const ids = snapshot.nodes.map((node) => node.id);
        const anchor = snapshot.nodes.find((node) => node.type === "group")?.id ?? ids[0];
        if (anchor) anchors.set(entry.id, anchor);
        restoredByItem.set(entry.item.id, ids);
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
    new Notice(`Collection exported to ${file.name}`);
    return file;
  }

  private async itemFromNode(node: CanvasNodeSnapshot, canvasPath: string): Promise<PaletteItem> {
    const now = Date.now();
    if (node.type === "file" && node.file) {
      const file = this.app.vault.getAbstractFileByPath(node.file);
      const isImage = file instanceof TFile && IMAGE_EXTENSIONS.has(file.extension.toLowerCase());
      const type: PaletteItemType = isImage ? "image" : "markdown";
      return { id: createId(type), type, displayTitle: file instanceof TFile ? file.basename : node.file, tags: [], label: "", caption: "", createdAt: now, modifiedAt: now, origin: { canvasPath, canvasNodeId: node.id, filePath: node.file }, canvasPlacements: [], content: type === "markdown" && file instanceof TFile ? await this.app.vault.cachedRead(file) : undefined };
    }
    return { id: createId("card"), type: "card", displayTitle: (node.text ?? "Canvas card").split(/\r?\n/, 1)[0].slice(0, 80), tags: [], label: "", caption: "", createdAt: now, modifiedAt: now, origin: { canvasPath, canvasNodeId: node.id }, canvasPlacements: [], content: node.text ?? "" };
  }

  private groupItem(nodes: CanvasNodeSnapshot[], edges: CanvasEdgeSnapshot[], canvasPath: string, nodeId: string): PaletteItem | null {
    if (nodes.length === 0) return null;
    const now = Date.now();
    const snapshot = serializeGroup(nodes, edges);
    const title = nodes.find((node) => node.type === "group")?.label ?? nodes.find((node) => node.text)?.text?.split(/\r?\n/, 1)[0] ?? "Canvas group";
    return { id: createId("group"), type: "group", displayTitle: title.slice(0, 80), tags: [], label: "", caption: "", createdAt: now, modifiedAt: now, origin: { canvasPath, canvasNodeId: nodeId }, canvasPlacements: [], group: snapshot };
  }

  private nodeForItem(item: PaletteItem, x: number, y: number): CanvasNodeSnapshot {
    if ((item.type === "markdown" || item.type === "image") && item.origin.filePath) return { id: createId("node"), type: "file", file: item.origin.filePath, x, y, width: item.type === "image" ? 360 : 280, height: item.type === "image" ? 240 : 180 };
    return { id: createId("node"), type: "text", text: item.content ?? item.displayTitle, x, y, width: 280, height: 180 };
  }

  private async read(file: TFile): Promise<CanvasDocument> { return this.parse(await this.app.vault.cachedRead(file)); }
  private parse(raw: string): CanvasDocument {
    try {
      const parsed = JSON.parse(raw) as Partial<CanvasDocument>;
      return { ...parsed, nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [], edges: Array.isArray(parsed.edges) ? parsed.edges : [] };
    } catch { return { nodes: [], edges: [] }; }
  }

  private runtimeSelectionIds(view: CanvasViewLike): string[] {
    const canvas = view.canvas as Record<string, unknown> | undefined;
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

  private screenToCanvas(context: CanvasContext, screenX: number, screenY: number): { x: number; y: number } {
    const rect = context.view.containerEl?.getBoundingClientRect();
    const raw = context.view.canvas as Record<string, unknown> | undefined;
    const zoom = typeof raw?.zoom === "number" ? raw.zoom : 1;
    const tx = typeof raw?.tx === "number" ? raw.tx : 0;
    const ty = typeof raw?.ty === "number" ? raw.ty : 0;
    return { x: Math.round(((screenX - (rect?.left ?? 0)) - tx) / zoom), y: Math.round(((screenY - (rect?.top ?? 0)) - ty) / zoom) };
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
