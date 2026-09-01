import { App, Notice, TFile, normalizePath } from "obsidian";
import { createId } from "../core/ids";
import { findMarkdownNodeReplacement } from "../core/canvas-node-replacement";
import { SerialTaskQueue } from "../core/serial-task-queue";
import type { CanvasEdgeSnapshot, CanvasNodeSnapshot, PaletteItem, PaletteItemType, PaletteMetadata } from "../core/types";
import { restoreGroup, serializeGroup } from "./group-serializer";

interface CanvasDocument { nodes: CanvasNodeSnapshot[]; edges: CanvasEdgeSnapshot[]; [key: string]: unknown; }
interface CanvasRuntimeLike {
  getData?: () => unknown;
  setData?: (data: CanvasDocument) => void | Promise<void>;
  requestSave?: () => void;
  posFromEvt?: (event: MouseEvent) => { x: number; y: number };
  posFromClient?: (point: { x: number; y: number }) => { x: number; y: number };
  selection?: Set<CanvasRuntimeNodeLike>;
  selectedNodes?: unknown;
  nodes?: Map<string, CanvasRuntimeNodeLike>;
  selectOnly?: (node: CanvasRuntimeNodeLike) => void;
  zoomToSelection?: () => void;
}
export interface CanvasRuntimeNodeLike {
  id?: string;
  nodeEl?: HTMLElement;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  getData?: () => CanvasNodeSnapshot;
  moveTo?: (bounds: { x: number; y: number; width: number; height: number }) => void;
}
interface CanvasViewLike { getViewType?: () => string; file?: TFile; containerEl?: HTMLElement; canvas?: CanvasRuntimeLike; }
export interface CanvasContext { file: TFile; view: CanvasViewLike; runtime: CanvasRuntimeLike; }
export interface CanvasExportEntry { id: string; name: string; parentId: string | null; item?: PaletteItem; }

interface RestoredMaterial {
  nodes: CanvasNodeSnapshot[];
  edges: CanvasEdgeSnapshot[];
  anchorNodeId: string | null;
  placementNodeIds: string[];
  metadata: Array<{ nodeId: string; metadata: PaletteMetadata }>;
  warnings: string[];
}

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"]);

export class CanvasAdapter {
  private readonly restoreQueue = new SerialTaskQueue();
  private readonly previousNodesByCanvas = new Map<string, Map<string, CanvasNodeSnapshot>>();

  constructor(private readonly app: App, private readonly onRestored: (itemId: string, canvasPath: string, nodeIds: string[]) => void, private readonly getMetadata: (canvasPath: string, nodeId: string) => PaletteMetadata | undefined, private readonly restoreNodeMetadata: (canvasPath: string, records: Array<{ nodeId: string; metadata: PaletteMetadata }>) => void, private readonly linkedNodes: (item: PaletteItem, canvasPath: string) => string[] = () => [], private readonly confirmReplacement: () => Promise<boolean> = async () => true, private readonly onReplaced: (itemId: string, canvasPath: string, removedNodeIds: string[], newNodeIds: string[], existingNodeIds: Set<string>) => void = () => {}) {}

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

  openNodeIds(canvasPath: string): Set<string> {
    const ids = new Set<string>();
    for (const context of this.openContexts()) {
      if (context.file.path !== canvasPath || !(context.runtime.nodes instanceof Map)) continue;
      for (const nodeId of context.runtime.nodes.keys()) ids.add(nodeId);
    }
    return ids;
  }

  supportsFrontBack(node: CanvasRuntimeNodeLike): boolean {
    const data = node.getData?.();
    if (data?.type === "text") return true;
    return data?.type === "file" && Boolean(data.file);
  }

  beginBackDrag(node: CanvasRuntimeNodeLike, event: PointerEvent): boolean {
    if (event.button !== 0 || !event.isPrimary || !node.nodeEl) return false;
    const context = this.openContexts().find((candidate) => candidate.runtime.nodes?.get(node.id ?? "") === node);
    const posFromEvt = context?.runtime.posFromEvt;
    if (!context || !posFromEvt || !node.moveTo) return false;
    const runtime = context.runtime;
    const pointFromEvent = (pointerEvent: PointerEvent): { x: number; y: number } => posFromEvt.call(runtime, pointerEvent as unknown as MouseEvent);
    const selected = runtime.selection instanceof Set && runtime.selection.has(node)
      ? [...runtime.selection].filter((candidate) => candidate.moveTo)
      : [node];
    if (!(runtime.selection instanceof Set) || !runtime.selection.has(node)) runtime.selectOnly?.(node);
    const startPoint = pointFromEvent(event);
    const starts = selected.map((candidate) => ({
      node: candidate,
      x: candidate.x ?? candidate.getData?.().x ?? 0,
      y: candidate.y ?? candidate.getData?.().y ?? 0,
      width: candidate.width ?? candidate.getData?.().width ?? 0,
      height: candidate.height ?? candidate.getData?.().height ?? 0
    }));
    const win = node.nodeEl.ownerDocument.defaultView;
    if (!win) return false;
    let moved = false;
    const move = (moveEvent: PointerEvent): void => {
      if (moveEvent.pointerId !== event.pointerId) return;
      const point = pointFromEvent(moveEvent);
      const delta = { x: point.x - startPoint.x, y: point.y - startPoint.y };
      if (!moved && Math.hypot(delta.x, delta.y) < 3) return;
      moved = true;
      moveEvent.preventDefault();
      for (const start of starts) {
        start.node.nodeEl?.addClass("is-dragging");
        start.node.moveTo?.({ x: start.x + delta.x, y: start.y + delta.y, width: start.width, height: start.height });
      }
    };
    const finish = (finishEvent: PointerEvent): void => {
      if (finishEvent.pointerId !== event.pointerId) return;
      win.removeEventListener("pointermove", move, true);
      win.removeEventListener("pointerup", finish, true);
      win.removeEventListener("pointercancel", finish, true);
      for (const start of starts) start.node.nodeEl?.removeClass("is-dragging");
      if (moved) runtime.requestSave?.();
    };
    win.addEventListener("pointermove", move, true);
    win.addEventListener("pointerup", finish, true);
    win.addEventListener("pointercancel", finish, true);
    return true;
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

  async renameLinkedFileNodes(locations: Array<{ canvasPath: string; nodeId: string }>, filePath: string): Promise<void> {
    await this.mutateLinkedNodes(locations, (node) => {
      if (node.type !== "file" || node.file === filePath) return false;
      node.file = filePath;
      return true;
    });
  }

  async renameLinkedGroupNodes(locations: Array<{ canvasPath: string; nodeId: string }>, title: string): Promise<void> {
    await this.mutateLinkedNodes(locations, (node) => {
      if (node.type !== "group" || node.label === title) return false;
      node.label = title;
      return true;
    });
  }

  async convertLinkedCardsToMarkdown(locations: Array<{ canvasPath: string; nodeId: string }>, filePath: string): Promise<void> {
    await this.mutateLinkedNodes(locations, (node) => {
      if (node.type !== "text") return false;
      node.type = "file";
      node.file = filePath;
      delete node.text;
      return true;
    }, true);
  }

  private async mutateLinkedNodes(locations: Array<{ canvasPath: string; nodeId: string }>, mutate: (node: CanvasNodeSnapshot) => boolean, replaceOpenRuntimeNodes = false): Promise<void> {
    const byCanvas = new Map<string, Set<string>>();
    for (const location of locations) {
      const nodeIds = byCanvas.get(location.canvasPath) ?? new Set<string>();
      nodeIds.add(location.nodeId);
      byCanvas.set(location.canvasPath, nodeIds);
    }
    for (const [canvasPath, nodeIds] of byCanvas) {
      const open = this.openContexts().find((context) => context.file.path === canvasPath);
      if (open?.runtime.getData && open.runtime.setData) {
        const current = open.runtime.getData();
        if (!current || typeof current !== "object") continue;
        const document = this.parse(JSON.stringify(current));
        let changed = false;
        const changedNodeIds = new Set<string>();
        for (const node of document.nodes) {
          if (!nodeIds.has(node.id) || !mutate(node)) continue;
          changed = true;
          changedNodeIds.add(node.id);
        }
        if (!changed) continue;
        if (replaceOpenRuntimeNodes) {
          const withoutConvertedNodes: CanvasDocument = {
            ...document,
            nodes: document.nodes.filter((node) => !changedNodeIds.has(node.id)),
            edges: document.edges.filter((edge) => !changedNodeIds.has(edge.fromNode) && !changedNodeIds.has(edge.toNode))
          };
          await open.runtime.setData(withoutConvertedNodes);
        }
        await open.runtime.setData(document);
        open.runtime.requestSave?.();
        continue;
      }
      const file = this.app.vault.getAbstractFileByPath(canvasPath);
      if (!(file instanceof TFile)) continue;
      const document = await this.read(file);
      let changed = false;
      for (const node of document.nodes) if (nodeIds.has(node.id)) changed = mutate(node) || changed;
      if (changed) await this.app.vault.modify(file, JSON.stringify(document, null, 2));
    }
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
    const previousNodes = this.previousNodesByCanvas.get(file.path) ?? new Map<string, CanvasNodeSnapshot>();
    const currentNodes = new Map(document.nodes.map((node) => [node.id, node]));
    const existingNodeIds = new Set(currentNodes.keys());
    let changed = 0;
    for (const item of items) {
      const linkedNodeIds = [
        ...(item.origin.canvasPath === file.path && item.origin.canvasNodeId ? [item.origin.canvasNodeId] : []),
        ...item.canvasPlacements.filter((placement) => placement.canvasPath === file.path).flatMap((placement) => placement.nodeIds)
      ];
      if (linkedNodeIds.length === 0) continue;
      if (item.type === "card") {
        const replacement = findMarkdownNodeReplacement(previousNodes, currentNodes, linkedNodeIds);
        const removedLinkedNode = replacement?.removedNode;
        const replacementNode = replacement?.replacementNode;
        const convertedNode = document.nodes.find((candidate) => linkedNodeIds.includes(candidate.id) && candidate.type === "file" && candidate.file?.toLocaleLowerCase().endsWith(".md"))
          ?? replacementNode;
        if (convertedNode?.file) {
          if (removedLinkedNode && convertedNode.id !== removedLinkedNode.id) this.onReplaced(item.id, file.path, [removedLinkedNode.id], [convertedNode.id], existingNodeIds);
          const source = this.app.vault.getAbstractFileByPath(convertedNode.file);
          item.type = "markdown";
          item.origin.filePath = convertedNode.file;
          delete item.origin.textRange;
          if (source instanceof TFile) {
            item.displayTitle = source.basename;
            item.content = await this.app.vault.cachedRead(source);
          }
          item.modifiedAt = Date.now();
          changed++;
          continue;
        }
      }
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
        if (JSON.stringify(item.group) !== JSON.stringify(group)) {
          item.group = group;
          item.modifiedAt = Date.now();
          changed++;
        }
      }
    }
    this.previousNodesByCanvas.set(file.path, currentNodes);
    return { changedItems: changed, nodeIds: existingNodeIds };
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
    return this.restoreQueue.enqueue(context.file.path, () => this.restoreToRuntime(context, item, point));
  }

  async restoreItems(items: PaletteItem[], screenX: number, screenY: number): Promise<boolean> {
    const context = this.activeContext();
    if (!context || items.length === 0) { if (!context) new Notice("Open a Canvas before placing items."); return false; }
    const point = context.runtime.posFromClient?.({ x: screenX, y: screenY });
    if (!point) { new Notice("Unable to calculate the Canvas position."); return false; }
    const positions = this.batchRestorePositions(items, point);
    let restored = 0;
    for (let index = 0; index < items.length; index += 1) {
      if (await this.restoreQueue.enqueue(context.file.path, () => this.restoreToRuntime(context, items[index], positions[index], false))) restored += 1;
    }
    if (items.length > 1) new Notice(restored === items.length ? `${restored} items added to Canvas.` : `${restored} of ${items.length} items added to Canvas; ${items.length - restored} skipped.`);
    return restored > 0;
  }

  async restoreItemFromDrop(item: PaletteItem, event: DragEvent): Promise<boolean> {
    const context = this.contextForTarget(event.target);
    if (!context) return false;
    const point = context.runtime.posFromEvt?.(event);
    if (!point) { new Notice("Unable to calculate the Canvas drop position."); return false; }
    return this.restoreQueue.enqueue(context.file.path, () => this.restoreToRuntime(context, item, point));
  }

  async restoreItemsFromDrop(items: PaletteItem[], event: DragEvent): Promise<boolean> {
    const context = this.contextForTarget(event.target);
    if (!context || items.length === 0) return false;
    const point = context.runtime.posFromEvt?.(event);
    if (!point) { new Notice("Unable to calculate the Canvas drop position."); return false; }
    const positions = this.batchRestorePositions(items, point);
    let restored = 0;
    for (let index = 0; index < items.length; index++) {
      if (await this.restoreQueue.enqueue(context.file.path, () => this.restoreToRuntime(context, items[index], positions[index], false))) restored++;
    }
    if (items.length > 1) new Notice(restored === items.length ? `${restored} items added to Canvas.` : `${restored} of ${items.length} items added to Canvas; ${items.length - restored} skipped.`);
    return restored > 0;
  }

  private batchRestorePositions(items: PaletteItem[], point: { x: number; y: number }): Array<{ x: number; y: number }> {
    const sizeFor = (item: PaletteItem): { width: number; height: number } => item.type === "group"
      ? { width: Math.max(280, item.group?.bounds.width ?? 280), height: Math.max(180, item.group?.bounds.height ?? 180) }
      : item.type === "image" ? { width: 360, height: 240 } : { width: 280, height: 180 };
    const sizes = items.map(sizeFor);
    // Group snapshots can be much larger than ordinary cards, so a one-column batch guarantees their bounds never overlap.
    const columns = items.some((item) => item.type === "group") ? 1 : Math.max(1, Math.ceil(Math.sqrt(items.length)));
    const columnWidth = Math.max(...sizes.map((size) => size.width)) + 56;
    const rowHeight = Math.max(...sizes.map((size) => size.height)) + 56;
    return items.map((_item, index) => ({ x: point.x + (index % columns) * columnWidth, y: point.y + Math.floor(index / columns) * rowHeight }));
  }

  async exportCollection(name: string, entries: CanvasExportEntry[]): Promise<TFile | null> {
    if (entries.length === 0) { new Notice("The collection is empty."); return null; }
    const context = this.activeContext();
    const folder = context?.file.parent?.path ?? "";
    const path = await this.availablePath(normalizePath(`${folder}/${name || "Canvas Palette Export"}.canvas`));
    const positions = this.treeLayout(entries);
    const usedNodeIds = new Set<string>();
    const usedEdgeIds = new Set<string>();
    const canvasNodes: CanvasNodeSnapshot[] = [];
    const edges: CanvasEdgeSnapshot[] = [];
    const anchors = new Map<string, string>();
    const restoredByItem = new Map<string, string[]>();
    const metadata: Array<{ nodeId: string; metadata: PaletteMetadata }> = [];
    const warnings: string[] = [];
    for (const entry of entries) {
      const position = positions.get(entry.id) ?? { x: 0, y: 0 };
      if (!entry.item) {
        const node = this.headingNode(entry.name, entry.parentId === null, position.x, position.y, () => this.uniqueId("node", usedNodeIds));
        canvasNodes.push(node); anchors.set(entry.id, node.id); continue;
      }
      const material = this.materializeItem(entry.item, position.x, position.y, usedNodeIds, usedEdgeIds);
      if (!material) { warnings.push(`${entry.item.displayTitle}: stored Group data is unavailable.`); continue; }
      canvasNodes.push(...material.nodes); edges.push(...material.edges); metadata.push(...material.metadata); warnings.push(...material.warnings);
      if (material.anchorNodeId) anchors.set(entry.id, material.anchorNodeId);
      if (material.placementNodeIds.length > 0) restoredByItem.set(entry.item.id, material.placementNodeIds);
    }
    for (const entry of entries) {
      if (!entry.parentId) continue;
      const fromNode = anchors.get(entry.parentId); const toNode = anchors.get(entry.id);
      if (fromNode && toNode) edges.push({ id: this.uniqueId("edge", usedEdgeIds), fromNode, toNode, fromSide: "right", toSide: "left" });
    }
    const file = await this.app.vault.create(path, JSON.stringify({ nodes: canvasNodes, edges }, null, 2));
    for (const [itemId, nodeIds] of restoredByItem) this.onRestored(itemId, file.path, nodeIds);
    this.restoreNodeMetadata(file.path, metadata);
    new Notice(warnings.length > 0 ? `Collection exported to ${file.name}; ${warnings.length} item reference${warnings.length === 1 ? "" : "s"} need attention.` : `Collection exported to ${file.name}`);
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
    return { id: createId("card"), type: "card", displayTitle: (node.text ?? "Canvas card").split(/\r?\n/, 1)[0].slice(0, 80), ...common, facesEnabled: metadata?.facesEnabled ?? false, createdAt: now, origin: { canvasPath, canvasNodeId: node.id }, canvasPlacements: [], content: node.text ?? "" };
  }

  private groupItem(nodes: CanvasNodeSnapshot[], edges: CanvasEdgeSnapshot[], canvasPath: string, nodeId: string): PaletteItem | null {
    if (nodes.length === 0) return null;
    const now = Date.now();
    const metadata = this.getMetadata(canvasPath, nodeId);
    const snapshot = serializeGroup(nodes, edges);
    snapshot.nodeBacks = Object.fromEntries(nodes.map((node) => [node.id, this.getMetadata(canvasPath, node.id)?.backContent ?? ""]).filter(([, back]) => Boolean(back)));
    snapshot.nodeMetadata = Object.fromEntries(nodes.map((node) => [node.id, this.getMetadata(canvasPath, node.id)]).filter((entry): entry is [string, PaletteMetadata] => Boolean(entry[1])).map(([id, value]) => [id, { ...value, tags: [...value.tags] }]));
    const title = nodes.find((node) => node.type === "group")?.label ?? nodes.find((node) => node.text)?.text?.split(/\r?\n/, 1)[0] ?? "Canvas group";
    return { id: createId("group"), type: "group", displayTitle: title.slice(0, 80), tags: metadata?.tags ?? [], label: metadata?.label ?? "", labelColor: metadata?.labelColor ?? "", caption: metadata?.caption ?? "", backContent: "", facesEnabled: false, createdAt: now, modifiedAt: metadata?.modifiedAt ?? now, origin: { canvasPath, canvasNodeId: nodeId }, canvasPlacements: [], group: snapshot };
  }

  private materializeItem(item: PaletteItem, x: number, y: number, usedNodeIds: Set<string>, usedEdgeIds: Set<string>): RestoredMaterial | null {
    if (item.type === "group") {
      if (!item.group) return null;
      const snapshot = restoreGroup(item.group, x, y, () => this.uniqueId("node", usedNodeIds), () => this.uniqueId("edge", usedEdgeIds));
      const placementNodeIds = snapshot.nodes.filter((node) => node.type === "group").map((node) => node.id);
      const anchorNodeId = placementNodeIds[0] ?? snapshot.nodes[0]?.id ?? null;
      const metadata = [...snapshot.originalToRestored.entries()].flatMap(([originalId, restoredId]) => {
        const legacyBack = item.group?.nodeBacks?.[originalId];
        const source = item.group?.nodeMetadata?.[originalId] ?? (legacyBack ? { tags: [], label: "", labelColor: "", caption: "", backContent: legacyBack, currentFace: "front" as const, facesEnabled: true, modifiedAt: item.modifiedAt } : null);
        return source ? [{ nodeId: restoredId, metadata: { ...source, tags: [...source.tags] } }] : [];
      });
      return { nodes: snapshot.nodes, edges: snapshot.edges, anchorNodeId, placementNodeIds, metadata, warnings: snapshot.discardedReferences > 0 ? [`${item.displayTitle}: ${snapshot.discardedReferences} damaged Group reference${snapshot.discardedReferences === 1 ? " was" : "s were"} skipped.`] : [] };
    }
    const restored = this.restoreNodeForItem(item, x, y, () => this.uniqueId("node", usedNodeIds));
    if (!restored.node) return { nodes: [], edges: [], anchorNodeId: null, placementNodeIds: [], metadata: [], warnings: restored.warning ? [restored.warning] : [] };
    return { nodes: [restored.node], edges: [], anchorNodeId: restored.node.id, placementNodeIds: [restored.node.id], metadata: [], warnings: restored.warning ? [restored.warning] : [] };
  }

  private restoreNodeForItem(item: PaletteItem, x: number, y: number, nextId: () => string): { node: CanvasNodeSnapshot | null; warning?: string } {
    if (item.type === "markdown") {
      const file = !item.sourceDeletedAt && item.origin.filePath ? this.app.vault.getAbstractFileByPath(item.origin.filePath) : null;
      if (file instanceof TFile) return { node: { id: nextId(), type: "file", file: file.path, x, y, width: 280, height: 180 } };
      return { node: { id: nextId(), type: "text", text: item.content ?? item.displayTitle, x, y, width: 280, height: 180 }, warning: `${item.displayTitle}: Markdown source was unavailable, so stored content was exported as a Card.` };
    }
    if (item.type === "image") {
      const file = item.origin.filePath ? this.app.vault.getAbstractFileByPath(item.origin.filePath) : null;
      if (!(file instanceof TFile)) return { node: null, warning: `${item.displayTitle}: image source was unavailable and was skipped.` };
      return { node: { id: nextId(), type: "file", file: file.path, x, y, width: 360, height: 240 } };
    }
    return { node: { id: nextId(), type: "text", text: item.content ?? item.displayTitle, x, y, width: 280, height: 180 } };
  }

  private headingNode(name: string, root: boolean, x: number, y: number, nextId: () => string): CanvasNodeSnapshot {
    return { id: nextId(), type: "text", text: name, x, y, width: root ? 300 : 240, height: root ? 90 : 64 };
  }

  private treeLayout(entries: CanvasExportEntry[]): Map<string, { x: number; y: number }> {
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    const children = new Map<string, string[]>();
    const roots: string[] = [];
    for (const entry of entries) {
      if (!entry.parentId || !byId.has(entry.parentId)) roots.push(entry.id);
      else children.set(entry.parentId, [...(children.get(entry.parentId) ?? []), entry.id]);
    }
    const depths = new Map<string, number>();
    const depthOf = (id: string, visiting = new Set<string>()): number => {
      if (depths.has(id)) return depths.get(id)!;
      const entry = byId.get(id); if (!entry || !entry.parentId || !byId.has(entry.parentId) || visiting.has(id)) return 0;
      visiting.add(id); const depth = depthOf(entry.parentId, visiting) + 1; visiting.delete(id); depths.set(id, depth); return depth;
    };
    const size = (entry: CanvasExportEntry): { width: number; height: number } => entry.item?.type === "group"
      ? { width: Math.max(280, entry.item.group?.bounds.width ?? 280), height: Math.max(180, entry.item.group?.bounds.height ?? 180) }
      : entry.item?.type === "image" ? { width: 360, height: 240 }
      : entry.item ? { width: 280, height: 180 }
      : { width: entry.parentId === null ? 300 : 240, height: entry.parentId === null ? 90 : 64 };
    const maxWidth = new Map<number, number>();
    for (const entry of entries) { const depth = depthOf(entry.id); maxWidth.set(depth, Math.max(maxWidth.get(depth) ?? 0, size(entry).width)); }
    const xByDepth = new Map<number, number>();
    for (let depth = 1; depth <= Math.max(0, ...maxWidth.keys()); depth++) xByDepth.set(depth, (xByDepth.get(depth - 1) ?? 0) + (maxWidth.get(depth - 1) ?? 300) + 80);
    const layout = new Map<string, { x: number; y: number }>();
    let cursor = 0;
    const place = (id: string): { y: number; height: number } => {
      const entry = byId.get(id); if (!entry) return { y: cursor, height: 0 };
      const childIds = children.get(id) ?? []; const own = size(entry);
      const childBoxes = childIds.map(place);
      const y = childBoxes.length === 0 ? cursor : (childBoxes[0].y + childBoxes.at(-1)!.y + childBoxes.at(-1)!.height - own.height) / 2;
      if (childBoxes.length === 0) cursor += own.height + 56;
      layout.set(id, { x: xByDepth.get(depthOf(id)) ?? 0, y });
      return { y, height: own.height };
    };
    for (const id of roots) place(id);
    return layout;
  }

  private uniqueId(prefix: string, used: Set<string>): string {
    let id = createId(prefix);
    while (used.has(id)) id = createId(prefix);
    used.add(id);
    return id;
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

  private async restoreToRuntime(context: CanvasContext, item: PaletteItem, point: { x: number; y: number }, announce = true): Promise<boolean> {
    const current = context.runtime.getData?.();
    if (!current || typeof current !== "object" || !context.runtime.setData) { new Notice("This Canvas runtime cannot accept dropped items."); return false; }
    const document = this.parse(JSON.stringify(current));
    const linkedRootIds = this.linkedNodes(item, context.file.path).filter((nodeId) => document.nodes.some((node) => node.id === nodeId));
    if (linkedRootIds.length > 0 && !(await this.confirmReplacement())) return false;
    const material = this.materializeItem(item, point.x, point.y, new Set(document.nodes.map((node) => node.id)), new Set(document.edges.map((edge) => edge.id)));
    if (!material || material.nodes.length === 0 || material.placementNodeIds.length === 0) {
      if (announce) new Notice(material?.warnings[0] ?? `Stored group data for ${item.displayTitle} is unavailable.`);
      return false;
    }
    const removedNodes = linkedRootIds.length > 0 ? this.expandGroupNodes(document.nodes, linkedRootIds) : [];
    const removedNodeIds = new Set(removedNodes.map((node) => node.id));
    if (removedNodeIds.size > 0) {
      document.nodes = document.nodes.filter((node) => !removedNodeIds.has(node.id));
      document.edges = document.edges.filter((edge) => !removedNodeIds.has(edge.fromNode) && !removedNodeIds.has(edge.toNode));
    }
    document.nodes.push(...material.nodes);
    document.edges.push(...material.edges);
    try {
      await context.runtime.setData(document);
    } catch (error) {
      console.error("Canvas Palette failed to restore an item", error);
      if (announce) new Notice(`Unable to add ${item.displayTitle} to Canvas.`);
      return false;
    }
    if (linkedRootIds.length > 0) this.onReplaced(item.id, context.file.path, linkedRootIds, material.placementNodeIds, new Set(document.nodes.map((node) => node.id)));
    else this.onRestored(item.id, context.file.path, material.placementNodeIds);
    this.restoreNodeMetadata(context.file.path, material.metadata);
    context.runtime.requestSave?.();
    if (announce) new Notice(material.warnings.length > 0 ? `${linkedRootIds.length > 0 ? `${item.displayTitle} moved` : `${item.displayTitle} added`} with ${material.warnings.length} warning${material.warnings.length === 1 ? "" : "s"}.` : linkedRootIds.length > 0 ? `${item.displayTitle} moved to the new position` : `${item.displayTitle} added to Canvas`);
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
