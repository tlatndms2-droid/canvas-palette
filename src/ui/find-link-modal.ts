import { App, Modal, setIcon } from "obsidian";
import type { NumberedCanvasLink } from "../core/types";

export class FindLinkModal extends Modal {
  private selectedCanvasPath: string | null = null;

  constructor(app: App, private readonly itemTitle: string, private readonly locations: NumberedCanvasLink[], private readonly onChoose: (location: NumberedCanvasLink) => void) { super(app); }

  onOpen(): void {
    this.modalEl.addClass("cp-find-link-shell");
    this.contentEl.addClass("canvas-palette", "cp-find-link-modal");
    const canvases = this.groupedCanvases();
    this.selectedCanvasPath = canvases.length === 1 ? canvases[0].canvasPath : null;
    this.render();
  }

  onClose(): void { this.contentEl.empty(); }

  private groupedCanvases(): Array<{ canvasPath: string; links: NumberedCanvasLink[] }> {
    const grouped = new Map<string, NumberedCanvasLink[]>();
    for (const link of this.locations) grouped.set(link.canvasPath, [...(grouped.get(link.canvasPath) ?? []), link]);
    return [...grouped.entries()].map(([canvasPath, links]) => ({ canvasPath, links }));
  }

  private render(): void {
    this.contentEl.empty();
    const canvases = this.groupedCanvases();
    if (!this.selectedCanvasPath) { this.renderCanvasChoices(canvases); return; }
    const selected = canvases.find((entry) => entry.canvasPath === this.selectedCanvasPath);
    if (selected) this.renderNumberChoices(selected, canvases.length > 1);
  }

  private renderCanvasChoices(canvases: Array<{ canvasPath: string; links: NumberedCanvasLink[] }>): void {
    this.contentEl.createEl("h2", { text: "Canvas 선택" });
    this.contentEl.createEl("p", { cls: "cp-find-link-description", text: `${this.itemTitle}의 연결된 Canvas를 선택하세요.` });
    const list = this.contentEl.createDiv({ cls: "cp-find-link-list" });
    for (const canvas of canvases) {
      const row = list.createEl("button", { cls: "cp-find-link-row", attr: { type: "button", "aria-label": `${canvasName(canvas.canvasPath)} · 링크 ${canvas.links.length}개 선택`, title: canvas.canvasPath } });
      const icon = row.createSpan({ cls: "cp-find-link-row__icon" }); setIcon(icon, "layout-dashboard");
      const info = row.createSpan({ cls: "cp-find-link-row__info" });
      info.createEl("strong", { text: canvasName(canvas.canvasPath) });
      info.createSpan({ cls: "cp-find-link-row__path", text: canvas.canvasPath });
      info.createSpan({ cls: "cp-find-link-row__node", text: `링크 ${canvas.links.length}개` });
      const chevron = row.createSpan({ cls: "cp-find-link-row__chevron" }); setIcon(chevron, "chevron-right");
      row.addEventListener("click", () => { this.selectedCanvasPath = canvas.canvasPath; this.render(); });
    }
  }

  private renderNumberChoices(canvas: { canvasPath: string; links: NumberedCanvasLink[] }, canGoBack: boolean): void {
    const heading = this.contentEl.createDiv({ cls: "cp-find-link-heading" });
    if (canGoBack) {
      const back = heading.createEl("button", { cls: "clickable-icon", attr: { type: "button", "aria-label": "이전", title: "이전" } });
      setIcon(back, "arrow-left");
      back.addEventListener("click", () => { this.selectedCanvasPath = null; this.render(); });
    }
    heading.createEl("h2", { text: "링크 번호 선택" });
    this.contentEl.createEl("p", { cls: "cp-find-link-description", text: canvasName(canvas.canvasPath) });
    this.contentEl.createEl("p", { cls: "cp-find-link-path", text: canvas.canvasPath });
    const list = this.contentEl.createDiv({ cls: "cp-find-link-list cp-find-link-list--numbers" });
    for (const link of canvas.links) {
      const row = list.createEl("button", { cls: "cp-find-link-row cp-find-link-number-row", attr: { type: "button", "aria-label": `링크 ${link.number} 선택`, title: `링크 ${link.number}` } });
      const icon = row.createSpan({ cls: "cp-find-link-row__icon" }); setIcon(icon, "link-2");
      row.createEl("strong", { text: `링크 ${link.number}` });
      row.addEventListener("click", () => { this.onChoose(link); this.close(); });
    }
  }
}

function canvasName(path: string): string { return path.split("/").pop()?.replace(/\.canvas$/i, "") ?? path; }
