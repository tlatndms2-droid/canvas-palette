import { MarkdownRenderer, setIcon } from "obsidian";
import type CanvasPalettePlugin from "../main";
import type { NumberedCanvasLink, PaletteMetadata } from "../core/types";
import { NativeMarkdownEditor } from "../editor/native-markdown-editor";
import type { CanvasAdapter, CanvasRuntimeNodeLike } from "./canvas-adapter";

export class CanvasMetadataController {
  private timer: number | null = null;
  private readonly signatures = new WeakMap<HTMLElement, string>();
  private readonly observedNodes = new Map<HTMLElement, CanvasRuntimeNodeLike>();
  private attachmentObserver: MutationObserver | null = null;
  private destroyed = false;
  private readonly nodesByElement = new WeakMap<Element, CanvasRuntimeNodeLike>();
  private readonly activeEditors = new WeakSet<HTMLElement>();
  private activeBackEditor: { nodeEl: HTMLElement; close: (save: boolean) => Promise<void> } | null = null;
  private readonly resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const node = this.nodesByElement.get(entry.target);
      if (node) this.updateScale(node);
    }
  });

  constructor(private readonly plugin: CanvasPalettePlugin, private readonly adapter: CanvasAdapter) {}

  refreshSoon(): void {
    if (this.destroyed) return;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => { this.timer = null; this.refresh(); }, 60);
  }

  refresh(): void {
    if (this.destroyed) return;
    if (!this.attachmentObserver) {
      this.attachmentObserver = new MutationObserver((records) => {
        if (records.some((record) => [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some((node) => node instanceof Element && (node.matches(".canvas-node") || node.querySelector(".canvas-node"))))) this.refreshSoon();
      });
      this.attachmentObserver.observe(this.plugin.app.workspace.containerEl, { childList: true, subtree: true });
    }
    const links = new Map<string, NumberedCanvasLink>();
    for (const item of this.plugin.store.allItems()) for (const link of this.plugin.store.numberedCanvasLinks(item)) {
      const key = JSON.stringify([link.canvasPath, link.nodeId]);
      if (!links.has(key)) links.set(key, link);
    }
    const live = new Set<HTMLElement>();
    for (const context of this.adapter.openContexts()) {
      const nodes = context.runtime.nodes;
      if (!(nodes instanceof Map)) continue;
      for (const [nodeId, node] of nodes) {
        if (!node.nodeEl?.isConnected) continue;
        live.add(node.nodeEl);
        this.decorate(node, context.file.path, nodeId, this.plugin.store.getCanvasNodeMetadata(context.file.path, nodeId), links.get(JSON.stringify([context.file.path, nodeId])));
      }
    }
    for (const element of this.observedNodes.keys()) if (!live.has(element)) { this.resizeObserver.unobserve(element); this.observedNodes.delete(element); this.signatures.delete(element); this.nodesByElement.delete(element); }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.resizeObserver.disconnect();
    this.attachmentObserver?.disconnect(); this.attachmentObserver = null;
    this.observedNodes.clear();
    void this.activeBackEditor?.close(true);
    for (const context of this.adapter.openContexts()) {
      const nodes = context.runtime.nodes;
      if (!(nodes instanceof Map)) continue;
      for (const node of nodes.values()) this.remove(node);
    }
  }

  private decorate(node: CanvasRuntimeNodeLike, canvasPath: string, nodeId: string, metadata: PaletteMetadata | undefined, numberedLink?: NumberedCanvasLink): void {
    const nodeEl = node.nodeEl;
    if (!(nodeEl instanceof HTMLElement)) return;
    if (this.activeBackEditor?.nodeEl === nodeEl) return;
    const activeEditor = nodeEl.querySelector<HTMLElement>(":scope > .cp-canvas-metadata .cp-canvas-metadata__editor");
    if (activeEditor && this.activeEditors.has(activeEditor)) return;
    const state = metadata ?? { tags: [], label: "", labelColor: "", caption: "", captionFontSize: 11, backContent: "", currentFace: "front" as const, facesEnabled: false, modifiedAt: 0 };
    const supportsFaces = this.adapter.supportsFrontBack(node);
    const linked = Boolean(numberedLink);
    const data = node.getData?.();
    const type = data?.type ?? "unknown";
    const signature = JSON.stringify([canvasPath, nodeId, state, supportsFaces, numberedLink, type, data?.width, data?.height, this.plugin.store.data.settings.canvasCaptionFontSize]);
    if (this.signatures.get(nodeEl) === signature && nodeEl.querySelector(":scope > .cp-canvas-metadata")) return;
    this.remove(node);
    this.signatures.set(nodeEl, signature);
    nodeEl.addClass("cp-canvas-has-metadata", `cp-canvas-has-metadata--${type}`);
    if (linked) nodeEl.addClass("cp-canvas-linked");
    const layer = nodeEl.createDiv({ cls: `cp-canvas-metadata cp-canvas-metadata--${type}`, attr: { "aria-label": "Canvas Palette metadata" } });
    if (linked) {
      const linkLabel = `링크 ${numberedLink?.number}/${numberedLink?.total} · Side Palette에서 보기`;
      const linkBadge = layer.createEl("button", { cls: "clickable-icon cp-canvas-link-badge", attr: { type: "button", "aria-label": linkLabel, title: linkLabel } });
      setIcon(linkBadge, "link-2");
      linkBadge.createSpan({ cls: "cp-canvas-link-badge__number", text: String(numberedLink?.number ?? "") });
      linkBadge.addEventListener("pointerdown", (event) => event.stopPropagation());
      linkBadge.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); void this.plugin.revealPaletteItemForCanvasNode(canvasPath, nodeId); });
      linkBadge.addEventListener("dblclick", (event) => { event.preventDefault(); event.stopPropagation(); });
    }
    if (supportsFaces && state.facesEnabled) {
      const flip = layer.createEl("button", { cls: "clickable-icon cp-canvas-face-toggle", attr: { type: "button", "aria-label": state.currentFace === "front" ? "Show back" : "Show front", title: state.currentFace === "front" ? "Show back" : "Show front" } });
      setIcon(flip, "refresh-cw");
      flip.addEventListener("pointerdown", (event) => event.stopPropagation());
      flip.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); this.plugin.store.setCanvasNodeFace(canvasPath, nodeId, state.currentFace === "front" ? "back" : "front"); });
    }
    if (supportsFaces && state.facesEnabled && state.currentFace === "back") {
      nodeEl.addClass("cp-canvas-showing-back");
      const back = layer.createDiv({ cls: "cp-canvas-back markdown-rendered", attr: { title: "Double-click to edit the back" } });
      void MarkdownRenderer.render(this.plugin.app, state.backContent, back, canvasPath, this.plugin).then(() => {
        if (!state.backContent && !back.hasClass("is-editing")) back.createDiv({ cls: "cp-empty", text: "Write on the back…" });
      });
      back.addEventListener("pointerdown", (event) => {
        if (back.hasClass("is-editing") || !this.adapter.beginBackDrag(node, event)) return;
        event.preventDefault();
        event.stopPropagation();
      });
      back.addEventListener("dblclick", (event) => { event.preventDefault(); event.stopPropagation(); void this.openInlineBackEditor(back, nodeEl, canvasPath, nodeId, state.backContent, data?.label ?? data?.text?.split(/\r?\n/, 1)[0] ?? "Canvas node"); });
    }
    if (state.label) {
      const header = layer.createDiv({ cls: "cp-canvas-metadata__header" });
      const label = header.createDiv({ cls: "cp-canvas-metadata__label", text: state.label });
      if (state.labelColor) label.style.setProperty("--cp-label-color", state.labelColor);
      this.makeInlineEditable(label, "Edit label", state.label, (value) => {
        this.saveMetadata(canvasPath, nodeId, { label: value });
      });
    }
    if (state.tags.length > 0 || state.label || state.caption) {
      const footer = layer.createDiv({ cls: "cp-canvas-metadata__footer" });
      const tags = footer.createDiv({ cls: "cp-canvas-metadata__tags" });
      for (const [index, tag] of state.tags.entries()) {
        const tagEl = tags.createSpan({ cls: "cp-canvas-metadata__tag", text: `#${tag}` });
        this.makeInlineEditable(tagEl, "Edit tag", tag, (value) => {
          const current = this.plugin.store.getCanvasNodeMetadata(canvasPath, nodeId);
          if (!current) return;
          const nextTags = [...current.tags];
          const normalized = value.trim().replace(/^#/, "");
          if (normalized) nextTags[index] = normalized;
          else nextTags.splice(index, 1);
          this.saveMetadata(canvasPath, nodeId, { tags: [...new Set(nextTags)] });
        });
      }
      footer.createDiv({ cls: "cp-canvas-metadata__date", text: new Date(state.modifiedAt).toLocaleDateString() });
    }
    if (state.caption) {
      const caption = layer.createDiv({ cls: "cp-canvas-metadata__caption", text: state.caption });
      caption.style.setProperty("--cp-caption-font-size", `${this.plugin.store.data.settings.canvasCaptionFontSize}px`);
      this.makeInlineEditable(caption, "Edit caption", state.caption, (value) => {
        this.saveMetadata(canvasPath, nodeId, { caption: value });
      });
    }
    this.nodesByElement.set(nodeEl, node);
    this.observedNodes.set(nodeEl, node);
    this.resizeObserver.observe(nodeEl);
    this.updateScale(node);
  }

  private async openInlineBackEditor(back: HTMLElement, nodeEl: HTMLElement, canvasPath: string, nodeId: string, initialText: string, title: string): Promise<void> {
    if (this.activeBackEditor?.nodeEl === nodeEl) return;
    await this.activeBackEditor?.close(true);
    back.empty();
    back.addClass("is-editing");
    const host = back.createDiv({ cls: "cp-canvas-back-editor cp-native-editor-host", attr: { "aria-label": `Edit ${title} back` } });
    const editor = new NativeMarkdownEditor(this.plugin.app, { itemId: `${canvasPath}:${nodeId}`, kind: "card", file: null, title: `${title} — Back`, initialText });
    let finishing = false;
    const doc = back.ownerDocument;
    const onOutsidePointer = (event: PointerEvent): void => {
      if (!back.contains(event.target as Node)) void close(true);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); void close(true); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); this.plugin.store.setCanvasNodeBack(canvasPath, nodeId, editor.getText()); }
    };
    const close = async (save: boolean): Promise<void> => {
      if (finishing) return;
      finishing = true;
      doc.removeEventListener("pointerdown", onOutsidePointer, true);
      host.removeEventListener("keydown", onKeyDown, true);
      const text = editor.getText();
      editor.detach();
      this.signatures.delete(nodeEl);
      if (this.activeBackEditor?.nodeEl === nodeEl) this.activeBackEditor = null;
      if (save) this.plugin.store.setCanvasNodeBack(canvasPath, nodeId, text);
      else this.refreshSoon();
    };
    this.activeBackEditor = { nodeEl, close };
    host.addEventListener("pointerdown", (event) => event.stopPropagation());
    host.addEventListener("dblclick", (event) => event.stopPropagation());
    host.addEventListener("keydown", onKeyDown, true);
    try {
      await editor.mount(host, false);
      window.requestAnimationFrame(() => editor.remeasure());
      window.setTimeout(() => doc.addEventListener("pointerdown", onOutsidePointer, true), 0);
    } catch (error) {
      await close(false);
      console.error("Canvas Palette could not mount the inline Back editor", error);
    }
  }

  private makeInlineEditable(element: HTMLElement, label: string, value: string, onCommit: (value: string) => void): void {
    element.setAttribute("title", `${label} (double-click)`);
    element.addEventListener("pointerdown", (event) => event.stopPropagation());
    element.addEventListener("click", (event) => event.stopPropagation());
    element.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (element.closest(".cp-canvas-metadata")?.querySelector(".cp-canvas-metadata__editor")) return;

      const editor = document.createElement("input");
      editor.type = "text";
      editor.className = `cp-canvas-metadata__editor ${element.className}`;
      this.activeEditors.add(editor);
      editor.value = value;
      editor.setAttribute("aria-label", label);
      editor.setAttribute("title", "Enter or focus out to save; Escape to cancel");
      if (element.style.getPropertyValue("--cp-label-color")) {
        editor.style.setProperty("--cp-label-color", element.style.getPropertyValue("--cp-label-color"));
      }
      element.replaceWith(editor);

      let finished = false;
      const finish = (save: boolean): void => {
        if (finished) return;
        finished = true;
        const nodeEl = editor.closest<HTMLElement>(".canvas-node"); if (nodeEl) this.signatures.delete(nodeEl);
        editor.classList.remove("cp-canvas-metadata__editor");
        editor.disabled = true;
        if (save) onCommit(editor.value.trim());
        else this.refreshSoon();
      };
      editor.addEventListener("pointerdown", (inputEvent) => inputEvent.stopPropagation());
      editor.addEventListener("click", (inputEvent) => inputEvent.stopPropagation());
      editor.addEventListener("dblclick", (inputEvent) => inputEvent.stopPropagation());
      editor.addEventListener("keydown", (inputEvent) => {
        inputEvent.stopPropagation();
        if (inputEvent.isComposing) return;
        if (inputEvent.key === "Enter") { inputEvent.preventDefault(); finish(true); editor.blur(); }
        else if (inputEvent.key === "Escape") { inputEvent.preventDefault(); finish(false); }
      });
      editor.addEventListener("blur", () => finish(true));
      window.requestAnimationFrame(() => { editor.focus(); editor.select(); });
    });
  }

  private saveMetadata(canvasPath: string, nodeId: string, changes: Partial<Pick<PaletteMetadata, "tags" | "label" | "caption">>): void {
    const current = this.plugin.store.getCanvasNodeMetadata(canvasPath, nodeId);
    if (!current) { this.refreshSoon(); return; }
    this.plugin.store.setCanvasNodeMetadata(canvasPath, nodeId, {
      tags: changes.tags ?? current.tags,
      label: changes.label ?? current.label,
      labelColor: (changes.label ?? current.label) ? current.labelColor : "",
      caption: changes.caption ?? current.caption
    });
  }

  private remove(node: CanvasRuntimeNodeLike): void {
    const nodeEl = node.nodeEl;
    if (!(nodeEl instanceof HTMLElement)) return;
    this.resizeObserver.unobserve(nodeEl);
    nodeEl.removeClass("cp-canvas-has-metadata", "cp-canvas-has-metadata--text", "cp-canvas-has-metadata--file", "cp-canvas-has-metadata--group", "cp-canvas-has-metadata--unknown");
    nodeEl.removeClass("cp-canvas-showing-back", "cp-canvas-linked");
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
