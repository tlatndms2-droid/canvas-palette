# Canvas Palette Handoff

## Current state

- Version: `0.1.10`
- Repository: `https://github.com/tlatndms2-droid/canvas-palette` (public).
- Build stack: TypeScript + esbuild using the official Obsidian API package.
- Latest release: `0.1.10`, with BRAT assets `main.js`, `manifest.json`, `styles.css`, and `canvas-palette-0.1.10.zip`.
- Release URL: `https://github.com/tlatndms2-droid/canvas-palette/releases/tag/0.1.10`.

## Source plan and confirmed product direction

- The authoritative plan is `Canvas Palette Codex 전체 개발 기획 v1.3`, supplied as both Markdown and PDF. The PDF was rendered and its embedded UI references were visually inspected; implementation decisions must be checked against both the written behavior and the visual layouts.
- The product is Canvas-native. Collection entry points belong inside Canvas, not in the Vault File Explorer.
- Mini Palette is a floating Canvas overlay opened by hover. It is not a normal Obsidian tab, and its stored assets must be draggable directly back onto Canvas.
- A collected Canvas node or selected text must offer two routes: review through Mini Palette, or save directly to a selected Side Palette Workspace.
- Side Palette is the persistent Workspace/Collection manager. One Canvas can be associated with multiple Workspaces, and a Workspace can be associated with multiple Canvas files.
- Card, Markdown, Image, and Group are the four stored asset types. Text scraps and Side memos are Card variants, not additional asset types.
- Markdown and Image items retain references to their original Vault files. Changing a Palette display title must never rename or duplicate those files.
- Theme choices are Follow Obsidian, Light, and Dark. Layout and component language remain consistent across themes, and Accent can use Obsidian's value or a user-selected custom color.
- The agreed delivery method is to implement the confirmed plan as an integrated build, then let the user demonstrate it in Obsidian and report concrete failures for sequential `0.1.x` fixes.
- While the user is listing or demonstrating problems, only inspect, compare with the plan, and brief the findings. Once the user explicitly requests a modification, complete the next sequential `0.1.x` build and BRAT release without requiring a separate release command, unless the user asks for local-only work.

## Conversation and release progression

- `0.1.0` was an early scaffold and was released before the full plan was represented. Do not use it as evidence that the plan was complete.
- `0.1.1` added the main Workspace, Side Palette, Canvas-hosted Mini Palette, storage/collect views, previews, Group serialization, text-scrap highlighting, themes, and Accent controls.
- The first collection integration incorrectly targeted the Vault File Explorer. The user reaffirmed that collection must happen inside Canvas.
- `0.1.2` removed the File Explorer/active-file collection route and added Canvas node context-menu choices for Mini Palette or direct Side Palette storage.
- During live inspection of `0.1.2`, the user identified missing selected-text collection, incorrect file restoration, generic card composition, missing Canvas placement labels, missing deletion and multi-selection, and missing double-click detail/edit behavior.
- `0.1.3` implements that complete correction batch. Static TypeScript checking, production bundling, JSON validation, Git push, public release state, and all three BRAT assets were verified before handoff.
- `0.1.4` replaces the tall detail form with an editor-like floating window opened by double-click. It keeps Canvas and Side Palette visible, renders Card Markdown, supports source editing, title editing, save/close/minimize, drag/resize, properties, linked Canvas paths, and `Ctrl/Cmd+S` saving.
- `0.1.5` removes that custom preview/textarea imitation for Card and Markdown items. Double-click now embeds Obsidian's real `WorkspaceLeaf` + `MarkdownView` Live Preview editor using the proven Canvas Visibility Quick Editor structure. Image and Group items continue to use the metadata/details popup.
- `0.1.6` repairs Side Palette split resizing. Pointer movement now updates CSS Grid tracks directly and persists Workspace layout only after the drag ends, preventing the store subscription from destroying the captured Divider during a drag. Upper width, lower width, and upper/lower height remain independent.
  - Obsidian CLI/CDP runtime validation covered all three real pointer drags, pointer capture continuity, correct row/column cursors, upper/lower vertical independence, outer overflow suppression, independent Pane scrolling, Workspace switch/restore, plugin reload persistence, and right Sidebar width resize. No captured runtime or console errors remained after the checks.
- `0.1.7` repairs Side Palette to Canvas drag-and-drop and type restoration. The shared drag payload now carries only the Palette item ID and stored type, and a plugin-level capture handler resolves the exact Canvas under the pointer before Obsidian's plain-text fallback can run. Card content, Markdown/Image file references, and complete Group snapshots are restored through the live Canvas runtime using `posFromEvt`, `setData`, and `requestSave`.
  - Obsidian CLI/CDP runtime validation used a disposable Canvas and disposable Palette fixtures. Image header/thumbnail/footer drops all produced the same image file node; Markdown produced a source-linked file node; a `New memo` item produced body `새로운 메모`; the stored 5-node/1-edge Group retained types, content, dimensions, relative positions, parent links, and edge directions; repeated drops kept the source and generated unique IDs. A zoom `-1.5` and pan `(400, 250)` position check matched the runtime coordinate conversion. All temporary data was removed afterward.
- `0.1.8` separates Side Palette preview from metadata editing. Double-click now opens a large read-only, type-specific preview for Card, Markdown, Image, and Group items; Markdown is read from its current Vault source, images preserve aspect ratio, and Group previews retain the full stored graph with image nodes and edge direction markers. The Side context menu removes `Open details / edit` and adds a focused `Set tags / label` toggle dialog. Mini Palette behavior is unchanged.
  - Obsidian runtime validation covered Viewport and Outliner double-click, all four preview types, current-source Markdown rendering, long-content internal scrolling, image containment, complete 5-node/1-edge Group rendering, outside-click/Escape close, and tag/label-only updates that preserved title, caption, and source path. Disposable fixtures were removed afterward.
- `0.1.9` corrects the over-broad `0.1.8` double-click change. Side Palette Card and Markdown items once again route through the existing native Quick Editor and remain editable. Image and Group retain the large preview, and Image preview now supports mouse-wheel zoom from 20% to 500% with a visible percentage indicator.
- `0.1.10` adds common Palette metadata across Canvas, Mini Palette, and Side Palette. Uncollected Canvas nodes store Tags, Label, Caption, and metadata modification time by Canvas path and Node ID; a non-destructive DOM overlay displays only populated values while preserving the native Card, Markdown, Image, and Group node. Collection inherits these values into the existing `PaletteItem`, after which Mini and Side continue to read and update the same Item object. Side and Mini Storage metadata actions now include Caption.
  - Obsidian runtime validation used a disposable four-node Canvas and disposable Palette Items. Canvas context-menu entry and three-field editor, immediate Card overlay positions/content, native node types for Card/Markdown/Image/Group, collection inheritance for all four types, Mini Collect Inspector editing, Side editing and immediate card refresh, shared Item identity, and empty-metadata overlay removal were verified. All disposable files, items, and metadata were removed afterward.

## User-observed 0.1.2 defects addressed in 0.1.3

1. A text selection inside a Canvas card had no Canvas Palette context-menu action. The editor menu now offers Mini Palette collection and direct Side Palette storage.
2. Dragging Markdown or Image assets back to Canvas could be intercepted as a plain-text drop, producing a filename/text preview instead of a file node. Palette drops now intercept the Canvas event before Obsidian's default handler, and Markdown/Image restore as source-linked `file` nodes.
3. Workspace export previously serialized every asset as a title-only text node. Export now preserves Card, Markdown, Image, and Group semantics; Collection/Workspace headings remain text nodes.
4. Viewport cards gave the title too much space and squeezed the actual content. Cards now use a stacked, content-first layout with larger images, rendered Markdown, and type-specific preview sizing.
5. The Palette did not show where an asset had been placed. `PaletteItem.canvasPlacements` now accumulates destination Canvas paths and node IDs; cards and the detail popup display the linked Canvas files.
6. Side Palette lacked deletion. Item menus, the selection toolbar, and the item editor now expose guarded deletion that removes Palette records only, never original Vault files or existing Canvas nodes.
7. Side Palette lacked multi-selection. Ctrl/Cmd-click toggles items, selected cards show a check marker at the upper-right, and batch tag/delete actions operate on the selected set.
8. Double-click editing was absent. Every asset type now opens the same detail/editor popup. Common metadata is editable for all types, Card content is editable, and Markdown/Image/Group provide their appropriate preview and original-file action.

## Implemented

- Schema version 4 migration, pre-collection Canvas-node metadata, Workspace Canvas association, per-item Canvas placement history, per-workspace Side layout, Mini Palette geometry, themes, and custom Accent persistence.
- Canvas Adapter for guarded active Canvas selection, Canvas JSON capture, file/text/group creation, Group ID remapping, and Collection mind-map export.
- Floating Canvas-hosted Mini Palette with hover trigger, window move/resize, Collect Inspector, Storage filters/sort/view modes, docked panes, previews, and Canvas drag/drop.
- Side Palette three-way independent divider resize, per-Pane scrolling, content-first type-aware Card/List Viewport, nested Outliner, Tag/Label indexes, item move/reorder, multi-selection, batch tags, guarded deletion, and type-preserving Canvas export.
- Preview service for rendered Card/Markdown content, images, and subgraph visualizations; Side Palette Card/Markdown double-click uses the native Quick Editor, while Image/Group opens the large preview and Image supports wheel zoom.
- Canvas Node and selected-text context-menu integration: `Collect to Mini Palette` or `Save directly to Side Palette — <Workspace>`. Vault File Explorer and active-file collection actions remain excluded because collection is Canvas-native.
- Canvas Node metadata integration: `Edit Palette Metadata` stores pre-collection values under Canvas path and Node ID, decorates the runtime node without changing Canvas JSON/content, and passes the values into the collected Palette Item. This is one-way inheritance at collection time, not ongoing Canvas↔Palette synchronization.

## Architecture

```text
src/
├─ core/             data types, defaults/migration, IDs, store
├─ canvas/           guarded Canvas adapter + group serializer
├─ side-palette/     workspace management view
├─ mini-palette/     Canvas-hosted floating Collect and Storage UI
├─ search/           query logic
├─ preview/          Markdown, image, and subgraph previews
├─ editor/           embedded native MarkdownView Quick Editor
├─ settings/         theme and accent settings UI
└─ ui/               shared rendering, resize, and modal primitives
```

Views mutate data through `PaletteStore`; search and preview remain separate. All Canvas document/runtime interaction must pass through `CanvasAdapter`, not directly through either palette view. Group capture and restore must continue to use the serializer.

## Important data model

- `PaletteItem`: common metadata plus optional content/group snapshot and accumulated Canvas placement records.
- `origin`: optional Canvas path/node, workspace, and Vault file path.
- `PaletteWorkspace`: Canvas associations, representative Canvas paths, root collections, and loose items.
- `Collection`: virtual nested folder; it must never create Vault folders.
- `pendingItemIds`: reviewed in Mini Palette Collect before workspace import.

## Manual validation required in Obsidian

The user has not yet completed a fresh runtime demonstration of all features unrelated to the focused `0.1.7` drag-and-drop checks. Static build success is not proof that unrelated Obsidian runtime paths are correct:

1. Selected text inside a Canvas card shows both Canvas Palette collection routes.
2. Side cards update their linked-Canvas label immediately after a successful export.
3. Ctrl/Cmd multi-selection, selection markers, batch tags, guarded delete, and native Quick Editor double-click all behave correctly without click/double-click conflicts.
4. Floating Mini Palette layering, hover opening, drag, resize, and drop interception remain compatible with third-party Canvas plugins.

## Safety and unresolved behavior

- Do not rename MD/image files when changing display titles.
- Do not add automatic bidirectional Card synchronization.
- Keep Collect and Storage separate, and keep Mini Palette Canvas-hosted rather than as a regular Obsidian tab.
- Keep the Storage panes docked, the grid responsive, and Light/Dark layouts geometrically identical.
- Do not define the More menu, final Copy semantics, filter composition, or final pane limits without user direction.
- Do not advance to `0.2.0` without explicit user instruction.

## Release checklist

Build, verify core flows, bump the next sequential `0.1.x` patch, update README and HANDOFF, commit, push, and create a GitHub release with `main.js`, `manifest.json`, and `styles.css` for BRAT.
