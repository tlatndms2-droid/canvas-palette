import { App, Component, MarkdownRenderer, TFile } from "obsidian";
import type { CanvasEdgeSnapshot, CanvasNodeSnapshot, CardFace, GroupSnapshot, PaletteItem } from "../core/types";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"]);

export class PreviewService {
  constructor(private readonly app: App, private readonly component: Component) {}

  async render(parent: HTMLElement, item: PaletteItem, compact = false, compactLimit = 360, face: CardFace = "front"): Promise<void> {
    parent.empty();
    parent.addClass("cp-preview-content", `cp-preview-content--${item.type}`);
    if (face === "back") {
      parent.addClass("cp-preview-content--back");
      await MarkdownRenderer.render(this.app, compact ? item.backContent.slice(0, compactLimit) : item.backContent, parent, item.origin.filePath ?? "", this.component);
      if (!item.backContent) parent.createDiv({ cls: "cp-empty cp-back-empty", text: "Write on the back…" });
      return;
    }
    if (item.type === "image" && item.origin.filePath) {
      const file = this.app.vault.getAbstractFileByPath(item.origin.filePath);
      if (file instanceof TFile) parent.createEl("img", { attr: { src: this.app.vault.getResourcePath(file), alt: item.displayTitle, draggable: "false" } });
      else parent.createDiv({ cls: "cp-empty", text: "Original image is unavailable." });
      return;
    }
    if (item.type === "group" && item.group) {
      await this.renderCanvasGroup(parent, item.group, item.origin.canvasPath ?? "", compact);
      return;
    }
    const source = item.content ?? item.origin.filePath ?? "No preview available.";
    if (item.type === "markdown" || item.type === "card") {
      await MarkdownRenderer.render(this.app, compact ? source.slice(0, compactLimit) : source, parent, item.origin.filePath ?? "", this.component);
      return;
    }
    parent.setText(compact ? source.slice(0, 180) : source);
  }

  private async renderCanvasGroup(parent: HTMLElement, snapshot: GroupSnapshot, sourcePath: string, compact: boolean): Promise<void> {
    const width = Math.max(snapshot.bounds.width, 1);
    const height = Math.max(snapshot.bounds.height, 1);
    const viewport = parent.createDiv({ cls: `cp-canvas-snapshot${compact ? " is-compact" : " is-large"}` });
    viewport.style.setProperty("--cp-canvas-aspect", `${width} / ${height}`);
    const stage = viewport.createDiv({ cls: "cp-canvas-snapshot__stage" });

    for (const node of snapshot.nodes.filter((candidate) => candidate.type === "group")) {
      const frame = stage.createDiv({ cls: "cp-canvas-snapshot__group" });
      this.positionSnapshotNode(frame, node, width, height);
      frame.style.setProperty("--cp-canvas-color", this.canvasColor(node.color));
      frame.createDiv({ cls: "cp-canvas-snapshot__group-label", text: node.label ?? "Group" });
    }

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("cp-canvas-snapshot__edges");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("preserveAspectRatio", "none");
    stage.appendChild(svg);
    for (const edge of snapshot.edges) this.renderCanvasEdge(svg, edge, snapshot.nodes, width, height);

    for (const node of snapshot.nodes.filter((candidate) => candidate.type !== "group")) {
      const card = stage.createDiv({ cls: `cp-canvas-snapshot__node cp-canvas-snapshot__node--${node.type}` });
      this.positionSnapshotNode(card, node, width, height);
      card.style.setProperty("--cp-canvas-color", this.canvasColor(node.color));
      const content = card.createDiv({ cls: "cp-canvas-snapshot__node-content markdown-rendered" });
      const file = node.file ? this.app.vault.getAbstractFileByPath(node.file) : null;
      if (file instanceof TFile && IMAGE_EXTENSIONS.has(file.extension.toLowerCase())) {
        card.addClass("cp-canvas-snapshot__node--image");
        content.createEl("img", { attr: { src: this.app.vault.getResourcePath(file), alt: file.basename, draggable: "false" } });
      } else if (node.type === "text") {
        await MarkdownRenderer.render(this.app, node.text ?? "", content, sourcePath, this.component);
      } else if (file instanceof TFile && file.extension.toLowerCase() === "md") {
        await MarkdownRenderer.render(this.app, await this.app.vault.cachedRead(file), content, file.path, this.component);
      } else content.setText(node.label ?? node.file?.split("/").pop() ?? "File");
    }
  }

  private positionSnapshotNode(element: HTMLElement, node: CanvasNodeSnapshot, width: number, height: number): void {
    element.style.left = `${node.x / width * 100}%`;
    element.style.top = `${node.y / height * 100}%`;
    element.style.width = `${node.width / width * 100}%`;
    element.style.height = `${node.height / height * 100}%`;
  }

  private renderCanvasEdge(svg: SVGSVGElement, edge: CanvasEdgeSnapshot, nodes: CanvasNodeSnapshot[], width: number, height: number): void {
    const from = nodes.find((node) => node.id === edge.fromNode);
    const to = nodes.find((node) => node.id === edge.toNode);
    if (!from || !to) return;
    const start = this.edgePoint(from, edge.fromSide ?? "right");
    const end = this.edgePoint(to, edge.toSide ?? "left");
    const horizontal = edge.fromSide === "left" || edge.fromSide === "right" || !edge.fromSide;
    const bend = horizontal ? Math.max(40, Math.abs(end.x - start.x) * .45) : Math.max(40, Math.abs(end.y - start.y) * .45);
    const c1 = horizontal ? { x: start.x + (edge.fromSide === "left" ? -bend : bend), y: start.y } : { x: start.x, y: start.y + (edge.fromSide === "top" ? -bend : bend) };
    const c2 = horizontal ? { x: end.x + (edge.toSide === "right" ? bend : -bend), y: end.y } : { x: end.x, y: end.y + (edge.toSide === "bottom" ? bend : -bend) };
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`);
    path.setAttribute("vector-effect", "non-scaling-stroke");
    path.style.setProperty("--cp-canvas-color", this.canvasColor(edge.color));
    svg.appendChild(path);
    const endpoint = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    endpoint.setAttribute("cx", String(end.x));
    endpoint.setAttribute("cy", String(end.y));
    endpoint.setAttribute("r", String(Math.max(width, height) / 180));
    endpoint.style.setProperty("--cp-canvas-color", this.canvasColor(edge.color));
    svg.appendChild(endpoint);
  }

  private edgePoint(node: CanvasNodeSnapshot, side: string): { x: number; y: number } {
    if (side === "left") return { x: node.x, y: node.y + node.height / 2 };
    if (side === "top") return { x: node.x + node.width / 2, y: node.y };
    if (side === "bottom") return { x: node.x + node.width / 2, y: node.y + node.height };
    return { x: node.x + node.width, y: node.y + node.height / 2 };
  }

  private canvasColor(color: string | undefined): string {
    return ({ "1": "#e93147", "2": "#ec7500", "3": "#e0ac00", "4": "#08b94e", "5": "#00a3c4", "6": "#7852ee" } as Record<string, string>)[color ?? ""] ?? color ?? "var(--interactive-accent)";
  }
}
