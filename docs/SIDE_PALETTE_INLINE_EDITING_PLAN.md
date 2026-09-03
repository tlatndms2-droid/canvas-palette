# Side Palette inline editing and Explorer Canvas opening

> Status: approved product plan; not implemented. This document is the detailed companion to `HANDOFF.md` for continuing on another PC.

## Goal

Make Side Palette editing immediate without changing canonical identity:

- A new Memo asks only for its display title in the new card header.
- Existing Card and Markdown Items can edit their display title in the card header.
- Card and Markdown bodies can be edited in-place inside the card using Obsidian's native Markdown editor.
- Existing full-editor double-click behavior remains available.
- Workspace Explorer provides an explicit way to open its listed Canvas files.

This plan does not change Item IDs, Canvas placements, Workspace/Collection membership, file paths, or file names. It has no schema migration, version bump, release, or commit requirement beyond the documentation commits that record this plan.

## Confirmed interaction contract

### New Memo

```text
+ Memo
  -> create and import a normal Card draft
  -> reveal the new card in the Viewport
  -> focus its header title input only
  -> do not open the body editor
```

- The initial title is `New memo`.
- `Enter` or focus leaving the title input saves the entered display title.
- `Escape` restores the title that existed when editing began. A new Memo therefore keeps `New memo` and remains as a draft.
- The user opens body editing only through the body-edit control.

### Header controls

Card and Markdown cards use two clearly separate editing affordances:

| Control | Placement and label | Effect |
| --- | --- | --- |
| Title pencil | adjacent to the title | Turns only the title text into an in-card input. |
| Body pencil | header action area, tooltip `본문 편집` | Replaces only the body preview with the native Markdown editor. |

The controls must have accessible labels and stop pointer, click, and double-click propagation. This prevents controls from selecting, dragging, or opening the whole card.

### Title editing

- Applies to new Memo drafts and existing Card/Markdown Items.
- Updates `PaletteItem.displayTitle` only.
- Never renames a Markdown source file, changes `origin.filePath`, alters a linked Canvas node, or moves the Item.
- `Enter` and blur save; `Escape` discards the current input and restores the previous display title.
- Image, Group, and Link are out of scope for this inline-title UI. Their current edit paths stay unchanged.

### Body editing

- Applies only to Card and Markdown.
- Reuse `NativeMarkdownEditor`; do not introduce a textarea or a second editor engine.
- Card body: read/write `item.content` through `PaletteStore.updateItem`.
- Markdown body: resolve the linked `TFile`, mount it in source mode, and save its real `.md` file through the native editor. If the source is unavailable, keep the current missing-source Notice and do not enter editing state.
- The editor occupies the existing card body footprint. The card does not become a floating editor or a new modal; the body scrolls when content exceeds the editing area.
- While active, card dragging is disabled. Only one Side Palette in-card body editor can be open; opening another saves and closes the current one.
- Clicking outside the active card or pressing `Escape` saves and closes the editor. `Ctrl/Cmd+S` saves but leaves the editor open.
- The in-card editor consumes pointer, click, double-click, and keydown events. Its interactions must never reach the card-level handlers.

### Double-click and selection

- A card double-click outside inputs, header controls, and an active in-card editor retains the existing full native Quick Editor route.
- A normal click on a non-editing card retains current selection/reveal behavior.
- Starting body editing from its dedicated header control must not require a first selection click.
- Existing Back-face inline editing remains unchanged; the new front/body editor must not create two simultaneous editors.

### Workspace Explorer Canvas opening

- Scope stays exactly as today: only Canvas paths that own at least one Canvas Workspace appear as Canvas-folder rows.
- Split the Canvas-folder header into:
  - a left `› / ⌄` button that only expands/collapses that Canvas's Workspace rows;
  - the existing folder name and Item count;
  - a right-side `Canvas 열기 ↗` button that opens the actual `.canvas` in an Obsidian tab.
- Do not convert a folder-row click into Canvas opening.
- Workspace-row click, multi-selection, drag/drop, context menu, and Workspace-row double-click retain their current behavior.

## Implementation map

| Area | Required change |
| --- | --- |
| `src/main.ts` | Keep `createMemo()` as creation/import/selection; expose a Side-view signal or state so the newly created ID immediately begins title editing. Do not open a body editor. |
| `src/side-palette/side-palette-view.ts` | Own title-edit state and one active front/body editor. Reuse the lifecycle pattern of `activeBackEditor` / `openInlineBackEditor()`, while preserving scroll memory, selection, reorder, and Back-face editing. |
| `src/ui/render.ts` | Add optional Side-only title/body edit callbacks and header controls. Protect all controls and inputs from shared card click/double-click/drag handling. Mini Palette receives no new controls. |
| `src/editor/native-markdown-editor.ts` | Reuse existing Card and file targets. Keep Card persistence in the store and Markdown persistence in the real file. |
| `src/ui/workspace-explorer-modal.ts` | Make the expansion arrow independent from the new Canvas-open action, using the existing Obsidian tab-opening route. |
| `styles.css` | Add compact styles for title input, two distinct header controls, in-card editing body, internal body scroll, and disabled drag appearance. Preserve the current card surface and responsive layout. |

## Acceptance checks

### Focused automated tests

- New Memo becomes a persistent draft, starts title editing, saves on Enter/blur, and returns to `New memo` on Escape.
- Existing Card and Markdown title edits change only `displayTitle`.
- Card body saves through the store; Markdown body resolves and saves the linked file; missing Markdown refuses editing safely.
- One active editor invariant, outside-click save, Escape save, Ctrl/Cmd+S save-without-close, and drag suppression.
- Card double-click opens the existing full editor outside protected controls; title/body controls and active editor never invoke it.
- Explorer arrow changes only expansion; `Canvas 열기 ↗` opens the intended Canvas; Workspace-row double-click behavior remains unchanged.

### Before completion

Run focused tests, the full test suite, TypeScript no-emit, production build, and `git diff --check`.

If live validation is requested, use only the isolated Sandbox. Back up and restore `data.json`, a Markdown fixture, an affected Canvas fixture, and `.obsidian/workspace.json`; verify Card body save, Markdown file save, title editing, protected double-click, Explorer Canvas opening, reload persistence, and final hashes.

## Resume checklist

1. Pull GitHub `main` and read this file plus the matching section in `HANDOFF.md`.
2. Inspect `git status`; do not reset or absorb unrelated local changes.
3. Check the actual current source before applying this plan, especially the Side Palette's existing Back editor and shared card renderer.
4. Implement the shared callbacks/editor lifecycle before wiring the UI controls.
5. Do not claim Sandbox validation, release, version bump, commit, or push for product code unless it was actually requested and completed.
