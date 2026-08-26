import { App, Notice, setIcon } from "obsidian";
import type { QuickEditorGeometry } from "../core/types";
import { NativeMarkdownEditor, type PaletteEditorTarget } from "./native-markdown-editor";

export class FloatingEditor {
  private overlayEl: HTMLElement | null = null;
  private panelEl: HTMLElement | null = null;
  private editor: NativeMarkdownEditor | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private geometryTimer: number | null = null;
  private geometryReady = false;
  private saving = false;
  private closed = false;
  private statusEl: HTMLElement | null = null;

  constructor(
    private readonly app: App,
    private readonly target: PaletteEditorTarget,
    private readonly geometry: QuickEditorGeometry,
    private readonly onSave: (text: string) => Promise<void> | void,
    private readonly onGeometryChanged: () => void,
    private readonly onClosed: () => void
  ) {}

  async open(): Promise<void> {
    const doc = this.app.workspace.containerEl.ownerDocument;
    const win = doc.defaultView ?? window;
    const overlay = doc.body.createDiv({ cls: "cp-quick-editor-overlay" });
    this.overlayEl = overlay;
    const panel = overlay.createDiv({ cls: "cp-quick-editor-panel canvas-palette" });
    this.panelEl = panel;
    this.applyInitialGeometry(panel, win);

    const header = panel.createDiv({ cls: "cp-quick-editor-header" });
    header.createDiv({ cls: "cp-quick-editor-title", text: this.target.title });
    const actions = header.createDiv({ cls: "cp-quick-editor-actions" });
    this.createIconButton(actions, "save", "Save (Ctrl+S)", () => void this.save());
    this.createIconButton(actions, "x", "Save and close (Esc)", () => void this.close(true));
    this.registerDragging(header, panel, win);

    const body = panel.createDiv({ cls: "cp-quick-editor-body" });
    const editorHost = body.createDiv({ cls: "cp-native-editor-host" });
    this.statusEl = panel.createDiv({ cls: "cp-quick-editor-status", text: this.target.kind === "file" ? this.target.file!.path : "Canvas Palette card" });
    this.editor = new NativeMarkdownEditor(this.app, this.target);
    try {
      await this.editor.mount(editorHost);
    } catch (error) {
      this.editor.detach();
      this.overlayEl?.remove();
      this.overlayEl = null;
      this.panelEl = null;
      throw error;
    }

    panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation(); void this.close(true);
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault(); event.stopPropagation(); void this.save();
      }
    }, true);

    this.resizeObserver = new ResizeObserver(() => {
      this.editor?.remeasure();
      if (this.geometryReady) this.scheduleGeometrySave();
    });
    this.resizeObserver.observe(panel);
    win.setTimeout(() => { this.geometryReady = true; }, 0);
  }

  async close(saveChanges: boolean): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (saveChanges) {
      try { await this.save(); }
      catch { this.closed = false; return; }
    }
    this.saveGeometryNow();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.editor?.detach();
    this.editor = null;
    this.overlayEl?.remove();
    this.overlayEl = null;
    this.panelEl = null;
    this.onClosed();
  }

  private async save(): Promise<void> {
    if (this.saving) return;
    this.saving = true;
    this.updateStatus("Saving…");
    try {
      const text = this.editor?.getText() ?? this.target.initialText;
      await this.editor?.saveFile();
      await this.onSave(text);
      this.updateStatus("Saved");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Canvas Palette could not save: ${message}`);
      this.updateStatus("Save failed");
      throw error;
    } finally { this.saving = false; }
  }

  private applyInitialGeometry(panel: HTMLElement, win: Window): void {
    const margin = 12;
    const minWidth = Math.min(480, win.innerWidth - margin * 2);
    const minHeight = Math.min(320, win.innerHeight - margin * 2);
    const width = Math.max(minWidth, Math.min(this.geometry.width ?? win.innerWidth * 0.75, win.innerWidth - margin * 2));
    const height = Math.max(minHeight, Math.min(this.geometry.height ?? win.innerHeight * 0.8, win.innerHeight - margin * 2));
    const left = this.clamp(this.geometry.x ?? (win.innerWidth - width) / 2, margin, Math.max(margin, win.innerWidth - width - margin));
    const top = this.clamp(this.geometry.y ?? (win.innerHeight - height) / 2, margin, Math.max(margin, win.innerHeight - height - margin));
    panel.style.left = `${left}px`; panel.style.top = `${top}px`; panel.style.width = `${width}px`; panel.style.height = `${height}px`;
  }

  private registerDragging(header: HTMLElement, panel: HTMLElement, win: Window): void {
    header.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
      event.preventDefault();
      const startX = event.clientX; const startY = event.clientY;
      const startLeft = panel.offsetLeft; const startTop = panel.offsetTop;
      header.setPointerCapture(event.pointerId); header.addClass("is-dragging");
      const move = (moveEvent: PointerEvent): void => {
        panel.style.left = `${this.clamp(startLeft + moveEvent.clientX - startX, 0, Math.max(0, win.innerWidth - panel.offsetWidth))}px`;
        panel.style.top = `${this.clamp(startTop + moveEvent.clientY - startY, 0, Math.max(0, win.innerHeight - panel.offsetHeight))}px`;
      };
      const finish = (): void => {
        header.removeClass("is-dragging");
        header.removeEventListener("pointermove", move); header.removeEventListener("pointerup", finish); header.removeEventListener("pointercancel", finish);
        this.saveGeometryNow();
      };
      header.addEventListener("pointermove", move); header.addEventListener("pointerup", finish); header.addEventListener("pointercancel", finish);
    });
  }

  private scheduleGeometrySave(): void {
    const win = this.panelEl?.ownerDocument.defaultView ?? window;
    if (this.geometryTimer !== null) win.clearTimeout(this.geometryTimer);
    this.geometryTimer = win.setTimeout(() => { this.geometryTimer = null; this.saveGeometryNow(); }, 200);
  }

  private saveGeometryNow(): void {
    const panel = this.panelEl;
    if (!panel) return;
    const win = panel.ownerDocument.defaultView ?? window;
    if (this.geometryTimer !== null) { win.clearTimeout(this.geometryTimer); this.geometryTimer = null; }
    this.geometry.x = panel.offsetLeft; this.geometry.y = panel.offsetTop; this.geometry.width = panel.offsetWidth; this.geometry.height = panel.offsetHeight;
    this.onGeometryChanged();
  }

  private createIconButton(parent: HTMLElement, icon: string, label: string, onClick: () => void): HTMLElement {
    const button = parent.createEl("button", { cls: "clickable-icon", attr: { type: "button", "aria-label": label } });
    setIcon(button, icon);
    button.addEventListener("click", (event) => { event.preventDefault(); onClick(); });
    return button;
  }
  private updateStatus(text: string): void { this.statusEl?.setText(text); }
  private clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, value)); }
}
