import type CanvasPalettePlugin from "../main";
import type { PaletteMetadata } from "../core/types";
import type { CanvasAdapter, CanvasRuntimeNodeLike } from "./canvas-adapter";

export class CanvasMetadataController {
  private timer: number | null = null;
  private readonly nodesByElement = new WeakMap<Element, CanvasRuntimeNodeLike>();
  private readonly resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const node = this.nodesByElement.get(entry.target);
      if (node) this.updateScale(node);
    }
  });

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
    this.resizeObserver.disconnect();
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
    const data = node.getData?.();
    const type = data?.type ?? "unknown";
    nodeEl.addClass("cp-canvas-has-metadata", `cp-canvas-has-metadata--${type}`);
    const layer = nodeEl.createDiv({ cls: `cp-canvas-metadata cp-canvas-metadata--${type}`, attr: { "aria-label": "Canvas Palette metadata" } });
    if (metadata.label) {
      const header = layer.createDiv({ cls: "cp-canvas-metadata__header" });
      const label = header.createDiv({ cls: "cp-canvas-metadata__label", text: metadata.label });
      if (metadata.labelColor) label.style.setProperty("--cp-label-color", metadata.labelColor);
    }
    const footer = layer.createDiv({ cls: "cp-canvas-metadata__footer" });
    const tags = footer.createDiv({ cls: "cp-canvas-metadata__tags" });
    for (const tag of metadata.tags) tags.createSpan({ cls: "cp-canvas-metadata__tag", text: `#${tag}` });
    footer.createDiv({ cls: "cp-canvas-metadata__date", text: new Date(metadata.modifiedAt).toLocaleDateString() });
    if (metadata.caption) layer.createDiv({ cls: "cp-canvas-metadata__caption", text: metadata.caption });
    this.nodesByElement.set(nodeEl, node);
    this.resizeObserver.observe(nodeEl);
    this.updateScale(node);
  }

  private remove(node: CanvasRuntimeNodeLike): void {
    const nodeEl = node.nodeEl;
    if (!(nodeEl instanceof HTMLElement)) return;
    this.resizeObserver.unobserve(nodeEl);
    nodeEl.removeClass("cp-canvas-has-metadata", "cp-canvas-has-metadata--text", "cp-canvas-has-metadata--file", "cp-canvas-has-metadata--group", "cp-canvas-has-metadata--unknown");
    nodeEl.querySelector(":scope > .cp-canvas-metadata")?.remove();
    nodeEl.style.removeProperty("--cp-canvas-meta-scale");
  }

  private updateScale(node: CanvasRuntimeNodeLike): void {
    const nodeEl = node.nodeEl;
    const data = node.getData?.();
    if (!(nodeEl instanceof HTMLElement) || !data) return;
    const widthScale = Math.max(data.width, 1) / 400;
    const heightScale = Math.max(data.height, 1) / 300;
    const scale = Math.min(2.5, Math.max(0.75, Math.min(widthScale, heightScale)));
    nodeEl.style.setProperty("--cp-canvas-meta-scale", scale.toFixed(3));
  }

}
