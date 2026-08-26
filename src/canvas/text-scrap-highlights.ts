import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { Extension, StateEffect } from "@codemirror/state";
import type CanvasPalettePlugin from "../main";

const refreshHighlights = StateEffect.define<void>();

export class TextScrapHighlights {
  constructor(private readonly plugin: CanvasPalettePlugin) {}

  extension(): Extension {
    const plugin = this.plugin;
    return ViewPlugin.fromClass(class {
      decorations: DecorationSet;
      constructor(view: EditorView) { this.decorations = buildDecorations(view, plugin); }
      update(update: ViewUpdate): void {
        if (update.docChanged || update.transactions.some((transaction) => transaction.effects.some((effect) => effect.is(refreshHighlights)))) this.decorations = buildDecorations(update.view, plugin);
      }
    }, {
      decorations: (value) => value.decorations,
      eventHandlers: {
        click(event): boolean {
          const target = event.target;
          if (!(target instanceof HTMLElement)) return false;
          const marker = target.closest<HTMLElement>("[data-canvas-palette-item]");
          const itemId = marker?.dataset.canvasPaletteItem;
          if (!itemId) return false;
          plugin.selectItem(itemId); void plugin.openSidePalette();
          return true;
        }
      }
    }).extension;
  }

  refreshVisibleEditors(): void {
    for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view as unknown as { editor?: { cm?: EditorView } };
      view.editor?.cm?.dispatch({ effects: refreshHighlights.of() });
    }
  }
}

function buildDecorations(view: EditorView, plugin: CanvasPalettePlugin): DecorationSet {
  const builder: Array<{ from: number; to: number; decoration: Decoration }> = [];
  const text = view.state.doc.toString();
  for (const item of plugin.store.allItems()) {
    if (item.type !== "card" || !item.origin.textRange || !item.content) continue;
    const from = positionToOffset(view, item.origin.textRange.from.line, item.origin.textRange.from.ch, item.content, text);
    if (from < 0) continue;
    const to = Math.min(view.state.doc.length, from + item.content.length);
    builder.push({ from, to, decoration: Decoration.mark({ class: "cp-text-scrap-highlight", attributes: { "data-canvas-palette-item": item.id, title: "Open linked Canvas Palette card" } }) });
  }
  builder.sort((a, b) => a.from - b.from || a.to - b.to);
  return Decoration.set(builder.map((entry) => entry.decoration.range(entry.from, entry.to)), true);
}

function positionToOffset(view: EditorView, line: number, ch: number, content: string, text: string): number {
  if (line >= 0 && line < view.state.doc.lines) {
    const row = view.state.doc.line(line + 1);
    const candidate = Math.min(row.to, row.from + Math.max(0, ch));
    if (text.slice(candidate, candidate + content.length) === content) return candidate;
  }
  return text.indexOf(content);
}
