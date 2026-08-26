import { setIcon } from "obsidian";
import type CanvasPalettePlugin from "../main";
import type { PaletteItem, PaletteItemType } from "../core/types";
import type { PreviewService } from "../preview/preview-service";

export const TYPE_ICON: Record<PaletteItemType, string> = {
  card: "sticky-note",
  markdown: "file-text",
  image: "image",
  group: "boxes"
};

export function iconButton(parent: HTMLElement, icon: string, label: string, onClick: () => void): HTMLButtonElement {
  const button = parent.createEl("button", { cls: "clickable-icon cp-icon-button", attr: { "aria-label": label } });
  setIcon(button, icon);
  button.addEventListener("click", onClick);
  return button;
}

export interface ItemRenderOptions { selected: boolean; compact?: boolean; draggable?: boolean; onSelect: () => void; onContextMenu?: (event: MouseEvent) => void; }

export function renderItem(parent: HTMLElement, item: PaletteItem, options: ItemRenderOptions): HTMLElement {
  const card = parent.createDiv({ cls: `cp-item cp-item--${item.type}${options.selected ? " is-selected" : ""}${options.compact ? " is-compact" : ""}` });
  card.dataset.itemId = item.id;
  card.tabIndex = 0;
  const header = card.createDiv({ cls: "cp-item__header" });
  const icon = header.createSpan({ cls: "cp-item__icon" });
  setIcon(icon, TYPE_ICON[item.type]);
  header.createSpan({ cls: "cp-item__title", text: item.displayTitle || "Untitled" });
  if (item.label) header.createSpan({ cls: "cp-label", text: item.label });
  const body = card.createDiv({ cls: "cp-item__body" });
  if (item.type === "image" && item.origin.filePath) body.createDiv({ cls: "cp-image-placeholder", text: item.origin.filePath });
  else if (item.type === "group") body.createDiv({ text: `${item.group?.nodes.length ?? 0} nodes · ${item.group?.edges.length ?? 0} edges` });
  else body.setText((item.content ?? item.origin.filePath ?? "No preview").slice(0, 240));
  const footer = card.createDiv({ cls: "cp-item__footer" });
  footer.createSpan({ text: item.tags.map((tag) => `#${tag}`).join(" ") });
  footer.createSpan({ text: new Date(item.modifiedAt).toLocaleDateString() });
  if (item.caption) card.createDiv({ cls: "cp-item__caption", text: item.caption });
  if (options.draggable) {
    card.draggable = true;
    card.addEventListener("dragstart", (event) => {
      event.dataTransfer?.setData("application/x-canvas-palette-item", item.id);
      event.dataTransfer?.setData("text/plain", item.displayTitle);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
      card.addClass("is-dragging");
    });
    card.addEventListener("dragend", () => card.removeClass("is-dragging"));
  }
  card.addEventListener("click", options.onSelect);
  card.addEventListener("contextmenu", (event) => options.onContextMenu?.(event));
  card.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") options.onSelect(); });
  return card;
}

export function renderPreviewInCard(service: PreviewService, parent: HTMLElement, item: PaletteItem): void { void service.render(parent, item, true); }

export function workspaceSelect(plugin: CanvasPalettePlugin, parent: HTMLElement, value: string | null, onChange: (id: string) => void): HTMLSelectElement {
  const select = parent.createEl("select", { cls: "dropdown cp-workspace-select" });
  for (const workspace of Object.values(plugin.store.data.workspaces)) {
    const option = select.createEl("option", { text: workspace.name, value: workspace.id });
    option.selected = workspace.id === value;
  }
  select.addEventListener("change", () => onChange(select.value));
  return select;
}
