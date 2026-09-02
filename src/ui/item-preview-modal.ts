import { App, Modal, TFile } from "obsidian";
import type CanvasPalettePlugin from "../main";
import type { PaletteItem } from "../core/types";

export class ItemPreviewModal extends Modal {
  private previewClosed = false;
  private imageResizeObserver?: ResizeObserver;

  constructor(app: App, private readonly plugin: CanvasPalettePlugin, private readonly itemId: string) { super(app); }

  onOpen(): void {
    const item = this.plugin.store.data.items[this.itemId];
    if (!item) { this.close(); return; }
    this.modalEl.addClass("canvas-palette", "cp-preview-modal", `cp-preview-modal--${item.type}`);
    this.contentEl.addClass("cp-large-preview");
    const header = this.contentEl.createDiv({ cls: "cp-large-preview__header" });
    header.createEl("h2", { text: item.displayTitle || "Untitled" });
    header.createSpan({ cls: "cp-chip", text: item.type.toUpperCase() });
    const body = this.contentEl.createDiv({ cls: "cp-large-preview__body" });
    if (item.type === "image") void this.renderZoomableImage(body, item, header);
    else if (item.type === "markdown") void this.renderCurrentMarkdown(body, item);
    else if (item.type === "link" && item.webLink && this.plugin.preview.renderYouTubePlayer(body, item.webLink.url)) {
      const actions = this.contentEl.createDiv({ cls: "cp-modal-actions cp-link-preview-actions" });
      actions.createEl("button", { text: "Open web link" }).addEventListener("click", () => this.plugin.openWebLink(item));
    }
    else void this.plugin.preview.render(body, item, false);
  }

  onClose(): void { this.previewClosed = true; this.imageResizeObserver?.disconnect(); this.contentEl.empty(); }

  private async renderZoomableImage(body: HTMLElement, item: PaletteItem, header: HTMLElement): Promise<void> {
    await this.plugin.preview.render(body, item, false);
    if (this.previewClosed) return;
    const image = body.querySelector("img");
    if (!(image instanceof HTMLImageElement)) return;
    const zoomLabel = header.createSpan({ cls: "cp-image-zoom", text: "100%" });
    const stage = document.createElement("div");
    stage.className = "cp-image-zoom-stage";
    image.replaceWith(stage);
    stage.appendChild(image);
    let zoom = 1;
    const update = (): void => {
      const naturalWidth = Math.max(image.naturalWidth, 1);
      const naturalHeight = Math.max(image.naturalHeight, 1);
      const availableWidth = Math.max(body.clientWidth - 36, 1);
      const availableHeight = Math.max(body.clientHeight - 36, 1);
      const fit = Math.min(availableWidth / naturalWidth, availableHeight / naturalHeight);
      const width = naturalWidth * fit * zoom;
      const height = naturalHeight * fit * zoom;
      image.style.width = `${width}px`;
      image.style.height = `${height}px`;
      stage.style.width = `${Math.max(availableWidth, width)}px`;
      stage.style.height = `${Math.max(availableHeight, height)}px`;
      zoomLabel.setText(`${Math.round(zoom * 100)}%`);
    };
    const ready = (): void => update();
    if (image.complete) ready(); else image.addEventListener("load", ready, { once: true });
    body.addEventListener("wheel", (event) => {
      event.preventDefault();
      zoom = Math.min(5, Math.max(0.2, zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12)));
      update();
    }, { passive: false });
    this.imageResizeObserver = new ResizeObserver(update);
    this.imageResizeObserver.observe(body);
  }

  private async renderCurrentMarkdown(body: HTMLElement, item: PaletteItem): Promise<void> {
    const file = item.origin.filePath ? this.app.vault.getAbstractFileByPath(item.origin.filePath) : null;
    if (!(file instanceof TFile) || file.extension.toLowerCase() !== "md") {
      body.createDiv({ cls: "cp-empty", text: "The original Markdown file is unavailable." });
      return;
    }
    const content = await this.app.vault.cachedRead(file);
    if (this.previewClosed) return;
    await this.plugin.preview.render(body, { ...item, content }, false);
  }
}
