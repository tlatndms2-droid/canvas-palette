import { App, Modal, setIcon } from "obsidian";

export interface CanvasLinkLocation { canvasPath: string; nodeId: string; }

export class FindLinkModal extends Modal {
  constructor(app: App, private readonly itemTitle: string, private readonly locations: CanvasLinkLocation[], private readonly onChoose: (location: CanvasLinkLocation) => void) { super(app); }

  onOpen(): void {
    this.contentEl.addClass("canvas-palette", "cp-find-link-modal");
    this.contentEl.createEl("h2", { text: "Find link" });
    this.contentEl.createEl("p", { text: `Choose a linked Canvas location for ${this.itemTitle}.` });
    const list = this.contentEl.createDiv({ cls: "cp-find-link-list" });
    for (const location of this.locations) {
      const row = list.createEl("button", { cls: "cp-find-link-row", attr: { type: "button" } });
      const icon = row.createSpan({ cls: "cp-find-link-row__icon" }); setIcon(icon, "layout-dashboard");
      const info = row.createSpan({ cls: "cp-find-link-row__info" });
      info.createEl("strong", { text: canvasName(location.canvasPath) });
      info.createSpan({ text: `${location.canvasPath} · Node ${location.nodeId}` });
      row.addEventListener("click", () => { this.onChoose(location); this.close(); });
    }
  }

  onClose(): void { this.contentEl.empty(); }
}

function canvasName(path: string): string { return path.split("/").pop()?.replace(/\.canvas$/i, "") ?? path; }
