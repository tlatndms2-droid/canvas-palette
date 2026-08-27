import { App, Modal } from "obsidian";
import type { PaletteItem } from "../core/types";

export class LinkedSpacesModal extends Modal {
  constructor(app: App, private readonly items: PaletteItem[], private readonly activeQuery: string, private readonly hasToken: (token: string) => boolean, private readonly onFilter: (token: string | null) => void, private readonly onUnlink: (itemIds: string[], path: string) => void) { super(app); }

  onOpen(): void {
    this.contentEl.addClass("canvas-palette", "cp-linked-spaces-modal");
    const heading = this.contentEl.createDiv({ cls: "cp-linked-spaces__heading" });
    heading.createEl("h2", { text: "Linked spaces" });
    const clear = heading.createEl("button", { text: "Show all" });
    clear.disabled = !/\bspace:/i.test(this.activeQuery);
    clear.addEventListener("click", () => { this.onFilter(null); this.close(); });
    const linkedItems = new Map<string, Set<string>>();
    for (const item of this.items) {
      const paths = new Set([item.origin.canvasPath, ...item.canvasPlacements.map((placement) => placement.canvasPath)].filter((path): path is string => Boolean(path)));
      for (const path of paths) { const ids = linkedItems.get(path) ?? new Set<string>(); ids.add(item.id); linkedItems.set(path, ids); }
    }
    const list = this.contentEl.createDiv({ cls: "cp-linked-spaces__list" });
    for (const [path, itemIds] of [...linkedItems].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))) {
      const count = itemIds.size;
      const token = `space:"${path.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
      const row = list.createDiv({ cls: `cp-linked-space${this.hasToken(token) ? " is-active" : ""}` });
      const info = row.createDiv({ cls: "cp-linked-space__info" });
      info.createEl("strong", { text: path.split("/").pop()?.replace(/\.canvas$/i, "") ?? path });
      info.createSpan({ text: `${path} · ${count} item${count === 1 ? "" : "s"}` });
      const actions = row.createDiv({ cls: "cp-linked-space__actions" });
      const filter = actions.createEl("button", { text: this.hasToken(token) ? "Clear" : "Filter" });
      filter.addEventListener("click", () => { this.onFilter(this.hasToken(token) ? null : token); this.close(); });
      const open = actions.createEl("button", { text: "Open" });
      open.addEventListener("click", () => { void this.app.workspace.openLinkText(path, "", false); this.close(); });
      const unlink = actions.createEl("button", { text: "Unlink", cls: "mod-warning" });
      unlink.addEventListener("click", () => new ConfirmUnlinkModal(this.app, path, count, () => { this.onUnlink([...itemIds], path); this.close(); }).open());
    }
    if (linkedItems.size === 0) list.createDiv({ cls: "cp-empty", text: "No linked Canvas spaces." });
  }

  onClose(): void { this.contentEl.empty(); }
}

class ConfirmUnlinkModal extends Modal {
  constructor(app: App, private readonly path: string, private readonly count: number, private readonly onConfirm: () => void) { super(app); }
  onOpen(): void {
    this.contentEl.addClass("canvas-palette", "cp-confirm-modal");
    this.contentEl.createEl("h2", { text: "Unlink Canvas space?" });
    this.contentEl.createEl("p", { text: `${this.count} Palette item${this.count === 1 ? "" : "s"} will stop linking to ${this.path}. Canvas nodes, Vault files, and the Palette items will not be deleted.` });
    const actions = this.contentEl.createDiv({ cls: "cp-modal-actions" });
    actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    actions.createEl("button", { text: "Unlink", cls: "mod-warning" }).addEventListener("click", () => { this.onConfirm(); this.close(); });
  }
  onClose(): void { this.contentEl.empty(); }
}
