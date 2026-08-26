import type CanvasPalettePlugin from "../main";
import type { PaletteMetadata } from "../core/types";
import type { CanvasAdapter, CanvasRuntimeNodeLike } from "./canvas-adapter";

export class CanvasMetadataController {
  private timer: number | null = null;

  constructor(private readonly plugin: CanvasPalettePlugin, private readonly adapter: CanvasAdapter) {}

  refreshSoon(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => { this.timer = null; this.refresh(); }, 60);
  }

  refresh(): void {
    for (const context of this.adapter.openContexts()) {
      const nodes = context.runtime.nodes;
      if (!(nodes instanceof Map)) continue;
      for (const [nodeId, node] of nodes) this.decorate(node, this.plugin.store.getCanvasNodeMetadata(context.file.path, nodeId));
    }
  }

  destroy(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    for (const context of this.adapter.openContexts()) {
      const nodes = context.runtime.nodes;
      if (!(nodes instanceof Map)) continue;
      for (const node of nodes.values()) this.remove(node);
    }
  }

  private decorate(node: CanvasRuntimeNodeLike, metadata: PaletteMetadata | undefined): void {
    const nodeEl = node.nodeEl;
    if (!(nodeEl instanceof HTMLElement)) return;
    this.remove(node);
    if (!metadata || (metadata.tags.length === 0 && !metadata.label && !metadata.caption)) return;
    nodeEl.addClass("cp-canvas-has-metadata");
    const layer = nodeEl.createDiv({ cls: "cp-canvas-metadata", attr: { "aria-label": "Canvas Palette metadata" } });
    if (metadata.label) layer.createDiv({ cls: "cp-canvas-metadata__label", text: metadata.label });
    if (metadata.tags.length > 0) layer.createDiv({ cls: "cp-canvas-metadata__tags", text: metadata.tags.map((tag) => `#${tag}`).join(" ") });
    layer.createDiv({ cls: "cp-canvas-metadata__date", text: new Date(metadata.modifiedAt).toLocaleDateString() });
    if (metadata.caption) layer.createDiv({ cls: "cp-canvas-metadata__caption", text: metadata.caption });
  }

  private remove(node: CanvasRuntimeNodeLike): void {
    const nodeEl = node.nodeEl;
    if (!(nodeEl instanceof HTMLElement)) return;
    nodeEl.removeClass("cp-canvas-has-metadata");
    nodeEl.querySelector(":scope > .cp-canvas-metadata")?.remove();
  }
}
