import { App, Modal, setIcon } from "obsidian";
import type { HighlightCanvasLayout, HighlightExportDestination } from "../core/highlight-export";

/** Centered destination cards used by a Canvas Card's Highlight export action. */
export class HighlightExportModal extends Modal {
  constructor(app: App, private readonly count: number, private readonly onChoose: (destination: HighlightExportDestination) => void) { super(app); }

  onOpen(): void {
    this.contentEl.addClass("canvas-palette", "cp-highlight-export-modal");
    this.contentEl.setAttr("aria-label", `하이라이트 ${this.count}개 내보내기`);
    this.contentEl.createEl("h2", { text: "하이라이트 내보내기" });
    this.contentEl.createEl("p", { cls: "cp-highlight-export-modal__hint", text: "내보낼 위치를 하나 선택하세요" });
    const choices: Array<{ destination: HighlightExportDestination; label: string; description: string; icon: string }> = [
      { destination: "canvas", label: "Canvas", description: "현재 Canvas에 배치", icon: "sticky-note" },
      { destination: "side", label: "Side Palette", description: "Workspace에 저장", icon: "panel-right" },
      { destination: "mini", label: "Mini Collect", description: "Mini에서 검토", icon: "panels-top-left" }
    ];
    const grid = this.contentEl.createDiv({ cls: "cp-highlight-export-modal__choices" });
    for (const choice of choices) {
      const button = grid.createEl("button", { cls: "cp-highlight-export-modal__choice", attr: { type: "button", "aria-label": `${choice.label}: ${choice.description}` } });
      const icon = button.createSpan({ cls: "cp-highlight-export-modal__icon" }); setIcon(icon, choice.icon);
      button.createSpan({ cls: "cp-highlight-export-modal__label", text: choice.label });
      button.createSpan({ cls: "cp-highlight-export-modal__description", text: choice.description });
      button.addEventListener("click", () => { this.close(); this.onChoose(choice.destination); });
    }
    window.setTimeout(() => (this.contentEl.querySelector("button") as HTMLButtonElement | null)?.focus(), 0);
  }

  onClose(): void { this.contentEl.empty(); }
}

/** The Canvas-only second step: flat cards or a title-rooted MindMap. */
export class HighlightCanvasLayoutModal extends Modal {
  constructor(app: App, private readonly onChoose: (layout: HighlightCanvasLayout) => void) { super(app); }

  onOpen(): void {
    this.contentEl.addClass("canvas-palette", "cp-highlight-export-modal");
    this.contentEl.createEl("h2", { text: "카드로 내보내기" });
    this.contentEl.createEl("p", { cls: "cp-highlight-export-modal__hint", text: "Canvas 배열 방식을 선택하세요" });
    const choices: Array<{ layout: HighlightCanvasLayout; label: string; icon: string }> = [
      { layout: "bundle", label: "연결 없는 묶음", icon: "layout-grid" },
      { layout: "mindmap", label: "MindMap 연결", icon: "git-branch" }
    ];
    for (const choice of choices) {
      const button = this.contentEl.createEl("button", { cls: "cp-highlight-export-modal__choice", attr: { type: "button" } });
      const icon = button.createSpan({ cls: "cp-highlight-export-modal__icon" }); setIcon(icon, choice.icon);
      button.createSpan({ text: choice.label });
      button.addEventListener("click", () => { this.close(); this.onChoose(choice.layout); });
    }
    window.setTimeout(() => (this.contentEl.querySelector("button") as HTMLButtonElement | null)?.focus(), 0);
  }

  onClose(): void { this.contentEl.empty(); }
}
