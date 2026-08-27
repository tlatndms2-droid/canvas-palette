import { App, Modal } from "obsidian";
import type { PaletteItem } from "../core/types";

export class LinkedSpacesModal extends Modal {
  constructor(app: App, private readonly items: PaletteItem[], private readonly activeQuery: string, private readonly hasToken: (token: string) => boolean, private readonly onFilter: (token: string | null) => void) { super(app); }

  onOpen(): void {
    this.contentEl.addClass("canvas-palette", "cp-linked-spaces-modal");
    const heading = this.contentEl.createDiv({ cls: "cp-linked-spaces__heading" });
    heading.createEl("h2", { text: "Linked spaces" });
    const clear = heading.createEl("button", { text: "Show all" });
    clear.disabled = !/\bspace:/i.test(this.activeQuery);
    clear.addEventListener("click", () => { this.onFilter(null); this.close(); });
    const counts = new Map<string, number>();
    for (const item of this.items) {
      const paths = new Set([item.origin.canvasPath, ...item.canvasPlacements.map((placement) => placement.canvasPath)].filter((path): path is string => Boolean(path)));
      for (const path of paths) counts.set(path, (counts.get(path) ?? 0) + 1);
    }
    const list = this.contentEl.createDiv({ cls: "cp-linked-spaces__list" });
    for (const [path, count] of [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
      const token = `space:"${path.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
      const row = list.createDiv({ cls: `cp-linked-space${this.hasToken(token) ? " is-active" : ""}` });
      const info = row.createDiv({ cls: "cp-linked-space__info" });
      info.createEl("strong", { text: path.split("/").pop()?.replace(/\.canvas$/i, "") ?? path });
      info.createSpan({ text: `${path} · ${count} item${count === 1 ? "" : "s"}` });
      const filter = row.createEl("button", { text: this.hasToken(token) ? "Clear" : "Filter" });
      filter.addEventListener("click", () => { this.onFilter(this.hasToken(token) ? null : token); this.close(); });
      const open = row.createEl("button", { text: "Open" });
      open.addEventListener("click", () => { void this.app.workspace.openLinkText(path, "", false); this.close(); });
    }
    if (counts.size === 0) list.createDiv({ cls: "cp-empty", text: "No linked Canvas spaces." });
  }

  onClose(): void { this.contentEl.empty(); }
}
