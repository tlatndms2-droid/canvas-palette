import { App, Component, MarkdownRenderer, TFile } from "obsidian";
import type { CanvasEdgeSnapshot, CanvasNodeSnapshot, CardFace, GroupSnapshot, PaletteItem } from "../core/types";
import { IMAGE_EXTENSIONS } from "../core/media";

export class PreviewService {
  private readonly groupObservers = new WeakMap<HTMLElement, ResizeObserver>();

  constructor(private readonly app: App, private readonly component: Component) {}

  async render(parent: HTMLElement, item: PaletteItem, compact = false, compactLimit = 360, face: CardFace = "front"): Promise<void> {
    this.groupObservers.get(parent)?.disconnect();
    this.groupObservers.delete(parent);
    parent.empty();
    parent.addClass("cp-preview-content", `cp-preview-content--${item.type}`);
    if (face === "back") {
      parent.addClass("cp-preview-content--back");
      await MarkdownRenderer.render(this.app, compact ? item.backContent.slice(0, compactLimit) : item.backContent, parent, item.origin.filePath ?? "", this.component);
      if (!item.backContent) parent.createDiv({ cls: "cp-empty cp-back-empty", text: "Write on the back…" });
      return;
    }
    if (item.type === "image" && (item.origin.filePath || item.sourceReferencePath)) {
      const file = this.app.vault.getAbstractFileByPath(item.origin.filePath ?? item.sourceReferencePath!);
      if (file instanceof TFile) parent.createEl("img", { attr: { src: this.app.vault.getResourcePath(file), alt: item.displayTitle, draggable: "false" } });
      else parent.createDiv({ cls: "cp-empty", text: "Original image is unavailable." });
      return;
    }
    if (item.type === "video" && (item.origin.filePath || item.sourceReferencePath)) {
      const file = this.app.vault.getAbstractFileByPath(item.origin.filePath ?? item.sourceReferencePath!);
      if (!(file instanceof TFile)) { parent.createDiv({ cls: "cp-empty", text: "Original video is unavailable." }); return; }
      const video = parent.createEl("video", { cls: compact ? "cp-video-thumbnail" : "cp-video-player", attr: { src: this.app.vault.getResourcePath(file), preload: "metadata", playsinline: "true", "aria-label": item.displayTitle } });
      video.muted = compact;
      video.controls = !compact;
      if (compact) {
        video.addEventListener("loadedmetadata", () => { if (Number.isFinite(video.duration) && video.duration > 0) video.currentTime = Math.min(.1, video.duration); }, { once: true });
        video.addEventListener("error", () => { video.replaceWith(parent.createDiv({ cls: "cp-video-unavailable", text: `${file.extension.toUpperCase()} · Video preview unavailable` })); }, { once: true });
        const badge = parent.createSpan({ cls: "cp-video-duration", text: "VIDEO" });
        video.addEventListener("loadedmetadata", () => { const seconds = Math.round(video.duration); if (Number.isFinite(seconds)) badge.setText(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`); }, { once: true });
      }
      return;
    }
    if (item.type === "group" && item.group) {
      await this.renderCanvasGroup(parent, item.group, item.origin.canvasPath ?? "", compact);
      return;
    }
    if (item.type === "link" && item.webLink) {
      const link = item.webLink;
      const wrap = parent.createDiv({ cls: "cp-link-preview" });
      if (link.thumbnailUrl) {
        const image = wrap.createEl("img", { cls: "cp-link-preview__image", attr: { src: link.thumbnailUrl, alt: "", draggable: "false" } });
        image.addEventListener("error", () => image.remove());
      }
      const text = wrap.createDiv({ cls: "cp-link-preview__text" });
      text.createEl("strong", { text: item.displayTitle });
      if (link.siteName) text.createSpan({ cls: "cp-link-preview__site", text: link.siteName });
      text.createSpan({ cls: "cp-link-preview__url", text: link.description || link.url });
      return;
    }
    const source = item.content ?? item.origin.filePath ?? item.sourceReferencePath ?? "No preview available.";
    if (item.type === "markdown" || item.type === "card") {
      await MarkdownRenderer.render(this.app, compact ? source.slice(0, compactLimit) : source, parent, item.origin.filePath ?? "", this.component);
      return;
    }
    parent.setText(compact ? source.slice(0, 180) : source);
  }

  renderYouTubePlayer(parent: HTMLElement, url: string): boolean {
    const videoId = this.youTubeVideoId(url);
    if (!videoId) return false;
    const frame = parent.createEl("iframe", { cls: "cp-youtube-player", attr: { src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`, title: "YouTube video player", allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share", allowfullscreen: "true", referrerpolicy: "strict-origin-when-cross-origin" } });
    frame.setAttribute("loading", "lazy");
    return true;
  }

  private youTubeVideoId(url: string): string | null {
    try {
      const parsed = new URL(url); const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
      const value = host === "youtu.be" ? parsed.pathname.slice(1) : host.endsWith("youtube.com") ? parsed.searchParams.get("v") ?? (/^\/(?:embed|shorts|live)\/([^/?#]+)/.exec(parsed.pathname)?.[1] ?? null) : null;
      return value && /^[A-Za-z0-9_-]{11}$/.test(value) ? value : null;
    } catch { return null; }
  }

  private async renderCanvasGroup(parent: HTMLElement, snapshot: GroupSnapshot, sourcePath: string, compact: boolean): Promise<void> {
    const width = Math.max(snapshot.bounds.width, 1);
    const height = Math.max(snapshot.bounds.height, 1);
    const viewport = parent.createDiv({ cls: `cp-canvas-snapshot${compact ? " is-compact" : " is-large"}` });
    viewport.style.setProperty("--cp-canvas-aspect", `${width} / ${height}`);
    const stage = viewport.createDiv({ cls: "cp-canvas-snapshot__stage" });
    const updateScale = (): void => {
      if (!viewport.isConnected) return;
      const scale = Math.min(stage.clientWidth / width, stage.clientHeight / height);
      viewport.style.setProperty("--cp-canvas-scale", String(Math.max(scale, .001)));
    };
    const observer = new ResizeObserver(updateScale);
    this.groupObservers.set(parent, observer);
    observer.observe(viewport);
    window.requestAnimationFrame(updateScale);

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
      } else if (node.type === "link") {
        content.setText(this.linkLabel(node.url));
      } else if (file instanceof TFile && file.extension.toLowerCase() === "md") {
        await MarkdownRenderer.render(this.app, await this.app.vault.cachedRead(file), content, file.path, this.component);
      } else content.setText(node.label ?? node.file?.split("/").pop() ?? "File");
    }
  }

  private linkLabel(url: string | undefined): string { try { return new URL(url ?? "").hostname || url || "Link"; } catch { return url || "Link"; } }

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
