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

export interface ItemRenderOptions { selected: boolean; showSelectionMarker?: boolean; compact?: boolean; draggable?: boolean; onSelect: (event: MouseEvent | KeyboardEvent) => void; onOpen?: () => void; onLocate?: () => void; onContextMenu?: (event: MouseEvent) => void; }

export function renderItem(parent: HTMLElement, item: PaletteItem, options: ItemRenderOptions): HTMLElement {
  const card = parent.createDiv({ cls: `cp-item cp-item--${item.type}${options.selected ? " is-selected" : ""}${options.compact ? " is-compact" : ""}` });
  card.dataset.itemId = item.id;
  card.tabIndex = 0;
  if (options.selected && options.showSelectionMarker !== false) { const marker = card.createSpan({ cls: "cp-item__selection", attr: { "aria-label": "Selected" } }); setIcon(marker, "check"); }
  const header = card.createDiv({ cls: "cp-item__header" });
  const icon = header.createSpan({ cls: "cp-item__icon" });
  setIcon(icon, TYPE_ICON[item.type]);
  header.createSpan({ cls: "cp-item__title", text: item.displayTitle || "Untitled" });
  if (item.label) {
    const label = header.createSpan({ cls: "cp-label", text: item.label });
    if (item.labelColor) label.style.setProperty("--cp-label-color", item.labelColor);
  }
  const body = card.createDiv({ cls: "cp-item__body" });
  if (item.type === "image" && item.origin.filePath) body.createDiv({ cls: "cp-image-placeholder", text: item.origin.filePath });
  else if (item.type === "group") body.createDiv({ text: `${item.group?.nodes.length ?? 0} nodes · ${item.group?.edges.length ?? 0} edges` });
  else body.setText((item.content ?? item.origin.filePath ?? "No preview").slice(0, 240));
  const canvasPaths = [...new Set([item.origin.canvasPath, ...item.canvasPlacements.map((placement) => placement.canvasPath)].filter((path): path is string => Boolean(path)))];
  if (canvasPaths.length > 0) {
    const links = card.createDiv({ cls: "cp-item__canvas-links", attr: { title: canvasPaths.join("\n") } });
    const linkIcon = links.createSpan(); setIcon(linkIcon, "workflow");
    links.createSpan({ text: canvasPaths.map(canvasName).slice(0, 2).join(", ") + (canvasPaths.length > 2 ? ` +${canvasPaths.length - 2}` : "") });
    if (item.origin.canvasPath && item.origin.canvasNodeId && options.onLocate) {
      links.addClass("is-clickable");
      links.tabIndex = 0;
      links.setAttribute("role", "button");
      links.setAttribute("aria-label", "Locate original item on Canvas");
      const locate = (event: Event): void => { event.preventDefault(); event.stopPropagation(); options.onLocate?.(); };
      links.addEventListener("click", locate);
      links.addEventListener("dblclick", locate);
      links.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") locate(event); });
    }
  }
  const footer = card.createDiv({ cls: "cp-item__footer" });
  footer.createSpan({ text: item.tags.map((tag) => `#${tag}`).join(" ") });
  footer.createSpan({ text: new Date(item.modifiedAt).toLocaleDateString() });
  if (item.caption) card.createDiv({ cls: "cp-item__caption", text: item.caption });
  if (options.draggable) {
    card.draggable = true;
    card.addEventListener("dragstart", (event) => {
      if (event.dataTransfer) {
        event.dataTransfer.clearData();
        event.dataTransfer.setData("application/x-canvas-palette-item", item.id);
        event.dataTransfer.setData("application/x-canvas-palette-type", item.type);
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setDragImage(card, Math.max(0, Math.min(event.offsetX, card.clientWidth)), Math.max(0, Math.min(event.offsetY, card.clientHeight)));
      }
      card.addClass("is-dragging");
    }, true);
    card.addEventListener("dragend", () => card.removeClass("is-dragging"));
  }
  let clickTimer: number | null = null;
  card.addEventListener("click", (event) => {
    if (!options.onOpen) { options.onSelect(event); return; }
    if (clickTimer !== null) window.clearTimeout(clickTimer);
    clickTimer = window.setTimeout(() => { clickTimer = null; options.onSelect(event); }, 220);
  });
  card.addEventListener("dblclick", (event) => { if (clickTimer !== null) window.clearTimeout(clickTimer); clickTimer = null; event.preventDefault(); event.stopPropagation(); options.onOpen?.(); });
  card.addEventListener("contextmenu", (event) => options.onContextMenu?.(event));
  card.addEventListener("keydown", (event) => { if (event.key === "Enter") options.onOpen?.(); else if (event.key === " ") options.onSelect(event); });
  return card;
}

function canvasName(path: string): string { return path.split("/").pop()?.replace(/\.canvas$/i, "") ?? path; }

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
