import { Menu, Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { createId } from "./core/ids";
import { PaletteStore } from "./core/store";
import type { PaletteItem, PaletteWorkspace } from "./core/types";
import { MINI_PALETTE_VIEW, MiniPaletteView } from "./mini-palette/mini-palette-view";
import { SearchService } from "./search/search-service";
import { CanvasPaletteSettingTab } from "./settings/settings-tab";
import { SIDE_PALETTE_VIEW, SidePaletteView } from "./side-palette/side-palette-view";

export default class CanvasPalettePlugin extends Plugin {
  store = new PaletteStore(this);
  search = new SearchService();

  async onload(): Promise<void> {
    await this.store.load();
    this.registerView(SIDE_PALETTE_VIEW, (leaf) => new SidePaletteView(leaf, this));
    this.registerView(MINI_PALETTE_VIEW, (leaf) => new MiniPaletteView(leaf, this));
    this.addRibbonIcon("library-big", "Open Canvas Palette", () => void this.activateSidePalette());
    this.addRibbonIcon("panels-top-left", "Open Mini Palette", () => void this.activateMiniPalette());
    this.addCommand({ id: "open-side-palette", name: "Open Side Palette", callback: () => void this.activateSidePalette() });
    this.addCommand({ id: "open-mini-palette", name: "Open Mini Palette", callback: () => void this.activateMiniPalette() });
    this.addCommand({ id: "collect-active-file", name: "Collect active file", checkCallback: (checking) => {
      const file = this.app.workspace.getActiveFile();
      if (!file) return false;
      if (!checking) void this.collectFile(file);
      return true;
    }});
    this.addCommand({ id: "collect-selected-text", name: "Collect selected text as card", editorCheckCallback: (checking, editor, view) => {
      const selection = editor.getSelection();
      if (!selection) return false;
      if (!checking) this.collectText(selection, view.file?.path);
      return true;
    }});
    this.addCommand({ id: "new-workspace", name: "Create workspace", callback: () => {
      const workspace = this.store.createWorkspace(`Workspace ${Object.keys(this.store.data.workspaces).length + 1}`);
      this.store.data.uiState.activeWorkspaceId = workspace.id; this.store.changed(); new Notice(`Created ${workspace.name}`);
    }});
    this.registerEvent(this.app.workspace.on("file-menu", (menu: Menu, file) => {
      if (!(file instanceof TFile)) return;
      menu.addItem((item) => item.setTitle("Collect in Canvas Palette").setIcon("library-big").onClick(() => void this.collectFile(file)));
    }));
    this.addSettingTab(new CanvasPaletteSettingTab(this));
  }

  async onunload(): Promise<void> { await this.store.flush(); }

  activeWorkspace(): PaletteWorkspace | undefined {
    const id = this.store.data.uiState.activeWorkspaceId;
    return id ? this.store.data.workspaces[id] : undefined;
  }

  selectedItem(): PaletteItem | undefined {
    const id = this.store.data.uiState.selectedItemId;
    return id ? this.store.data.items[id] : undefined;
  }

  selectItem(id: string): void { this.store.data.uiState.selectedItemId = id; this.store.changed(); }

  async createMemo(): Promise<void> {
    const now = Date.now();
    const item: PaletteItem = { id: createId("card"), type: "card", displayTitle: "New memo", tags: [], label: "", caption: "", createdAt: now, modifiedAt: now, origin: {}, content: "" };
    this.store.addPending(item);
    const workspace = this.activeWorkspace();
    if (workspace) this.store.importPending(workspace.id, [item.id]);
    this.selectItem(item.id);
  }

  createCollection(): void {
    const workspace = this.activeWorkspace();
    if (!workspace) return;
    this.store.createCollection(workspace.id, `Collection ${workspace.rootCollectionIds.length + 1}`);
  }

  collectText(text: string, sourcePath?: string): void {
    const now = Date.now();
    this.store.addPending({ id: createId("card"), type: "card", displayTitle: text.split(/\r?\n/, 1)[0].slice(0, 60) || "Text scrap", tags: [], label: "", caption: "Text scrap", createdAt: now, modifiedAt: now, origin: { filePath: sourcePath }, content: text });
    new Notice("Text collected in Mini Palette");
  }

  async collectFile(file: TFile): Promise<void> {
    const imageExtensions = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"]);
    const type = imageExtensions.has(file.extension.toLowerCase()) ? "image" : "markdown";
    const now = Date.now();
    const content = type === "markdown" ? await this.app.vault.cachedRead(file) : undefined;
    this.store.addPending({ id: createId(type), type, displayTitle: file.basename, tags: [], label: "", caption: "", createdAt: now, modifiedAt: now, origin: { filePath: file.path }, content });
    new Notice(`${file.name} collected in Mini Palette`);
  }

  private async activateSidePalette(): Promise<void> {
    await this.activateView(SIDE_PALETTE_VIEW, this.app.workspace.getRightLeaf(false));
  }

  private async activateMiniPalette(): Promise<void> {
    await this.activateView(MINI_PALETTE_VIEW, this.app.workspace.getLeaf("tab"));
  }

  private async activateView(type: string, leaf: WorkspaceLeaf | null): Promise<void> {
    if (!leaf) return;
    await leaf.setViewState({ type, active: true });
    this.app.workspace.revealLeaf(leaf);
  }
}
