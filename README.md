# Canvas Palette

Canvas Palette is an Obsidian desktop plugin for collecting Canvas-related cards, Markdown files, images, and reusable groups, organizing them by workspace and collection, and placing them back into other canvases.

Current version: **0.2.0**

Repository: [tlatndms2-droid/canvas-palette](https://github.com/tlatndms2-droid/canvas-palette)

## Current implementation

- Schema-versioned persistent model for items, workspaces, collections, pending imports, and UI state.
- The native selected-node Canvas toolbar remains available for both single and multiple Card/MD/Image/Group selections. Metadata editing applies one edit to every selected node, while Mini Palette collection and direct Side Palette storage operate on the complete selection. Selected Canvas text keeps the same collection routes in its editor context menu.
- The selected-node Canvas toolbar can create Palette Tags, Label, and Caption before collection. Existing Label, Tag, and Caption values can then be edited in place by double-clicking their visible overlay; Enter or focus loss saves, Escape cancels, and the automatic date remains read-only. The overlay preserves the native Canvas card and scales with the resized node.
- Floating Mini Palette mounted over the active Canvas, with a hover trigger, drag movement, resize, pin/close controls, and direct Canvas drag-and-drop.
- Separate Collect review and Storage management experiences; Collect uses an attached Inspector drawer that does not resize its parent.
- PDF-aligned docked three-pane Storage layout with independent left/right toggle and divider resize.
- Side Palette with representative workspaces, search, Card/List Viewport, Outliner, nested collections, Tag Index, Label Index, and independent scroll regions.
- Side Palette selection keeps the Viewport, Outliner, Tag Index, and Label Index scroll positions stable. The selection count and Delete action occupy a fixed status slot, so selecting cards never inserts content that pushes the asset list downward; the redundant batch metadata action is removed.
- Three independent persisted Side Palette splitters resize Viewport/Outliner width, Upper/Lower height, and Tag/Label width without coupling the two vertical ratios.
- Side Palette drag-and-drop resolves the stored Palette Item by ID and restores Card content, Markdown/Image file references, or complete Group subgraphs through the target Canvas runtime at the real drop position. Every dropped Card remains another linked instance of the same Palette Item: editing any linked Canvas Card or the Palette content updates all other instances.
- Item/collection organization: collection creation, nesting, rename, Canvas drag drop, Viewport reorder, multi-selection, batch tag editing, deletion, and move-to-collection actions.
- Type-specific Card, Markdown, Image, and Group rendering; rendered Markdown, source image preview, and subgraph preview with content-first card layouts.
- Side Palette double-click opens the existing native editor for Card/Markdown items and a large preview for Image/Group items. Image previews support mouse-wheel zoom from 20% to 500%.
- Mini and Side Palette use the same stored Item metadata. Their focused metadata editors support Tags, Label, and Caption without changing the title, content, original file, or Canvas node.
- Canvas placement history per asset, recorded after drag/drop or export and displayed in Side/Mini Palette cards and the detail popup. Card placement records also participate in synchronization instead of serving as display-only history.
- Collected Cards remain linked to their original and every subsequently placed Canvas node by Canvas path and Node ID. Card content plus Tags, Label, Label color, and Caption synchronize in both directions across the Palette and all linked Canvas Cards. The linked-Canvas row or context menu still locates and zooms to the original node.
- Multiple ordinary Canvas nodes are collected as separate Card/Markdown/Image assets. A Group asset is created only when an actual Canvas Group is selected; selecting its boundary automatically captures all contained nodes, internal edges, nested parent references, dimensions, and relative positions.
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
3. Select a Canvas Card, MD, Image, or Group. In the native node toolbar, choose **Collect to Mini Palette** for review or **Save directly to Side Palette** for a Workspace.
   Choose **Edit Palette Metadata** first if you want to attach Tags, a Label, or a Caption before collection. Afterward, double-click the visible Label, Tag, or Caption to edit it directly on the card. Those values are inherited by the collected Item.
4. Hover the Mini Palette trigger at the upper-right of the Canvas, review items in the Inspector, and import them into a Workspace.
5. Open Side Palette to organize Collections or Mini Palette Storage to search across Workspaces.
6. Drag an item from either palette directly into a Canvas. Cards create linked text-node instances whose content and Palette metadata stay synchronized everywhere; Markdown and images remain source-linked file nodes, and Groups restore their subgraph.
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

Install through BRAT and use it on real Canvas files. Report a reproducible issue with the current version and desired behavior; each fix will receive the next sequential patch release unless you explicitly request a new minor version. See `HANDOFF.md` and `docs/PROJECT_DECISIONS.md` before changing behavior.
