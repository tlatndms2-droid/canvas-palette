# Canvas Palette

Canvas Palette is an Obsidian desktop plugin for collecting Canvas-related cards, Markdown files, images, and reusable groups, organizing them by workspace and collection, and placing them back into other canvases.

Current version: **0.1.1**

Repository: [tlatndms2-droid/canvas-palette](https://github.com/tlatndms2-droid/canvas-palette)

## Current implementation

- Schema-versioned persistent model for items, workspaces, collections, pending imports, and UI state.
- Canvas adapter for selected Canvas Card/MD/Image/Group collection and Canvas JSON restoration.
- Floating Mini Palette mounted over the active Canvas, with a hover trigger, drag movement, resize, pin/close controls, and direct Canvas drag-and-drop.
- Separate Collect review and Storage management experiences; Collect uses an attached Inspector drawer that does not resize its parent.
- PDF-aligned docked three-pane Storage layout with independent left/right toggle and divider resize.
- Side Palette with representative workspaces, search, Card/List Viewport, Outliner, nested collections, Tag Index, Label Index, and independent scroll regions.
- Item/collection organization: collection creation, nesting, rename, Canvas drag drop, Viewport reorder, and move-to-collection actions.
- Type-specific Card, Markdown, Image, and Group rendering; Markdown preview, source image preview, and subgraph preview.
- Group serializer/restorer that remaps IDs while retaining internal nodes, edges, nested parent references, dimensions, and relative positions.
- Collection-to-Canvas mind-map export.
- Follow Obsidian, Light, and Dark themes with a shared design system; use the Obsidian accent or a custom accent color.

## Item types

- **Card**: a text snapshot or Side Palette memo.
- **Markdown**: references an existing Vault Markdown file; it is not copied or renamed.
- **Image**: references an existing Vault image; it is not copied or renamed.
- **Group**: a reusable Canvas subgraph snapshot containing nodes, internal edges, sizes, and relative layout.

## Use

1. Enable Canvas Palette in Obsidian.
2. Open the Side Palette from the ribbon or command palette.
3. On a Canvas, select nodes and use **Collect selected Canvas items**. The selected Card, MD, Image, or Group enters Mini Palette Collect.
4. Hover the Mini Palette trigger at the upper-right of the Canvas, review items in the Inspector, and import them into a Workspace.
5. Open Side Palette to organize Collections or Mini Palette Storage to search across Workspaces.
6. Drag an item from either palette directly into a Canvas. Cards create text nodes, files retain their source reference, and Groups restore their subgraph.

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

## Validation notes

- Canvas integration is implemented through Canvas document JSON plus guarded runtime selection access. It must be exercised against the user's installed Obsidian Canvas version before depending on it for production canvases.
- Text scraps preserve source origin/range and are highlighted in the editor; clicking the highlight selects the linked Palette Card and opens Side Palette.
- `More`, exact copy semantics, final filter-combination rules, and final pane min/max values remain deliberately undecided.

## Next work

Install through BRAT and use it on real Canvas files. Report a reproducible issue with the current version and desired behavior; each fix will receive the next sequential `0.1.x` release. See `HANDOFF.md` and `docs/PROJECT_DECISIONS.md` before changing behavior.
