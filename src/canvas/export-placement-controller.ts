import { Notice } from "obsidian";
import type { BundleDuplicateMode, CanvasAdapter, CanvasContext, ExportBundle, PlacementCollisionPolicy } from "./canvas-adapter";

interface PlacementSession { context: CanvasContext; bundle: ExportBundle; mode: BundleDuplicateMode; collisionPolicy: PlacementCollisionPolicy; overlay: HTMLElement; lastClient: { x: number; y: number } | null; }

/** Keeps export data out of the Canvas until the user chooses a collision-free location. */
export class ExportPlacementController {
  private session: PlacementSession | null = null;
  private readonly onMove = (event: PointerEvent): void => this.update(event.clientX, event.clientY);
  private readonly onKey = (event: KeyboardEvent): void => { if (event.key === "Escape") { event.preventDefault(); this.cancel(); } };
  private readonly onDown = (event: PointerEvent): void => { if (event.button === 0) void this.place(event); };

  constructor(private readonly adapter: CanvasAdapter) {}

  start(context: CanvasContext, bundle: ExportBundle, mode: BundleDuplicateMode): void {
    this.cancel();
    const document = context.view.containerEl?.ownerDocument;
    if (!document || !context.view.containerEl) { new Notice("Unable to show the Canvas placement preview."); return; }
    const overlay = document.body.createDiv({ cls: "cp-export-placement" });
    overlay.setAttribute("aria-hidden", "true");
    const collisionPolicy: PlacementCollisionPolicy = bundle.placements.length > 1 ? "avoid-content-overlap" : "allow-overlap";
    this.session = { context, bundle, mode, collisionPolicy, overlay, lastClient: null };
    this.render(overlay, bundle);
    document.addEventListener("pointermove", this.onMove, true);
    document.addEventListener("pointerdown", this.onDown, true);
    document.addEventListener("keydown", this.onKey, true);
    new Notice(collisionPolicy === "avoid-content-overlap" ? "Move to a clear Canvas position and click to place. Press Escape to cancel." : "Move to a Canvas position and click to place. Press Escape to cancel.");
  }

  cancel(): void {
    const session = this.session;
    if (!session) return;
    const document = session.overlay.ownerDocument;
    document.removeEventListener("pointermove", this.onMove, true);
    document.removeEventListener("pointerdown", this.onDown, true);
    document.removeEventListener("keydown", this.onKey, true);
    session.overlay.remove(); this.session = null;
  }

  isFor(context: CanvasContext | null): boolean { return Boolean(this.session && context && this.session.context.file.path === context.file.path); }

  private update(clientX: number, clientY: number): void {
    const session = this.session;
    if (!session || !session.context.view.containerEl?.contains(session.overlay.ownerDocument.elementFromPoint(clientX, clientY) ?? null)) return;
    const point = session.context.runtime.posFromClient?.({ x: clientX, y: clientY });
    if (!point) return;
    const probe = session.context.runtime.posFromClient?.({ x: clientX + 20, y: clientY + 20 });
    const scaleX = probe && Math.abs(probe.x - point.x) > 0.001 ? 20 / Math.abs(probe.x - point.x) : 1;
    const scaleY = probe && Math.abs(probe.y - point.y) > 0.001 ? 20 / Math.abs(probe.y - point.y) : scaleX;
    session.lastClient = { x: clientX, y: clientY };
    session.overlay.style.left = `${clientX}px`; session.overlay.style.top = `${clientY}px`;
    session.overlay.style.transform = `scale(${scaleX}, ${scaleY})`;
    const collision = this.adapter.bundleCollides(session.context, session.bundle, point, this.ignoredNodeIds(session), session.collisionPolicy);
    session.overlay.toggleClass("is-collision", collision);
  }

  private async place(event: PointerEvent): Promise<void> {
    const session = this.session;
    if (!session || !session.context.view.containerEl?.contains(event.target as Node)) return;
    const point = session.context.runtime.posFromClient?.({ x: event.clientX, y: event.clientY });
    if (!point || this.adapter.bundleCollides(session.context, session.bundle, point, this.ignoredNodeIds(session), session.collisionPolicy)) { new Notice("That location overlaps an existing Canvas item."); return; }
    event.preventDefault(); event.stopPropagation();
    const committed = await this.adapter.commitBundle(session.context, session.bundle, point, session.mode, session.collisionPolicy);
    if (committed) this.cancel();
  }

  private ignoredNodeIds(session: PlacementSession): Set<string> {
    return session.mode === "replace" ? this.adapter.bundleDuplicateNodeIds(session.bundle, session.context) : new Set<string>();
  }

  private render(overlay: HTMLElement, bundle: ExportBundle): void {
    overlay.empty();
    overlay.style.width = `${bundle.bounds.width}px`; overlay.style.height = `${bundle.bounds.height}px`;
    overlay.createDiv({ cls: "cp-export-placement__bounds" });
    const byId = new Map(bundle.nodes.map((node) => [node.id, node]));
    const svg = overlay.createSvg("svg", { cls: "cp-export-placement__edges", attr: { viewBox: `0 0 ${bundle.bounds.width} ${bundle.bounds.height}`, width: String(bundle.bounds.width), height: String(bundle.bounds.height) } });
    for (const edge of bundle.edges) {
      const from = byId.get(edge.fromNode); const to = byId.get(edge.toNode); if (!from || !to) continue;
      svg.createSvg("line", { attr: { x1: String(from.x + from.width), y1: String(from.y + from.height / 2), x2: String(to.x), y2: String(to.y + to.height / 2) } });
    }
    for (const node of bundle.nodes) {
      const outline = overlay.createDiv({ cls: `cp-export-placement__node cp-export-placement__node--${node.type}` });
      outline.style.left = `${node.x}px`; outline.style.top = `${node.y}px`; outline.style.width = `${node.width}px`; outline.style.height = `${node.height}px`;
      outline.setText(node.type === "text" ? (node.text ?? "Card").slice(0, 60) : node.type === "group" ? (node.label ?? "Group") : node.file?.split("/").at(-1) ?? "File");
    }
  }
}
