# Canvas Palette Handoff

## Current state

- Version: `0.1.3`
- Repository: `https://github.com/tlatndms2-droid/canvas-palette` (public).
- Build stack: TypeScript + esbuild using the official Obsidian API package.
- Latest release: `0.1.3`, with BRAT assets `main.js`, `manifest.json`, and `styles.css`.

## Implemented

- Schema version 3 migration, Workspace Canvas association, per-item Canvas placement history, per-workspace Side layout, Mini Palette geometry, themes, and custom Accent persistence.
- Canvas Adapter for guarded active Canvas selection, Canvas JSON capture, file/text/group creation, Group ID remapping, and Collection mind-map export.
- Floating Canvas-hosted Mini Palette with hover trigger, window move/resize, Collect Inspector, Storage filters/sort/view modes, docked panes, previews, and Canvas drag/drop.
- Side Palette divider resize, content-first type-aware Card/List Viewport, nested Outliner, Tag/Label indexes, item move/reorder, multi-selection, batch tags, guarded deletion, and type-preserving Canvas export.
- Preview service for rendered Markdown, images, and subgraph visualizations; every asset type opens a shared double-click detail/editor popup.
- Canvas Node and selected-text context-menu integration: `Collect to Mini Palette` or `Save directly to Side Palette — <Workspace>`. Vault File Explorer and active-file collection actions remain excluded because collection is Canvas-native.

## Architecture

```text
src/
├─ core/             data types, defaults/migration, IDs, store
├─ canvas/           guarded Canvas adapter + group serializer
├─ side-palette/     workspace management view
├─ mini-palette/     Canvas-hosted floating Collect and Storage UI
├─ search/           query logic
├─ preview/          Markdown, image, and subgraph previews
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

1. Canvas selection object shape on the installed Obsidian release.
2. Canvas screen-to-document coordinate conversion under pan/zoom.
3. Canvas automatic refresh after Vault JSON process writes.
4. Group hierarchy representation in Canvas documents produced by the installed version.
5. Floating host layering with third-party Canvas plugins.

## Safety and unresolved behavior

- Do not rename MD/image files when changing display titles.
- Do not add automatic bidirectional Card synchronization.
- Keep Collect and Storage separate, and keep Mini Palette Canvas-hosted rather than as a regular Obsidian tab.
- Keep the Storage panes docked, the grid responsive, and Light/Dark layouts geometrically identical.
- Do not define the More menu, final Copy semantics, filter composition, or final pane limits without user direction.
- Do not advance to `0.2.0` without explicit user instruction.

## Release checklist

Build, verify core flows, bump the next sequential `0.1.x` patch, update README and HANDOFF, commit, push, and create a GitHub release with `main.js`, `manifest.json`, and `styles.css` for BRAT.
