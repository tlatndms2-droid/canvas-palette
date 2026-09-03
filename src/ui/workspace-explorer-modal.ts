import { App, Menu, Modal, Notice, setIcon } from "obsidian";
import type CanvasPalettePlugin from "../main";
import type { PaletteWorkspace, WorkspaceExplorerSort, WorkspaceExplorerViewMode } from "../core/types";
import { TextPromptModal } from "./modal";

type WorkspaceFilter = "all" | "canvas" | "general" | "archive";

export class WorkspaceExplorerModal extends Modal {
  private query = "";
  private filter: WorkspaceFilter = "all";
  private date = "";
  private unsubscribe?: () => void;

  constructor(app: App, private readonly plugin: CanvasPalettePlugin) { super(app); }

  onOpen(): void {
    this.modalEl.addClass("cp-workspace-explorer-shell");
    this.unsubscribe = this.plugin.store.subscribe(() => this.render());
    this.render();
  }

  onClose(): void { this.unsubscribe?.(); this.contentEl.empty(); }

  private render(): void {
    const activeElement = document.activeElement;
    const restoreSearch = activeElement instanceof HTMLInputElement && activeElement.hasClass("cp-workspace-explorer__search");
    const cursor = restoreSearch ? activeElement.selectionStart : null;
    this.contentEl.empty();
    this.contentEl.addClass("canvas-palette", "cp-workspace-explorer");
    const title = this.contentEl.createDiv({ cls: "cp-workspace-explorer__title" });
    title.createEl("h2", { text: "Workspace Explorer" });
    title.createSpan({ text: "Find and manage Workspaces like files." });

    const toolbar = this.contentEl.createDiv({ cls: "cp-workspace-explorer__toolbar" });
    const search = toolbar.createEl("input", { cls: "cp-workspace-explorer__search", value: this.query, attr: { type: "search", placeholder: "Search Canvas or Workspace…", autocomplete: "off" } });
    search.addEventListener("input", () => { this.query = search.value.normalize("NFC"); this.render(); });
    if (restoreSearch) window.requestAnimationFrame(() => { search.focus(); search.setSelectionRange(cursor, cursor); });

    const controls = toolbar.createDiv({ cls: "cp-workspace-explorer__controls" });
    for (const [value, label] of [["all", "All"], ["canvas", "Canvas"], ["general", "General"], ["archive", "Archive"]] as const) {
      const button = controls.createEl("button", { text: label, cls: this.filter === value ? "is-active" : "" });
      button.addEventListener("click", () => { this.filter = value; this.render(); });
    }
    const sort = controls.createEl("select", { attr: { "aria-label": "Sort Workspaces" } });
    for (const [value, label] of [["modified-desc", "Modified: newest"], ["modified-asc", "Modified: oldest"], ["created-desc", "Created: newest"], ["created-asc", "Created: oldest"], ["name-asc", "Name: A–Z"], ["name-desc", "Name: Z–A"]] as const) {
      const option = sort.createEl("option", { value, text: label }); option.selected = this.viewState().sort === value;
    }
    sort.addEventListener("change", () => { this.viewState().sort = sort.value as WorkspaceExplorerSort; this.plugin.store.changed(); });
    const date = controls.createEl("input", { cls: "cp-workspace-explorer__date", value: this.date, attr: { type: "date", title: "Filter by modified date", "aria-label": "Filter by modified date" } });
    date.addEventListener("change", () => { this.date = date.value; this.render(); });
    if (this.date) {
      const clearDate = controls.createEl("button", { cls: "cp-icon-button", attr: { title: "Clear date", "aria-label": "Clear date" } }); setIcon(clearDate, "x");
      clearDate.addEventListener("click", () => { this.date = ""; this.render(); });
    }
    const views = controls.createDiv({ cls: "cp-workspace-explorer__views" });
    for (const [value, icon, label] of [["icons", "grid-2x2", "Icons"], ["list", "list", "List"], ["details", "list-tree", "Details"]] as const) {
      const button = views.createEl("button", { cls: `cp-icon-button${this.viewState().viewMode === value ? " is-active" : ""}`, attr: { title: `${label} view`, "aria-label": `${label} view` } }); setIcon(button, icon);
      button.addEventListener("click", () => { this.viewState().viewMode = value; this.plugin.store.changed(); });
    }

    const results = this.filteredWorkspaces();
    const currentCanvas = this.plugin.currentCanvasPath();
    const current = currentCanvas ? results.filter((workspace) => workspace.kind === "canvas" && workspace.ownerCanvasPath === currentCanvas) : [];
    const archive = results.filter((workspace) => workspace.kind === "archive");
    const other = results.filter((workspace) => !current.includes(workspace) && !archive.includes(workspace));
    const body = this.contentEl.createDiv({ cls: `cp-workspace-explorer__body is-${this.viewState().viewMode}` });
    if (currentCanvas) this.renderSection(body, `Current Canvas · ${this.baseName(currentCanvas)}`, current, true);
    this.renderSection(body, "Archive", archive, true);
    this.renderSection(body, currentCanvas ? "Other Workspaces" : "Workspaces", other, false);
    if (results.length === 0) body.createDiv({ cls: "cp-empty", text: "No matching Workspaces." });

    const footer = this.contentEl.createDiv({ cls: "cp-workspace-explorer__footer" });
    const general = footer.createEl("button", { text: "+ New Workspace" });
    general.addEventListener("click", () => new TextPromptModal(this.app, "New general Workspace", "", (name) => {
      const workspace = this.plugin.store.createWorkspace(name, "general"); this.plugin.store.data.uiState.activeWorkspaceId = workspace.id; this.plugin.store.changed();
    }, "Workspace name").open());
    const canvas = footer.createEl("button", { text: "+ Current Canvas Workspace" }); canvas.disabled = !currentCanvas;
    canvas.addEventListener("click", () => {
      if (!currentCanvas) return;
      this.plugin.openCanvasWorkspaceCreator(currentCanvas);
    });
  }

  private renderSection(parent: HTMLElement, title: string, workspaces: PaletteWorkspace[], pinned: boolean): void {
    if (workspaces.length === 0) return;
    const section = parent.createDiv({ cls: "cp-workspace-explorer__section" });
    const heading = section.createDiv({ cls: "cp-workspace-explorer__section-title" });
    if (pinned) setIcon(heading.createSpan(), "pin"); heading.createSpan({ text: title });
    if (this.viewState().viewMode === "details") {
      const columns = section.createDiv({ cls: "cp-workspace-explorer__columns" });
      columns.createSpan({ text: "Name" }); columns.createSpan({ text: "Type / Canvas" }); columns.createSpan({ text: "Modified" }); columns.createSpan();
    }
    const list = section.createDiv({ cls: "cp-workspace-explorer__list" });
    for (const workspace of workspaces) this.renderWorkspace(list, workspace);
  }

  private renderWorkspace(parent: HTMLElement, workspace: PaletteWorkspace): void {
    const active = this.plugin.store.data.uiState.activeWorkspaceId === workspace.id;
    const representative = workspace.kind === "canvas" && workspace.ownerCanvasPath === workspace.representativeCanvasPath;
    const row = parent.createDiv({ cls: `cp-workspace-file${active ? " is-selected" : ""}`, attr: { tabindex: "0", role: "button" } });
    const icon = row.createSpan({ cls: "cp-workspace-file__icon" }); setIcon(icon, workspace.kind === "canvas" ? "folder-kanban" : workspace.kind === "archive" ? "archive" : "folder");
    const name = row.createDiv({ cls: "cp-workspace-file__name" });
    const label = name.createDiv(); if (representative) { const star = label.createSpan({ cls: "cp-workspace-file__star" }); setIcon(star, "star"); } label.createSpan({ text: workspace.name });
    if (this.viewState().viewMode === "icons") name.createSpan({ cls: "cp-workspace-file__date", text: this.formatDate(workspace.modifiedAt) });
    const meta = row.createDiv({ cls: "cp-workspace-file__meta" });
    meta.createSpan({ cls: "cp-workspace-file__badge", text: workspace.kind === "canvas" ? (representative ? "Representative" : "Canvas") : workspace.kind === "archive" ? "Archive" : "General" });
    meta.createSpan({ text: workspace.kind === "canvas" ? `소속 Canvas · ${this.baseName(workspace.ownerCanvasPath ?? "")}` : workspace.kind === "archive" ? "Independent snapshots" : "All Canvases" });
    row.createSpan({ cls: "cp-workspace-file__modified", text: this.formatDate(workspace.modifiedAt) });
    const more = row.createEl("button", { cls: "cp-icon-button cp-workspace-file__more", attr: { title: "Workspace actions", "aria-label": "Workspace actions" } }); setIcon(more, "more-vertical");
    const open = (): void => { this.plugin.store.data.uiState.activeWorkspaceId = workspace.id; this.plugin.store.changed(); };
    row.addEventListener("dblclick", open);
    row.addEventListener("keydown", (event) => { if (event.key === "Enter") open(); });
    more.addEventListener("click", (event) => { event.stopPropagation(); this.showActions(workspace, more); });
  }

  private showActions(workspace: PaletteWorkspace, anchor: HTMLElement): void {
    const menu = new Menu();
    menu.addItem((item) => item.setTitle("Open").setIcon("folder-open").onClick(() => { this.plugin.store.data.uiState.activeWorkspaceId = workspace.id; this.plugin.store.changed(); }));
    const canvasPath = this.plugin.currentCanvasPath();
    const canRepresent = Boolean(canvasPath && workspace.kind === "canvas" && workspace.ownerCanvasPath === canvasPath);
    menu.addItem((item) => item.setTitle("Set as representative").setIcon("star").setDisabled(!canRepresent).setChecked(Boolean(canRepresent && workspace.representativeCanvasPath === canvasPath)).onClick(() => {
      if (canvasPath) this.plugin.store.setRepresentativeWorkspace(workspace.id, canvasPath);
    }));
    menu.addItem((item) => item.setTitle("Rename").setIcon("pencil").onClick(() => new TextPromptModal(this.app, "Rename Workspace", workspace.name, (name) => this.plugin.store.renameWorkspace(workspace.id, name), "Workspace name").open()));
    menu.addSeparator();
    menu.addItem((item) => item.setTitle("Delete").setIcon("trash-2").setDisabled(workspace.kind === "archive").onClick(() => new ConfirmDeleteWorkspaceModal(this.app, workspace.name, this.plugin.store.itemsForWorkspace(workspace.id).length, () => {
      if (this.plugin.store.removeWorkspace(workspace.id)) new Notice(`${workspace.name} deleted. Its Palette items moved to Archive.`);
    }).open()));
    const rect = anchor.getBoundingClientRect(); menu.showAtPosition({ x: rect.right, y: rect.bottom + 2 });
  }

  private filteredWorkspaces(): PaletteWorkspace[] {
    const query = this.query.trim().toLocaleLowerCase();
    const workspaces = Object.values(this.plugin.store.data.workspaces).filter((workspace) => {
      if (this.filter !== "all" && workspace.kind !== this.filter) return false;
      const owner = workspace.ownerCanvasPath ?? "";
      if (query && !`${workspace.name} ${owner} ${this.baseName(owner)}`.toLocaleLowerCase().includes(query)) return false;
      if (this.date && this.localDate(workspace.modifiedAt) !== this.date) return false;
      return true;
    });
    const sort = this.viewState().sort;
    return workspaces.sort((a, b) => {
      if (sort === "name-asc" || sort === "name-desc") return a.name.localeCompare(b.name, undefined, { numeric: true }) * (sort === "name-asc" ? 1 : -1);
      const key = sort.startsWith("created") ? "createdAt" : "modifiedAt";
      return (a[key] - b[key]) * (sort.endsWith("asc") ? 1 : -1);
    });
  }

  private viewState(): { viewMode: WorkspaceExplorerViewMode; sort: WorkspaceExplorerSort } { return this.plugin.store.data.uiState.workspaceExplorer; }
  private baseName(path: string): string { return path.split("/").pop()?.replace(/\.canvas$/i, "") ?? path; }
  private formatDate(value: number): string { return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(value); }
  private localDate(value: number): string { const date = new Date(value); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
}

class ConfirmDeleteWorkspaceModal extends Modal {
  constructor(app: App, private readonly name: string, private readonly count: number, private readonly onConfirm: () => void) { super(app); }
  onOpen(): void {
    this.contentEl.addClass("canvas-palette", "cp-confirm-modal");
    this.contentEl.createEl("h2", { text: "Delete Workspace?" });
    this.contentEl.createEl("p", { text: `“${this.name}” will be removed. Its ${this.count} Palette item${this.count === 1 ? "" : "s"} will remain in Mini Palette storage. Original Vault files and Canvas nodes will not be deleted.` });
    const actions = this.contentEl.createDiv({ cls: "cp-modal-actions" });
    actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    actions.createEl("button", { text: "Delete Workspace", cls: "mod-warning" }).addEventListener("click", () => { this.onConfirm(); this.close(); });
  }
  onClose(): void { this.contentEl.empty(); }
}
