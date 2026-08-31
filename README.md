# Canvas Palette

Canvas Palette is an Obsidian desktop plugin for collecting Canvas-related cards, Markdown files, images, and reusable groups, organizing them by workspace and collection, and placing them back into other canvases.

Current version: **0.3.24**

Repository: [tlatndms2-droid/canvas-palette](https://github.com/tlatndms2-droid/canvas-palette)

## Current implementation

- Mini transfer and canonical Palette identity are now separate decisions. Sending from Side checks only whether the selected IDs already exist in Mini Storage; Side/Workspace/Canvas presence never blocks the transfer. The Side header sends the current Side selection rather than recollecting the Canvas selection. Collecting an already canonical Canvas node adds that existing ID to Mini Storage without creating another Item, while a genuinely new Canvas node still enters Collect for review. Removing a Mini Storage entry leaves Side, Workspace, and Canvas untouched.
- Canvas collection now enforces one linked node as one canonical Palette Item. Re-collecting an already linked Card/Markdown/Image/Group does not create another ID in Collect, Side, or Mini Storage. On load, exact duplicate IDs that point to the same Canvas path and node are consolidated into the oldest identity, while the newest content/metadata and existing Workspace, Collection, Mini relay, child, selection, and placement references are redirected to that canonical Item.
- Mini Collect is the inspection boundary before Side storage. Importing a reviewed Item no longer fails because it came from another Canvas: it removes that Item's previous Workspace/Collection membership, assigns only the selected destination Workspace, and keeps its original Canvas link as provenance. In a Canvas-owned Workspace, Side `Linked/Unlinked` is evaluated against that Workspace's owner Canvas, so an imported Item with no node inside that Canvas is immediately shown and filterable as `Unlinked`.
- Mini Palette is now an explicit Workspace-independent relay hub: Side Palette cards enter or leave Mini through the `Mini Palette로 보내기` / `Mini Palette에서 제거` context-menu toggle. Mini Storage shows only those explicitly sent links, its own removal action unlinks only from Mini, and Side Palette/Workspace items, original Vault files, and Canvas nodes remain canonical and unchanged. Storage counts exclude pending Collect items, the obsolete Mini Workspace selector remains removed, and the type filter displays Markdown compactly as `MD`.
- Mini Palette and Side Palette now share a seven-step Windows File Explorer-style asset density system. One Item size control changes card width, height, responsive column count, preview detail, and the final List/Details layout in sequence; each palette restores its own saved density after reload.
- Mini Palette Collect and Storage keep independent selection sets and anchors. Both support plain, Ctrl/Cmd, Shift, and Ctrl/Cmd+Shift selection; Storage also supports blank-space clearing and rectangle selection. Single selection uses the border only, while multi-selection adds check markers.
- Mini Palette batch actions operate on the visible selection: filtered Select all, multi-item metadata, confirmed deletion, multi-item drag payloads, and `Place on Canvas` for selected items only. Workspace mind-map Export remains a Side Palette responsibility. Closing the Mini left pane keeps quick Search, Type filter, and Item size controls above Assets.
- Schema-versioned persistent model for items, workspaces, collections, pending imports, and UI state.
- Workspaces are either general or Canvas-owned. Opening a Canvas automatically ensures its first dedicated Workspace and makes one dedicated Workspace the representative default. A Canvas can own unlimited dedicated Workspaces, the user can choose exactly one representative, and `Current Canvas` returns to it immediately. Dedicated Workspaces accept only items that originate from or currently exist on their owner Canvas; general Workspaces accept material from every Canvas. This storage restriction never limits exporting or dragging stored material to any Canvas.
- Front/Back is opt-in per selected Canvas text or file node, including an Image only when the user explicitly enables that exact material; unrelated cards, images, and files remain unchanged. The Side Palette Viewport card menu exposes `Enable Front / Back` or `Remove Front / Back` for the clicked material, while the native Canvas node toolbar provides the same state control. An enabled linked material shows its flip control across Canvas, Side Palette, and Mini Palette. Removal returns linked placements to Front and hides their flip UI without deleting the saved Back text. Re-enabling restores that Back. In the Side Palette, Front content keeps the separate popup editor while Back content opens native Live Preview directly inside the Back-facing card. On Canvas, a rendered Back can be dragged to move its card and its own inline editor remains isolated from movement.
- Back content, Front/Back enabled state, and Metadata synchronize across the Palette Item and every linked Canvas placement, while each enabled Canvas node, Side card, and Mini card keeps its own current face. Palette-to-Canvas drag restores that complete linked state. Linked Canvas nodes expose `Unlink from Palette` in the native node toolbar; this one-shot command preserves Front, Back, Metadata, enabled state, current face, and the native Canvas border while stopping all later synchronization.
- Markdown source identity follows Vault file and folder renames automatically. A normal Markdown card has no source-status marker. A card with no Canvas placement continues to use the existing generic Unlinked icon. Only a deleted original Markdown file adds a compact red `file-x` button beside the existing Front/Back control; it is the same 22×22px footprint as the existing header indicators and uses Obsidian's theme-aware error color, border, and subtle surface tint. Its menu offers `MD 복구` or `Palette에서 삭제`. Deleted Markdown retains its last path and cached body, can still be placed as a Canvas text fallback, and returns to the ordinary unmarked card after restoration. Legacy Markdown records with no source path are repaired into ordinary Cards instead of exposing an invalid path state.
- Every linked Canvas node shows a link badge at its upper-left. The Canvas badge stays opposite the upper-right Front/Back control, while Palette source status shares a flex action slot with Front/Back and remains clear of the reserved selection marker.
- The linked-node badge is now a dedicated button. Clicking it reuses or opens Side Palette, switches to the Item's actual Workspace, clears filters that would hide it, selects only that Item, scrolls its card into view, and briefly highlights it. Pointer and double-click events are isolated from Canvas selection, movement, and drag behavior.
- Side Palette uses `Find link` for linked Items. One linked Canvas opens immediately; multiple linked Canvas files open a wide, scrollable picker with clearly separated full-row navigation targets, one representative node per Canvas path, and the chosen location opens with its node selected and centered. Unlinked Markdown/Image Items retain `Open source file` so Vault-source access is not lost.
- The native selected-node Canvas toolbar remains available for both single and multiple Card/MD/Image/Group selections. Metadata editing applies one edit to every selected node, while Mini Palette collection and direct Side Palette storage operate on the complete selection. Selected Canvas text keeps the same collection routes in its editor context menu.
- The selected-node Canvas toolbar can create Palette Tags, Label, and Caption before collection. Existing Label, Tag, and Caption values can then be edited in place by double-clicking their visible overlay; Enter or focus loss saves, Escape cancels, and the automatic date remains read-only. The overlay preserves the native Canvas card and scales with the resized node.
- Floating Mini Palette mounted over the active Canvas, with a hover trigger, drag movement, resize, pin/close controls, and direct Canvas drag-and-drop.
- Separate Collect review and Storage management experiences; Collect uses an attached Inspector drawer that does not resize its parent.
- PDF-aligned docked three-pane Storage layout with independent left/right toggle and divider resize.
- Side Palette with representative workspaces, search, Card/List Viewport, Outliner, nested collections, Tag Index, Label Index, and independent scroll regions.
- The Viewport keeps the immediately visible `All / Image / MD / Card / Group / Unlinked / Linked spaces` filter buttons. Selected-item deletion uses a small trash action, `+ Memo` remains visible beside View settings, and Grid/List remains available inside View settings. The Outliner keeps every existing hierarchy and Collection action while using denser rows, aligned disclosure arrows, icons, metadata, and action buttons.
- Side Palette selection keeps the Viewport, Outliner, Tag Index, and Label Index scroll positions stable. The visible selection count and Delete action occupy a fixed status slot, so selecting cards never inserts content that pushes the asset list downward; the redundant batch metadata action is removed.
- Side Palette selection follows Windows File Explorer conventions: plain click selects one Card, Ctrl/Cmd-click toggles individual Cards, Shift-click selects a visible range, blank-space click clears selection, and dragging from blank grid space draws a live selection rectangle. A single selection uses only the Card border; check markers appear only when two or more Cards are selected. The Viewport `Unlinked` toggle filters the current results to Items that have no remaining Canvas node link and composes with search and type filters.
- Selected Card/Markdown previews constrain standard iframe/video embeds and MX-style Shadow DOM video players to the actual Viewport width as complete 16:9 media blocks. Media blocks participate in internal scroll snapping instead of remaining wider than the Card and being clipped.
- Three independent persisted Side Palette splitters resize Viewport/Outliner width, Upper/Lower height, and Tag/Label width without coupling the two vertical ratios.
- Side Palette drag-and-drop resolves the stored Palette Item by ID and restores Card content, Markdown/Image file references, or complete Group subgraphs through the target Canvas runtime at the real drop position. Every dropped Card remains another linked instance of the same Palette Item: editing any linked Canvas Card or the Palette content updates all other instances.
- Item/collection organization: collection creation, nesting, rename, Canvas drag drop, Viewport reorder, multi-selection, scalable batch Tags/Label/Caption editing, deletion, and move-to-collection actions. The Outliner behaves as a movable tree: Collection rows can be selected and dragged under another Collection or back to the Workspace root; Item rows support single, Ctrl/Cmd, and Shift selection, and dragging one selected Item moves the full selection into a Collection or back to the root. Drop targets are highlighted, while self/descendant Collection drops are rejected by cycle protection. The metadata editor summarizes selected values, searches Tags and Labels in fixed-height dropdowns, virtualizes long result lists, and supports creating new values without expanding the modal.
- Image and Markdown context menus rename the linked Vault source file, Palette title, and every linked Canvas file-node path together. Group renaming updates the Palette title, stored root Group label, and every linked Canvas Group node. `Convert to shared Markdown…` creates exactly one real `.md` file in the Vault, changes the Palette Card into a Markdown Item, and changes every linked Canvas text Card into a file node for the same path. The reverse direction is also synchronized: using Obsidian Canvas `Convert to file…` on a linked text Card converts its existing Palette Card into a Markdown Item that references the same generated Vault `.md` file while preserving the Item identity, metadata, and Canvas link. Because native Obsidian replaces the text node with a new file-node ID, Canvas Palette compares the before/after node snapshots and transfers the link to the new node at the same position before reconciliation. Palette Markdown headers show their existing file icon inside a compact green `MD` badge; Canvas nodes receive no extra type icon. Trailing periods and spaces are removed before `.md` is appended, preventing accidental `..md` names.
- Type-specific Card, Markdown, Image, and Group rendering; every Palette header uses a compact color-coded icon without redundant type text while leaving Canvas nodes unchanged. File and Item titles wrap across as many lines as needed instead of being truncated. Rendered Markdown, source image preview, and subgraph preview keep their content-first card layouts.
- Side Palette double-click opens the existing native editor for Card/Markdown items and a large preview for Image/Group items. Image previews support mouse-wheel zoom from 20% to 500%.
- Mini and Side Palette use the same stored Item metadata. Their focused metadata editors support Tags, Label, and Caption without changing the title, content, original file, or Canvas node.
- Canvas placement history per asset, recorded after drag/drop or export and displayed in Side/Mini Palette cards and the detail popup. Card placement records also participate in synchronization instead of serving as display-only history.
- Grid captions occupy a dedicated centered row below their Card instead of using negative layout space that can overlap the following Card.
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
6. Drag an item from either palette directly into a Canvas. Cards create linked text-node instances whose content, Back, and Palette metadata stay synchronized everywhere; Markdown and images remain source-linked file nodes, and Groups restore their subgraph. Use the small flip icon to change only that location's visible face, and double-click a Back to edit it in native Live Preview.
7. Ctrl/Cmd-click items for multi-selection. In Side Palette, double-click Card/Markdown items to edit them, double-click Image/Group items to preview them, or right-click and choose **Edit tags, label & caption** to search, select, or create Tags and Labels and update Caption. Use the mouse wheel to zoom an Image preview.

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
- `More` and final pane min/max values remain deliberately undecided. Copy uses shared linked-item identity, and filters use the visible Obsidian-like Search query described in `HANDOFF.md`.

## Next work

Install through BRAT and use it on real Canvas files. Report a reproducible issue with the current version and desired behavior; each fix will receive the next sequential patch release unless you explicitly request a new minor version. See `HANDOFF.md` and `docs/PROJECT_DECISIONS.md` before changing behavior.
