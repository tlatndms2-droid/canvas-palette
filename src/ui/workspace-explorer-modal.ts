import { App, Menu, Modal, setIcon } from "obsidian";
import type CanvasPalettePlugin from "../main";
import type { PaletteWorkspace, WorkspaceExplorerSort } from "../core/types";
import { TextPromptModal } from "./modal";

type Filter = "all" | "canvas" | "general";

/** Persistent non-modal Explorer. The backdrop deliberately accepts no pointer events. */
export class WorkspaceExplorerModal {
  private query = ""; private filter: Filter = "all"; private date = "";
  private selected = new Set<string>(); private anchor: string | null = null;
  private root: HTMLElement | null = null; private panel: HTMLElement | null = null; private unsubscribe?: () => void;
  constructor(private readonly app: App, private readonly plugin: CanvasPalettePlugin) {}

  open(): void {
    if (this.panel) { this.expand(); this.panel.style.zIndex = "var(--layer-modal,1000)"; return; }
    const doc = this.app.workspace.containerEl.ownerDocument;
    this.root = doc.body.createDiv({ cls: "cp-workspace-explorer-overlay" });
    this.panel = this.root.createDiv({ cls: "canvas-palette cp-workspace-explorer-popup" });
    this.applyGeometry(); this.unsubscribe = this.plugin.store.subscribe(() => this.render()); this.render();
  }
  close(): void { this.saveGeometry(); this.unsubscribe?.(); this.root?.remove(); this.root = null; this.panel = null; this.selected.clear(); this.anchor = null; }
  private state() { return this.plugin.store.data.uiState.workspaceExplorer; }
  private geo() { return this.state().geometry; }

  private render(): void {
    const panel = this.panel; if (!panel) return;
    panel.empty();
    const header = panel.createDiv({ cls: "cp-workspace-explorer-popup__header" });
    const handle = header.createDiv({ cls: "cp-workspace-explorer-popup__drag" });
    handle.createEl("strong", { text: "Workspace Explorer" }); handle.createSpan({ text: "Canvas별 Workspace 관리" }); this.drag(handle);
    const actions = header.createDiv({ cls: "cp-workspace-explorer-popup__actions" });
    this.icon(actions, "archive", "Archive", () => this.plugin.openArchive());
    this.icon(actions, this.geo().collapsed ? "chevrons-up-down" : "minus", this.geo().collapsed ? "펼치기" : "접기", () => { this.geo().collapsed = !this.geo().collapsed; this.plugin.store.changed(); });
    this.icon(actions, "x", "닫기", () => this.close());
    if (this.geo().collapsed) { panel.addClass("is-collapsed"); return; } panel.removeClass("is-collapsed");

    const toolbar = panel.createDiv({ cls: "cp-workspace-explorer-popup__toolbar" });
    const search = toolbar.createEl("input", { value: this.query, attr: { type: "search", placeholder: "Canvas 또는 Workspace 검색" } });
    search.addEventListener("input", () => { this.query = search.value.normalize("NFC"); this.clear(); this.render(); });
    for (const [value, text] of [["all", "전체"], ["canvas", "Canvas"], ["general", "일반"]] as const) { const button = toolbar.createEl("button", { text, cls: this.filter === value ? "is-active" : "" }); button.addEventListener("click", () => { this.filter = value; this.clear(); this.render(); }); }
    const sort = toolbar.createEl("select", { attr: { "aria-label": "정렬" } });
    for (const [value, text] of [["modified-desc", "최근 수정"], ["modified-asc", "오래된 수정"], ["created-desc", "최근 생성"], ["created-asc", "오래된 생성"], ["name-asc", "이름순"], ["name-desc", "이름 역순"]] as const) { const option = sort.createEl("option", { value, text }); option.selected = this.state().sort === value; }
    sort.addEventListener("change", () => { this.state().sort = sort.value as WorkspaceExplorerSort; this.plugin.store.changed(); });
    const date = toolbar.createEl("input", { value: this.date, attr: { type: "date", "aria-label": "수정일 필터" } }); date.addEventListener("change", () => { this.date = date.value; this.clear(); this.render(); });

    const current = this.plugin.currentCanvasPath(); if (current) this.currentSection(panel, current);
    const body = panel.createDiv({ cls: "cp-workspace-explorer-popup__body" });
    const canvases = body.createDiv({ cls: "cp-workspace-explorer-popup__area" }); const general = body.createDiv({ cls: "cp-workspace-explorer-popup__area" });
    this.canvasArea(canvases); this.generalArea(general);
    const footer = panel.createDiv({ cls: "cp-workspace-explorer-popup__footer" }); footer.createSpan({ text: `선택 ${this.selected.size}개` });
    const clear = footer.createEl("button", { text: "선택 해제" }); clear.disabled = !this.selected.size; clear.addEventListener("click", () => { this.clear(); this.render(); });
    const pending = this.plugin.store.data.uiState.pendingCanvasWorkspaceCleanup.length; if (pending) footer.createEl("button", { text: `처리 대기 ${pending}건` }).addEventListener("click", () => this.plugin.openPendingCanvasWorkspaceCleanup());
    footer.createEl("button", { text: "+ 일반 Workspace" }).addEventListener("click", () => new TextPromptModal(this.app, "새 일반 Workspace", "", (name) => this.plugin.store.createWorkspace(name), "Workspace 이름").open());
    const create = footer.createEl("button", { text: "+ 현재 Canvas Workspace" }); create.disabled = !current; create.addEventListener("click", () => current && this.plugin.openCanvasWorkspaceCreator(current));
  }

  private currentSection(parent: HTMLElement, path: string): void {
    const section = parent.createDiv({ cls: "cp-workspace-explorer-popup__current" }); section.createEl("strong", { text: `현재 열린 Canvas · ${this.canvasName(path)}` });
    const list = section.createDiv({ cls: "cp-workspace-explorer-popup__rows" }); const workspaces = this.plugin.store.canvasWorkspaces(path);
    if (!workspaces.length) list.createDiv({ cls: "cp-empty", text: "연결된 Workspace가 없습니다. 아래 일반 Workspace를 이 Canvas 폴더로 옮길 수 있습니다." });
    for (const workspace of workspaces) this.workspaceRow(list, workspace); this.dropTarget(section, path);
  }
  private canvasArea(parent: HTMLElement): void {
    this.areaTitle(parent, "Canvas Workspace", "folder-kanban");
    if (this.filter === "general") return;
    // This tree is an ownership browser, not a Vault Canvas browser. Empty Canvases remain available through “Canvas로 이동…”.
    const paths = new Set<string>(); for (const workspace of Object.values(this.plugin.store.data.workspaces)) if (workspace.kind === "canvas" && workspace.ownerCanvasPath) paths.add(workspace.ownerCanvasPath);
    for (const path of [...paths].sort((a, b) => this.canvasName(a).localeCompare(this.canvasName(b)))) {
      const workspaces = this.sorted(this.plugin.store.canvasWorkspaces(path)); const matches = !this.query || `${path} ${workspaces.map((workspace) => workspace.name).join(" ")}`.toLocaleLowerCase().includes(this.query.trim().toLocaleLowerCase()); if (!matches) continue;
      const expanded = this.geo().expandedCanvasPaths.includes(path); const folder = parent.createDiv({ cls: `cp-workspace-canvas-folder${expanded ? " is-expanded" : ""}` });
      const heading = folder.createDiv({ cls: "cp-workspace-canvas-folder__heading", attr: { tabindex: "0", role: "button" } }); const arrow = heading.createSpan(); setIcon(arrow, expanded ? "chevron-down" : "chevron-right"); const icon = heading.createSpan(); setIcon(icon, "folder"); heading.createSpan({ text: this.canvasName(path) }); heading.createEl("small", { text: ` · ${workspaces.length}` });
      const toggle = () => { const paths = new Set(this.geo().expandedCanvasPaths); paths.has(path) ? paths.delete(path) : paths.add(path); this.geo().expandedCanvasPaths = [...paths]; this.plugin.store.changed(); }; heading.addEventListener("click", toggle); heading.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(); } }); this.dropTarget(heading, path);
      if (expanded) { const list = folder.createDiv({ cls: "cp-workspace-explorer-popup__rows" }); if (!workspaces.length) list.createDiv({ cls: "cp-workspace-canvas-folder__empty", text: "여기에 Workspace를 놓아 소속시킵니다." }); for (const workspace of workspaces) this.workspaceRow(list, workspace); }
    }
  }
  private generalArea(parent: HTMLElement): void {
    this.areaTitle(parent, "일반 Workspace", "folder"); this.dropTarget(parent, null); if (this.filter === "canvas") return;
    const list = parent.createDiv({ cls: "cp-workspace-explorer-popup__rows" }); const workspaces = this.sorted(Object.values(this.plugin.store.data.workspaces).filter((workspace) => workspace.kind === "general"));
    for (const workspace of workspaces) if (this.matches(workspace)) this.workspaceRow(list, workspace);
    if (!list.children.length) list.createDiv({ cls: "cp-empty", text: "Canvas Workspace를 여기로 끌어오면 일반 Workspace가 됩니다." });
  }
  private areaTitle(parent: HTMLElement, text: string, iconName: string): void { const title = parent.createDiv({ cls: "cp-workspace-explorer-popup__area-title" }); const icon = title.createSpan(); setIcon(icon, iconName); title.createSpan({ text }); }

  private workspaceRow(parent: HTMLElement, workspace: PaletteWorkspace): void {
    const representative = workspace.kind === "canvas" && workspace.ownerCanvasPath === workspace.representativeCanvasPath; const selected = this.selected.has(workspace.id); const active = this.plugin.store.data.uiState.activeWorkspaceId === workspace.id;
    const row = parent.createDiv({ cls: `cp-workspace-explorer-row${selected ? " is-selected" : ""}${active ? " is-active" : ""}`, attr: { tabindex: "0", draggable: "true", "data-workspace-id": workspace.id } });
    const check = row.createEl("input", { attr: { type: "checkbox", "aria-label": `${workspace.name} 선택` } }); check.checked = selected; check.addEventListener("click", (event) => { event.stopPropagation(); this.toggle(workspace.id); this.render(); });
    const icon = row.createSpan(); setIcon(icon, "folder-kanban"); const label = row.createSpan({ cls: "cp-workspace-explorer-row__title", text: workspace.name }); if (representative) { const star = label.createSpan({ cls: "cp-workspace-explorer-row__star" }); setIcon(star, "star"); } row.createEl("small", { text: `${this.plugin.store.itemsForWorkspace(workspace.id).length} Items` });
    const more = row.createEl("button", { cls: "cp-icon-button", attr: { title: "Workspace 작업", "aria-label": "Workspace 작업" } }); setIcon(more, "more-vertical"); more.addEventListener("click", (event) => { event.stopPropagation(); const rect = more.getBoundingClientRect(); if (!this.selected.has(workspace.id)) this.only(workspace.id); this.render(); this.actions([...this.selected], { x: rect.right, y: rect.bottom + 2 }); });
    row.addEventListener("click", (event) => this.click(workspace.id, event)); row.addEventListener("dblclick", () => this.openWorkspace(workspace.id)); row.addEventListener("keydown", (event) => { if (event.key === "Enter") this.openWorkspace(workspace.id); if (event.key === " ") { event.preventDefault(); this.toggle(workspace.id); this.render(); } }); row.addEventListener("contextmenu", (event) => { event.preventDefault(); if (!this.selected.has(workspace.id)) this.only(workspace.id); this.render(); this.actions([...this.selected], { x: event.clientX, y: event.clientY }); });
    row.addEventListener("dragstart", (event) => { const ids = this.selected.has(workspace.id) ? [...this.selected] : [workspace.id]; if (!this.selected.has(workspace.id)) this.only(workspace.id); event.dataTransfer?.setData("application/x-canvas-palette-workspaces", JSON.stringify(ids)); if (event.dataTransfer) event.dataTransfer.effectAllowed = "move"; });
  }
  private dropTarget(target: HTMLElement, path: string | null): void { target.addEventListener("dragover", (event) => { if (!event.dataTransfer?.types.includes("application/x-canvas-palette-workspaces")) return; event.preventDefault(); target.addClass("is-drop-target"); }); target.addEventListener("dragleave", () => target.removeClass("is-drop-target")); target.addEventListener("drop", (event) => { event.preventDefault(); target.removeClass("is-drop-target"); try { const ids = JSON.parse(event.dataTransfer?.getData("application/x-canvas-palette-workspaces") ?? "[]") as string[]; this.plugin.store.moveWorkspaces(ids, path); } catch { /* external drag */ } }); }
  private actions(ids: string[], position: { x: number; y: number }): void { const workspaces = ids.map((id) => this.plugin.store.data.workspaces[id]).filter((workspace): workspace is PaletteWorkspace => Boolean(workspace && workspace.kind !== "archive")); if (!workspaces.length) return; const menu = new Menu(); if (workspaces.length === 1) { const workspace = workspaces[0]; menu.addItem((item) => item.setTitle("열기").setIcon("folder-open").onClick(() => this.openWorkspace(workspace.id))); menu.addItem((item) => item.setTitle("이름 변경").setIcon("pencil").onClick(() => new TextPromptModal(this.app, "Workspace 이름 변경", workspace.name, (name) => this.plugin.store.renameWorkspace(workspace.id, name), "Workspace 이름").open())); menu.addItem((item) => item.setTitle(workspace.representativeCanvasPath ? "대표 Workspace 해제" : "대표 Workspace 지정").setIcon("star").setDisabled(workspace.kind !== "canvas").onClick(() => { if (!workspace.ownerCanvasPath) return; if (workspace.representativeCanvasPath) { workspace.representativeCanvasPath = null; this.plugin.store.changed(); } else this.plugin.store.setRepresentativeWorkspace(workspace.id, workspace.ownerCanvasPath); })); menu.addSeparator(); }
    menu.addItem((item) => item.setTitle("Canvas로 이동…").setIcon("folder-input").onClick(() => new WorkspaceCanvasTargetModal(this.app, this.canvasPaths(), (path) => this.plugin.store.moveWorkspaces(workspaces.map((workspace) => workspace.id), path)).open())); menu.addItem((item) => item.setTitle("일반 Workspace로 이동").setIcon("folder-output").onClick(() => this.plugin.store.moveWorkspaces(workspaces.map((workspace) => workspace.id), null))); menu.addSeparator(); menu.addItem((item) => item.setTitle(workspaces.length === 1 ? "Workspace 삭제" : `${workspaces.length}개 Workspace 삭제`).setIcon("trash-2").onClick(() => new ConfirmDeleteWorkspacesModal(this.app, workspaces, (id) => this.plugin.store.itemsForWorkspace(id).length, () => this.plugin.store.removeWorkspaces(workspaces.map((workspace) => workspace.id))).open())); menu.showAtPosition(position); }

  private canvasPaths(): string[] { const paths = new Set(this.app.vault.getFiles().filter((file) => file.extension.toLowerCase() === "canvas").map((file) => file.path)); for (const workspace of Object.values(this.plugin.store.data.workspaces)) if (workspace.ownerCanvasPath) paths.add(workspace.ownerCanvasPath); return [...paths].sort(); }
  private matches(workspace: PaletteWorkspace): boolean { return !this.query || `${workspace.name} ${workspace.ownerCanvasPath ?? ""}`.toLocaleLowerCase().includes(this.query.trim().toLocaleLowerCase()); }
  private sorted(workspaces: PaletteWorkspace[]): PaletteWorkspace[] { const sort = this.state().sort; return workspaces.filter((workspace) => !this.date || this.localDate(workspace.modifiedAt) === this.date).sort((a, b) => { if (sort.startsWith("name")) return a.name.localeCompare(b.name) * (sort.endsWith("asc") ? 1 : -1); const key = sort.startsWith("created") ? "createdAt" : "modifiedAt"; return (a[key] - b[key]) * (sort.endsWith("asc") ? 1 : -1); }); }
  private canvasName(path: string): string { return path.replace(/\.canvas$/i, ""); } private localDate(value: number): string { const date = new Date(value); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
  private visible(): string[] { return Array.from(this.panel?.querySelectorAll<HTMLElement>(".cp-workspace-explorer-row") ?? []).map((row) => row.dataset.workspaceId).filter((id): id is string => Boolean(id)); }
  private click(id: string, event: MouseEvent): void { if (event.shiftKey && this.anchor) { const all = this.visible(); const from = all.indexOf(this.anchor); const to = all.indexOf(id); if (from >= 0 && to >= 0) for (const item of all.slice(Math.min(from, to), Math.max(from, to) + 1)) this.selected.add(item); } else if (event.ctrlKey || event.metaKey) this.toggle(id); else this.only(id); this.anchor = id; this.render(); }
  private only(id: string): void { this.selected = new Set([id]); this.anchor = id; } private toggle(id: string): void { this.selected.has(id) ? this.selected.delete(id) : this.selected.add(id); this.anchor = id; } private clear(): void { this.selected.clear(); this.anchor = null; }
  private openWorkspace(id: string): void { if (!this.plugin.store.data.workspaces[id]) return; this.plugin.store.data.uiState.activeWorkspaceId = id; this.plugin.store.changed(); void this.plugin.openSidePalette(); }
  private icon(parent: HTMLElement, iconName: string, label: string, action: () => void): void { const button = parent.createEl("button", { cls: "cp-icon-button", attr: { title: label, "aria-label": label } }); setIcon(button, iconName); button.addEventListener("click", action); }
  private applyGeometry(): void { const panel = this.panel; if (!panel) return; const win = panel.ownerDocument.defaultView ?? window; const width = Math.max(620, Math.min(this.geo().width ?? 1000, win.innerWidth - 24)); const height = Math.max(360, Math.min(this.geo().height ?? 700, win.innerHeight - 24)); panel.style.width = `${width}px`; panel.style.height = `${height}px`; panel.style.left = `${Math.max(12, Math.min(this.geo().x ?? (win.innerWidth - width) / 2, win.innerWidth - width - 12))}px`; panel.style.top = `${Math.max(12, Math.min(this.geo().y ?? (win.innerHeight - height) / 2, win.innerHeight - height - 12))}px`; }
  private drag(handle: HTMLElement): void { const panel = this.panel; if (!panel) return; const win = panel.ownerDocument.defaultView ?? window; handle.addEventListener("pointerdown", (event) => { if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return; const left = panel.offsetLeft; const top = panel.offsetTop; handle.setPointerCapture(event.pointerId); const move = (next: PointerEvent) => { panel.style.left = `${Math.max(0, Math.min(left + next.clientX - event.clientX, win.innerWidth - panel.offsetWidth))}px`; panel.style.top = `${Math.max(0, Math.min(top + next.clientY - event.clientY, win.innerHeight - panel.offsetHeight))}px`; }; const done = () => { handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", done); handle.removeEventListener("pointercancel", done); this.saveGeometry(); }; handle.addEventListener("pointermove", move); handle.addEventListener("pointerup", done); handle.addEventListener("pointercancel", done); }); }
  private saveGeometry(): void { const panel = this.panel; if (!panel) return; this.geo().x = panel.offsetLeft; this.geo().y = panel.offsetTop; this.geo().width = panel.offsetWidth; this.geo().height = panel.offsetHeight; this.plugin.store.changed(); }
  private expand(): void { if (this.geo().collapsed) { this.geo().collapsed = false; this.plugin.store.changed(); } }
}

class WorkspaceCanvasTargetModal extends Modal { constructor(app: App, private readonly paths: string[], private readonly choose: (path: string) => void) { super(app); } onOpen(): void { this.contentEl.addClass("canvas-palette", "cp-confirm-modal"); this.contentEl.createEl("h2", { text: "Canvas로 Workspace 이동" }); const select = this.contentEl.createEl("select"); for (const path of this.paths) select.createEl("option", { value: path, text: path.replace(/\.canvas$/i, "") }); const actions = this.contentEl.createDiv({ cls: "cp-modal-actions" }); actions.createEl("button", { text: "취소" }).addEventListener("click", () => this.close()); actions.createEl("button", { text: "이동", cls: "mod-cta" }).addEventListener("click", () => { if (select.value) this.choose(select.value); this.close(); }); } onClose(): void { this.contentEl.empty(); } }
class ConfirmDeleteWorkspacesModal extends Modal { constructor(app: App, private readonly workspaces: PaletteWorkspace[], private readonly count: (id: string) => number, private readonly confirm: () => void) { super(app); } onOpen(): void { this.contentEl.addClass("canvas-palette", "cp-confirm-modal"); this.contentEl.createEl("h2", { text: this.workspaces.length === 1 ? "Workspace를 삭제할까요?" : `${this.workspaces.length}개 Workspace를 삭제할까요?` }); for (const workspace of this.workspaces) this.contentEl.createDiv({ text: `${workspace.name} · Item ${this.count(workspace.id)}개` }); this.contentEl.createEl("p", { text: "Workspace와 Collections는 제거됩니다. 소속을 잃는 Item만 Archive로 이동하며, 원본 파일과 Canvas 연결은 유지됩니다." }); const actions = this.contentEl.createDiv({ cls: "cp-modal-actions" }); actions.createEl("button", { text: "취소" }).addEventListener("click", () => this.close()); actions.createEl("button", { text: "Workspace 삭제", cls: "mod-warning" }).addEventListener("click", () => { this.confirm(); this.close(); }); } onClose(): void { this.contentEl.empty(); } }
