import { App, MarkdownView, TFile, Workspace, WorkspaceLeaf, WorkspaceSplit } from "obsidian";

export interface PaletteEditorTarget {
  itemId: string;
  kind: "card" | "file";
  file: TFile | null;
  title: string;
  initialText: string;
}

interface EmbeddedWorkspaceSplit extends WorkspaceSplit { containerEl: HTMLElement; }
interface MeasurableMarkdownView extends MarkdownView { editMode?: { reinit?(): void }; }
type WorkspaceSplitConstructor = new (workspace: Workspace, direction: "horizontal" | "vertical") => EmbeddedWorkspaceSplit;

/** Hosts Obsidian's real MarkdownView inside the floating panel. */
export class NativeMarkdownEditor {
  private split: EmbeddedWorkspaceSplit | null = null;
  private leaf: WorkspaceLeaf | null = null;
  private view: MarkdownView | null = null;

  constructor(private readonly app: App, private readonly target: PaletteEditorTarget) {}

  async mount(containerEl: HTMLElement, activateLeaf = true): Promise<void> {
    const Split = WorkspaceSplit as unknown as WorkspaceSplitConstructor;
    const split = new Split(this.app.workspace, "vertical");
    split.getRoot = () => this.app.workspace.rootSplit;
    split.getContainer = () => this.app.workspace.rootSplit.getContainer();
    containerEl.appendChild(split.containerEl);
    this.split = split;

    const leaf = this.app.workspace.createLeafInParent(split, 0);
    this.leaf = leaf;
    if (this.target.kind === "file" && this.target.file) {
      await leaf.openFile(this.target.file, {
        active: true,
        state: { mode: "source", source: false },
        eState: { focus: true }
      });
      await leaf.loadIfDeferred();
      if (!(leaf.view instanceof MarkdownView)) throw new Error("Could not open the Markdown editor.");
      this.view = leaf.view;
    } else {
      const view = new MarkdownView(leaf);
      await leaf.open(view);
      view.setViewData(this.target.initialText, true);
      this.view = view;
    }
    if (activateLeaf) this.app.workspace.setActiveLeaf(leaf, { focus: true });
    this.remeasure();
    if (!activateLeaf) window.requestAnimationFrame(() => containerEl.querySelector<HTMLElement>(".cm-content")?.focus());
  }

  getText(): string { return this.view?.getViewData() ?? this.target.initialText; }
  async saveFile(): Promise<void> { if (this.target.kind === "file") await this.view?.save(); }
  remeasure(): void { (this.view as MeasurableMarkdownView | null)?.editMode?.reinit?.(); }
  detach(): void {
    this.leaf?.detach();
    this.leaf = null;
    this.view = null;
    this.split?.containerEl.remove();
    this.split = null;
  }
}
