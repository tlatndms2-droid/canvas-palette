# Canvas Palette

Canvas Palette is an Obsidian desktop plugin for collecting Canvas-related cards, Markdown files, images, and reusable groups, organizing them by workspace and collection, and placing them back into other canvases.

Current version: **0.1.14**

Repository: [tlatndms2-droid/canvas-palette](https://github.com/tlatndms2-droid/canvas-palette)

## Current implementation

- Schema-versioned persistent model for items, workspaces, collections, pending imports, and UI state.
- Canvas-only context menus for selected Card/MD/Image/Group nodes and selected text: collect to Mini Palette or save directly to a chosen Side Palette Workspace.
- Canvas node context menus can edit Palette Tags, Label, and Caption before collection. Metadata uses a responsive reference-card layout with a title/Label header, preserved native content area, Tag-chip/date footer, and external Caption. Typography, spacing, chips, and chrome scale with the resized Canvas node; empty metadata produces no overlay.
- Floating Mini Palette mounted over the active Canvas, with a hover trigger, drag movement, resize, pin/close controls, and direct Canvas drag-and-drop.
- Separate Collect review and Storage management experiences; Collect uses an attached Inspector drawer that does not resize its parent.
- PDF-aligned docked three-pane Storage layout with independent left/right toggle and divider resize.
- Side Palette with representative workspaces, search, Card/List Viewport, Outliner, nested collections, Tag Index, Label Index, and independent scroll regions.
- Three independent persisted Side Palette splitters resize Viewport/Outliner width, Upper/Lower height, and Tag/Label width without coupling the two vertical ratios.
- Side Palette drag-and-drop resolves the stored Palette Item by ID and restores Card content, Markdown/Image file references, or complete Group subgraphs through the target Canvas runtime at the real drop position.
- Item/collection organization: collection creation, nesting, rename, Canvas drag drop, Viewport reorder, multi-selection, batch tag editing, deletion, and move-to-collection actions.
- Type-specific Card, Markdown, Image, and Group rendering; rendered Markdown, source image preview, and subgraph preview with content-first card layouts.
- Side Palette double-click opens the existing native editor for Card/Markdown items and a large preview for Image/Group items. Image previews support mouse-wheel zoom from 20% to 500%.
- Mini and Side Palette use the same stored Item metadata. Their focused metadata editors support Tags, Label, and Caption without changing the title, content, original file, or Canvas node.
- Canvas placement history per asset, recorded after drag/drop or export and displayed in Side/Mini Palette cards and the detail popup.
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
3. Right-click a Canvas Card, MD, Image, or Group. Under **Canvas Palette**, choose **Collect to Mini Palette** for review or **Save directly to Side Palette** for a Workspace.
   Choose **Edit Palette Metadata** first if you want to attach Tags, a Label, or a Caption before collection; those values are inherited by the collected Item.
4. Hover the Mini Palette trigger at the upper-right of the Canvas, review items in the Inspector, and import them into a Workspace.
5. Open Side Palette to organize Collections or Mini Palette Storage to search across Workspaces.
6. Drag an item from either palette directly into a Canvas. Cards create text nodes, Markdown and images remain source-linked file nodes, and Groups restore their subgraph.
7. Ctrl/Cmd-click items for multi-selection. In Side Palette, double-click Card/Markdown items to edit them, double-click Image/Group items to preview them, or right-click and choose **Set tags / label** to change only those classifications. Use the mouse wheel to zoom an Image preview.

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
- Collection entry points deliberately exist only inside Canvas node and Canvas text-selection context menus; File Explorer and active-file collection shortcuts are not provided.
- Text scraps preserve source origin/range and are highlighted in the editor; clicking the highlight selects the linked Palette Card and opens Side Palette.
- `More`, exact copy semantics, final filter-combination rules, and final pane min/max values remain deliberately undecided.

## Next work

Install through BRAT and use it on real Canvas files. Report a reproducible issue with the current version and desired behavior; each fix will receive the next sequential `0.1.x` release. See `HANDOFF.md` and `docs/PROJECT_DECISIONS.md` before changing behavior.
