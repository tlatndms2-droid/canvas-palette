import { setIcon } from "obsidian";
import type CanvasPalettePlugin from "../main";
import type { CanvasAdapter } from "./canvas-adapter";

/** A Canvas-local control for the single caption size shared by every Canvas. */
export class CanvasCaptionControl {
  private host: HTMLElement | null = null;
  private valueLabel: HTMLElement | null = null;
  private range: HTMLInputElement | null = null;
  private open = false;

  constructor(private readonly plugin: CanvasPalettePlugin, private readonly adapter: CanvasAdapter) {}

  mount(): void {
    const canvas = this.adapter.activeContainer();
    if (!canvas) { this.destroy(); return; }
    if (this.host?.parentElement === canvas) { this.refresh(); return; }
    this.destroy();
    this.host = canvas.createDiv({ cls: "canvas-palette cp-canvas-caption-control", attr: { "aria-label": "Canvas caption size" } });
    this.render();
  }

  refresh(): void {
    if (!this.host) return;
    const value = this.captionSize();
    if (this.valueLabel) this.valueLabel.setText(`${value}px`);
    if (this.range && document.activeElement !== this.range) this.range.value = String(value);
  }

  destroy(): void {
    this.host?.remove();
    this.host = null;
    this.valueLabel = null;
    this.range = null;
    this.open = false;
  }

  private render(): void {
    const host = this.host;
    if (!host) return;
    host.empty();
    const button = host.createEl("button", { cls: `cp-canvas-caption-control__button${this.open ? " is-active" : ""}`, attr: { type: "button", "aria-label": "Canvas caption size", title: "Canvas caption size", "aria-expanded": String(this.open) } });
    setIcon(button, "type");
    button.createSpan({ text: "캡션" });
    button.addEventListener("pointerdown", (event) => event.stopPropagation());
    button.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); this.open = !this.open; this.render(); });
    if (!this.open) return;

    const popover = host.createDiv({ cls: "cp-canvas-caption-control__popover", attr: { role: "dialog", "aria-label": "Canvas caption size" } });
    popover.createDiv({ cls: "cp-canvas-caption-control__title", text: "Canvas 캡션 크기" });
    const row = popover.createDiv({ cls: "cp-canvas-caption-control__range" });
    row.createSpan({ text: "8" });
    const range = row.createEl("input", { attr: { type: "range", min: "8", max: "32", step: "1", "aria-label": "Canvas caption size in pixels" } });
    range.value = String(this.captionSize());
    this.range = range;
    this.valueLabel = row.createSpan({ text: `${this.captionSize()}px` });
    range.addEventListener("input", () => {
      const value = Math.max(8, Math.min(32, Math.round(Number(range.value) || 11)));
      this.plugin.store.setCanvasCaptionFontSize(value);
      this.valueLabel?.setText(`${value}px`);
    });
    popover.createDiv({ cls: "cp-canvas-caption-control__help", text: "모든 Canvas Item 캡션에 적용됩니다. Side Palette 캡션 크기는 바뀌지 않습니다." });
  }

  private captionSize(): number {
    const value = this.plugin.store.data.settings.canvasCaptionFontSize;
    return Math.max(8, Math.min(32, Number.isFinite(value) ? Math.round(value) : 11));
  }
}
