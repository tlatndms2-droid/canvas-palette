import { App, Component, MarkdownRenderer, TFile } from "obsidian";
import type { PaletteItem } from "../core/types";

export class PreviewService {
  constructor(private readonly app: App, private readonly component: Component) {}

  async render(parent: HTMLElement, item: PaletteItem, compact = false): Promise<void> {
    parent.empty();
    parent.addClass("cp-preview-content", `cp-preview-content--${item.type}`);
    if (item.type === "image" && item.origin.filePath) {
      const file = this.app.vault.getAbstractFileByPath(item.origin.filePath);
      if (file instanceof TFile) parent.createEl("img", { attr: { src: this.app.vault.getResourcePath(file), alt: item.displayTitle } });
      else parent.createDiv({ cls: "cp-empty", text: "Original image is unavailable." });
      return;
    }
    if (item.type === "group" && item.group) {
      const graph = parent.createDiv({ cls: "cp-subgraph" });
      const { width, height } = item.group.bounds;
      const scale = Math.min(1, 300 / Math.max(width, 1), 180 / Math.max(height, 1));
      graph.style.setProperty("--cp-graph-width", `${Math.max(220, width * scale + 28)}px`);
      graph.style.setProperty("--cp-graph-height", `${Math.max(140, height * scale + 28)}px`);
      for (const edge of item.group.edges) {
        const from = item.group.nodes.find((node) => node.id === edge.fromNode);
        const to = item.group.nodes.find((node) => node.id === edge.toNode);
        if (!from || !to) continue;
        const line = graph.createDiv({ cls: "cp-subgraph__edge" });
        const x1 = (from.x + from.width / 2) * scale + 14;
        const y1 = (from.y + from.height / 2) * scale + 14;
        const x2 = (to.x + to.width / 2) * scale + 14;
        const y2 = (to.y + to.height / 2) * scale + 14;
        const length = Math.hypot(x2 - x1, y2 - y1);
        line.style.width = `${length}px`;
        line.style.left = `${x1}px`;
        line.style.top = `${y1}px`;
        line.style.transform = `rotate(${Math.atan2(y2 - y1, x2 - x1)}rad)`;
      }
      for (const node of item.group.nodes) {
        const box = graph.createDiv({ cls: `cp-subgraph__node cp-subgraph__node--${node.type}` });
        box.style.left = `${node.x * scale + 14}px`; box.style.top = `${node.y * scale + 14}px`;
        box.style.width = `${Math.max(30, node.width * scale)}px`; box.style.height = `${Math.max(22, node.height * scale)}px`;
        box.setText(node.label ?? node.text?.slice(0, 18) ?? node.file?.split("/").pop() ?? "Group");
      }
      return;
    }
    const source = item.content ?? item.origin.filePath ?? "No preview available.";
    if (item.type === "markdown" && !compact) {
      await MarkdownRenderer.render(this.app, source, parent, item.origin.filePath ?? "", this.component);
      return;
    }
    parent.setText(compact ? source.slice(0, 180) : source);
  }
}
