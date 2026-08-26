import { setIcon } from "obsidian";
import type { CanvasAdapter, CanvasContext, CanvasRuntimeNodeLike } from "./canvas-adapter";

interface CanvasMenuRuntime {
  menu?: { menuEl?: HTMLElement };
  selection?: Set<unknown>;
}

interface CanvasNodeToolbarActions {
  editMetadata: (nodes: CanvasRuntimeNodeLike[]) => void;
  collectToMini: () => void;
  saveToSide: (anchor: HTMLElement) => void;
}

export class CanvasNodeToolbarController {
  private frame: number | null = null;
  private readonly observers = new Map<HTMLElement, MutationObserver>();
  private document: Document | null = null;
  private readonly schedule = (): void => this.refreshSoon();

  constructor(private readonly adapter: CanvasAdapter, private readonly actions: CanvasNodeToolbarActions) {}

  mount(document: Document): () => void {
    this.document = document;
    document.addEventListener("pointerup", this.schedule, true);
    document.addEventListener("keyup", this.schedule, true);
    this.refreshSoon();
    return () => this.destroy();
  }

  refreshSoon(): void {
    if (this.frame !== null) return;
    this.frame = window.requestAnimationFrame(() => {
      this.frame = null;
      this.refresh();
    });
  }

  refresh(): void {
    const activeMenus = new Set<HTMLElement>();
    for (const context of this.adapter.openContexts()) {
      const menuEl = (context.runtime as CanvasMenuRuntime).menu?.menuEl;
      if (!(menuEl instanceof HTMLElement)) continue;
      activeMenus.add(menuEl);
      this.observe(menuEl);
      this.decorate(context);
    }
    for (const [menuEl, observer] of this.observers) {
      if (activeMenus.has(menuEl)) continue;
      observer.disconnect();
      this.observers.delete(menuEl);
    }
  }

  destroy(): void {
    if (this.frame !== null) window.cancelAnimationFrame(this.frame);
    this.frame = null;
    this.document?.removeEventListener("pointerup", this.schedule, true);
    this.document?.removeEventListener("keyup", this.schedule, true);
    this.document = null;
    for (const observer of this.observers.values()) observer.disconnect();
    this.observers.clear();
    for (const context of this.adapter.openContexts()) this.remove(context);
  }

  private observe(menuEl: HTMLElement): void {
    if (this.observers.has(menuEl)) return;
    const observer = new MutationObserver(() => this.refreshSoon());
    observer.observe(menuEl, { childList: true });
    this.observers.set(menuEl, observer);
  }

  private decorate(context: CanvasContext): void {
    const runtime = context.runtime as CanvasMenuRuntime;
    const menuEl = runtime.menu?.menuEl;
    if (!(menuEl instanceof HTMLElement)) return;
    const selection = runtime.selection instanceof Set ? [...runtime.selection] as CanvasRuntimeNodeLike[] : [];
    const nodes = selection.filter((node) => Boolean(this.nodeId(node)));
    const selectionKey = nodes.map((node) => this.nodeId(node)).sort().join("|");
    const currentButtons = menuEl.querySelectorAll(":scope > .cp-canvas-toolbar-action");
    const separator = menuEl.querySelector(":scope > .cp-canvas-toolbar-separator");
    if (!selectionKey) { this.clear(menuEl); return; }
    if (menuEl.dataset.cpToolbarSelectionKey === selectionKey && currentButtons.length === 3 && separator) return;
    this.clear(menuEl);
    menuEl.dataset.cpToolbarSelectionKey = selectionKey;
    menuEl.createSpan({ cls: "cp-canvas-toolbar-separator", attr: { "aria-hidden": "true" } });
    this.button(menuEl, "tags", "Edit Palette Metadata", () => this.actions.editMetadata(nodes));
    this.button(menuEl, "inbox", "Collect to Mini Palette", () => this.actions.collectToMini());
    this.button(menuEl, "panel-right", "Save directly to Side Palette", (button) => this.actions.saveToSide(button));
  }

  private remove(context: CanvasContext): void {
    const menuEl = (context.runtime as CanvasMenuRuntime).menu?.menuEl;
    if (menuEl instanceof HTMLElement) this.clear(menuEl);
  }

  private clear(menuEl: HTMLElement): void {
    menuEl.querySelector(":scope > .cp-canvas-toolbar-separator")?.remove();
    for (const button of Array.from(menuEl.querySelectorAll(":scope > .cp-canvas-toolbar-action"))) button.remove();
    delete menuEl.dataset.cpToolbarNodeId;
    delete menuEl.dataset.cpToolbarSelectionKey;
  }

  private button(parent: HTMLElement, icon: string, label: string, action: (button: HTMLButtonElement) => void): void {
    const button = parent.createEl("button", { cls: "clickable-icon cp-canvas-toolbar-action", attr: { "aria-label": label, "data-tooltip-position": "top", type: "button" } });
    setIcon(button, icon);
    button.addEventListener("pointerdown", (event) => event.stopPropagation());
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      action(button);
    });
  }

  private nodeId(node: CanvasRuntimeNodeLike): string {
    if (typeof node.id === "string") return node.id;
    const data = node.getData?.();
    return typeof data?.id === "string" ? data.id : "";
  }
}
