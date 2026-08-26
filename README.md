# Canvas Palette

Canvas Palette is an Obsidian desktop plugin for collecting Canvas-related cards, Markdown files, images, and reusable groups, organizing them by workspace and collection, and placing them back into other canvases.

Current version: **0.1.0**

Repository: [tlatndms2-droid/canvas-palette](https://github.com/tlatndms2-droid/canvas-palette)

## Current implementation

- Versioned local data model for items, workspaces, collections, pending collection, settings, and UI state.
- Separate Side Palette and Mini Palette views.
- Side Palette workspace selector, search, responsive card viewport, collection outliner, tag index, and label index.
- Mini Palette Collect review flow and docked three-pane Storage layout.
- Card, Markdown, image, and group-specific visual treatment.
- Commands to collect selected Markdown text or the active file.
- Vault file context-menu collection.
- Workspace creation, memo creation, collection creation, selection, import, and deletion foundations.
- Pure group serializer/restorer that retains internal edges and relative node layout.
- Theme, card size, font size, and column preferences.

## Item types

- **Card**: a text snapshot or Side Palette memo.
- **Markdown**: references an existing Vault Markdown file; it is not copied or renamed.
- **Image**: references an existing Vault image; it is not copied or renamed.
- **Group**: a reusable Canvas subgraph snapshot containing nodes, internal edges, sizes, and relative layout.

## Use

1. Enable Canvas Palette in Obsidian.
2. Open the Side Palette from the ribbon or command palette.
3. Collect selected editor text or an active Markdown/image file from the command palette or file menu.
4. Open Mini Palette, review pending items, select them, and import them into a workspace.
5. Browse the imported items in either palette.

## Installation for development

```bash
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` into:

```text
<Vault>/.obsidian/plugins/canvas-palette/
```

## BRAT installation

1. Install and enable the BRAT plugin in Obsidian.
2. Choose **Add Beta plugin**.
3. Enter `tlatndms2-droid/canvas-palette`.
4. Enable Canvas Palette under Obsidian's Community plugins settings.

## Known limitations

- Direct Canvas node selection, Canvas drag/drop placement, collection-to-Canvas export, and live Canvas group capture are not yet wired to Obsidian's internal Canvas runtime.
- Item Inspector editing, pane drag resizing, drag reordering, advanced filters, multi-select gestures, Markdown rendering, and image binary previews remain incomplete.
- Text scraps currently record source file origin but do not create clickable source highlights.
- Workspace representative-Canvas switching and per-workspace layout restoration are data-model foundations only.

## Next work

The next implementation milestone is the Canvas adapter: selected node extraction, group capture, safe node insertion, group restoration, and collection tree export. See `HANDOFF.md` and `docs/PROJECT_DECISIONS.md` before changing behavior.
