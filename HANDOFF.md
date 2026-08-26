# Canvas Palette Handoff

## Current state

- Version: `0.1.0`
- Repository: `https://github.com/tlatndms2-droid/canvas-palette` (public).
- Build stack: TypeScript + esbuild using the official Obsidian API package.
- Release: `0.1.0`, with BRAT assets `main.js`, `manifest.json`, and `styles.css`.

## Implemented

- Schema-versioned plugin data and default migration merge.
- `PaletteStore` with debounced persistence and workspace, collection, pending import, and deletion operations.
- `SearchService` separated from view rendering.
- Relative-layout group serialization/restoration with internal edge mapping.
- Side Palette and Mini Palette ItemViews.
- Commands and file-menu action for editor text, Markdown, and image collection.
- Settings tab and type-specific UI styling.

## Architecture

```text
src/
├─ core/             data types, defaults/migration, IDs, store
├─ canvas/           pure group serializer; runtime adapter pending
├─ side-palette/     workspace management view
├─ mini-palette/     collect and storage views
├─ search/           query logic
├─ settings/         plugin settings UI
└─ ui/               shared rendering primitives
```

Views mutate data through `PaletteStore`; search logic stays in `SearchService`. Future Canvas-runtime calls belong behind a `CanvasAdapter`, not directly inside either view. Group capture and restore should continue to pass through the serializer.

## Important data model

- `PaletteItem`: common metadata plus optional content/group snapshot.
- `origin`: optional Canvas path/node, workspace, and Vault file path.
- `PaletteWorkspace`: Canvas associations, representative Canvas paths, root collections, and loose items.
- `Collection`: virtual nested folder; it must never create Vault folders.
- `pendingItemIds`: reviewed in Mini Palette Collect before workspace import.

## Known gaps / next candidates

1. Implement a guarded Canvas adapter and fixture-based tests.
2. Capture Canvas Card/MD/Image/Group selection into pending items.
3. Restore items/groups and export collection trees into Canvas JSON.
4. Add editable collection/item inspector and robust multi-select.
5. Implement docked divider resize and persisted pane/workspace layout.
6. Add real Markdown, image, and subgraph previews.
7. Add regression coverage and release automation.

## Safety and unresolved behavior

- Do not rename MD/image files when changing display titles.
- Do not add automatic bidirectional Card synchronization.
- Keep Collect and Storage separate.
- Keep the Storage panes docked and the grid responsive.
- Do not define the More menu, Copy semantics, filter composition, or final pane limits without user direction.
- Do not advance to `0.2.0` without explicit user instruction.

## Release checklist

Build, verify core flows, bump the next sequential `0.1.x` patch, update README and HANDOFF, commit, push, and create a GitHub release with `main.js`, `manifest.json`, and `styles.css` for BRAT.
