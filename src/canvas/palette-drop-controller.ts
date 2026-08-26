import type { PaletteStore } from "../core/store";
import type { CanvasAdapter } from "./canvas-adapter";

const ITEM_MIME = "application/x-canvas-palette-item";
const TYPE_MIME = "application/x-canvas-palette-type";

export class PaletteDropController {
  constructor(private readonly store: PaletteStore, private readonly canvas: CanvasAdapter) {}

  mount(document: Document): () => void {
    document.addEventListener("dragover", this.onDragOver, true);
    document.addEventListener("drop", this.onDrop, true);
    return () => {
      document.removeEventListener("dragover", this.onDragOver, true);
      document.removeEventListener("drop", this.onDrop, true);
    };
  }

  private readonly onDragOver = (event: DragEvent): void => {
    if (!event.dataTransfer?.types.includes(ITEM_MIME) || !this.canvas.contextForTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    event.dataTransfer.dropEffect = "copy";
  };

  private readonly onDrop = (event: DragEvent): void => {
    if (!event.dataTransfer?.types.includes(ITEM_MIME) || !this.canvas.contextForTarget(event.target)) return;
    const itemId = event.dataTransfer.getData(ITEM_MIME);
    const item = this.store.data.items[itemId];
    if (!item) return;
    const declaredType = event.dataTransfer.getData(TYPE_MIME);
    if (declaredType && declaredType !== item.type) console.warn(`Canvas Palette drag type mismatch: ${declaredType} != ${item.type}`);
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    void this.canvas.restoreItemFromDrop(item, event);
  };
}
