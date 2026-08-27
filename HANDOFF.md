# Canvas Palette Handoff

## Current state

- Version: `0.2.17`.
- Repository: `https://github.com/tlatndms2-droid/canvas-palette` (public).
- Build stack: TypeScript + esbuild using the official Obsidian API package.
- Latest release: `0.2.17`, with BRAT assets `main.js`, `manifest.json`, and `styles.css`.
- Release URL: `https://github.com/tlatndms2-droid/canvas-palette/releases/tag/0.2.17`.
- Latest runtime change: `0.2.17`; Canvas Front/Back is opt-in per selected node from the native node toolbar instead of appearing on every Canvas node. Linked nodes expose the one-shot `Unlink from Palette` action in the same toolbar rather than a node context menu. Unlink preserves Front, Back, Metadata, enabled state, and current face while permanently detaching that node.
- Automated baseline: 10 Node tests (including Back synchronization, local face independence, preserved one-shot unlinking, search, Card link synchronization, reconciliation, viewport reorder, and media-preview CSS invariants), plus TypeScript no-emit, production bundling, and generated-bundle syntax validation.

## Start here on another PC

1. Clone `https://github.com/tlatndms2-droid/canvas-palette`, check out `main`, and confirm the working tree before making changes.
2. Read this entire file, then inspect the current source and the relevant portions of `Canvas Palette Codex 전체 개발 기획 v1.3`. Do not rely on an old release description when it conflicts with current source or a later user instruction.
3. Install dependencies with the package manager available on that PC and run the checks defined in `package.json`. Do not assume a globally installed Node executable; locate a usable runtime when necessary.
4. Locate a disposable `Obsidian Sandbox` vault and its `.obsidian/plugins/canvas-palette` directory before runtime testing. Never substitute the user's real Vault.
5. Treat the latest explicit user instruction as authoritative. This HANDOFF carries established defaults and decisions across machines, but a later explicit instruction from the user overrides it.

## Development operating instructions

### Authorization and scope

- When the user is demonstrating a problem, supplying images/video/text, or asking for a briefing, inspect and explain only. Do not modify code or publish a release until the user explicitly says to modify, implement, proceed, or update.
- After an explicit modification request, finish the requested scope rather than leaving knowingly incomplete behavior. Do not wait for a second release command: build, verify, bump the next sequential patch version, update project documentation, commit, push, and publish the BRAT release unless the user explicitly requests local-only work.
- Never advance to a new minor version such as `0.3.0` without explicit user permission.
- Do not expand the scope with unrelated UI redesigns, libraries, controls, buttons, or behaviors. Preserve working behavior outside the requested area and avoid touching excluded components.
- Existing user changes in a dirty worktree are not disposable. Inspect them, preserve unrelated edits, and do not use destructive Git commands to erase them.

### Investigation before implementation

- Read every supplied image, video, pasted requirement, and current code path relevant to the issue before editing. If evidence cannot be read reliably, say so; do not invent observations.
- Find the actual owning component, state owner, persistence path, event wiring, Canvas runtime adapter, DOM/CSS layout, and overflow/interaction boundary involved in the defect.
- Determine the real failure mechanism before choosing a fix. A visual divider, overlay, or cursor that merely looks functional is not a substitute for connected state and working interaction.
- Reuse the current architecture wherever practical. Palette views must mutate through `PaletteStore`, and Canvas JSON/runtime access must remain isolated in `CanvasAdapter` rather than being duplicated across UI components.
- Check for regressions in adjacent existing behavior whenever a shared path is changed. A focused fix must not silently break Card, Markdown, Image, Group, Mini Palette, Side Palette, metadata, drag/drop, or native editor behavior.

### Implementation quality

- Implement state, events, persistence, and cleanup as a complete behavior. Do not stop at CSS decoration or a mocked interaction.
- Preserve original Vault data. Palette display-title changes and Palette deletion must not rename, duplicate, or delete original Markdown/Image files or existing Canvas nodes.
- Keep current product decisions intact unless the user changes them explicitly: Collect and Storage remain separate, Mini Palette remains Canvas-hosted, Storage panes remain docked and responsive, and Light/Dark layouts retain the same geometry.
- Do not invent new behavior for the unresolved More menu or final pane limits. Copy/link identity and search composition are now decided below and must be preserved.
- Keep source text, JSON, and Korean content UTF-8 safe. Use literal paths for Windows paths containing spaces or Korean characters.

### Verification and Sandbox safety

- Runtime validation must use only a disposable `Obsidian Sandbox`, never the user's real Vault. Direct UI automation is allowed inside that Sandbox when needed to prove interaction.
- Use disposable Canvas files, Palette items, metadata, and workspaces for tests. Remove every fixture afterward and verify that no test files or records remain.
- Run the project's TypeScript no-emit check, production bundle, generated `main.js` syntax check, JSON validation, and available automated tests. A successful build alone is not proof of Obsidian runtime behavior.
- Install the freshly built `main.js`, `manifest.json`, and `styles.css` into the Sandbox plugin directory, reload the plugin, and verify the installed version.
- Exercise the exact affected interaction in the real Obsidian runtime, including persistence after plugin reload when state is involved. Check captured Obsidian errors after testing.
- Report only tests that were actually executed. Separate static checks, automated tests, and runtime/UI verification; explicitly identify anything that remains untested.

### Release and GitHub verification

- Keep `manifest.json`, `package.json`, `versions.json`, README, HANDOFF, Git tag, and GitHub Release version aligned.
- Publish from `main` as a public, non-draft, non-prerelease GitHub Release suitable for BRAT.
- Attach `main.js`, `manifest.json`, and `styles.css` as separate release assets. A zip is optional unless the user requests it.
- Verify local HEAD, remote `main`, and the release tag resolve to the same commit. Re-fetch the public release and confirm all required asset names.
- Do not report release completion from a locally created tag or draft page. The public release and downloadable assets must already exist.

### Completion report

- Lead with the outcome. State the actual root cause, changed files or subsystems, state/persistence location when relevant, and the precise behavior implemented.
- List the checks actually run and their results, including Sandbox runtime results and captured errors. Never claim an unexecuted test passed.
- Provide the released version, full commit SHA, public release URL, and BRAT asset status.
- If anything is blocked or unverified, say so directly instead of presenting the task as complete.

## Source plan and confirmed product direction

- The authoritative plan is `Canvas Palette Codex 전체 개발 기획 v1.3`, supplied as both Markdown and PDF. The PDF was rendered and its embedded UI references were visually inspected; implementation decisions must be checked against both the written behavior and the visual layouts.
- The product is Canvas-native. Collection entry points belong inside Canvas, not in the Vault File Explorer.
- Mini Palette is a floating Canvas overlay opened by hover. It is not a normal Obsidian tab, and its stored assets must be draggable directly back onto Canvas.
- A collected Canvas node or selected text must offer two routes: review through Mini Palette, or save directly to a selected Side Palette Workspace.
- Side Palette is the persistent Workspace/Collection manager. One Canvas can be associated with multiple Workspaces, and a Workspace can be associated with multiple Canvas files.
- Card, Markdown, Image, and Group are the four stored asset types. Text scraps and Side memos are Card variants, not additional asset types.
- Markdown and Image items retain references to their original Vault files. Changing a Palette display title must never rename or duplicate those files.
- Final Copy/link meaning: moving or dropping a Canvas Card/Markdown/Image through Mini Palette, Side Palette, another Workspace, or another Canvas does not create an independent copy. Every placement represents the same linked Palette Item. Card content and common metadata must propagate to all linked Card nodes; Markdown/Image retain one original Vault file reference; deleting or unlinking one placement must not silently delete the source file or unrelated placements.
- Search follows an Obsidian-like visible query model. Clicking a Tag/Label/type/linked-space filter writes a visible token into the Search field; deleting that text clears the filter. The parser supports implicit AND, explicit `OR`, parentheses, and facets such as `tag:`, `label:`, `type:`, and `space:` rather than hard-coded hidden Tag-OR/Label-AND rules.
- Theme choices are Follow Obsidian, Light, and Dark. Layout and component language remain consistent across themes, and Accent can use Obsidian's value or a user-selected custom color.
- The agreed delivery method is to let the user demonstrate the current build in Obsidian and report concrete failures for sequential patch releases.
- While the user is listing or demonstrating problems, only inspect, compare with the plan, and brief the findings. Once the user explicitly requests a modification, complete the next sequential patch build and BRAT release without requiring a separate release command, unless the user asks for local-only work.

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
- `0.1.11` replaces the corner-text metadata overlay with the user's reference-card format. File and image nodes receive a responsive title/Label header, inset native content area, individual Tag chips with a right-aligned date, and an external centered Caption. Text cards keep their native text as the visible content while using the same card chrome and footer; Group metadata uses translucent header/footer chrome so child nodes and edges remain visible. A `ResizeObserver` recalculates a clamped scale from the Canvas node's logical dimensions so type, spacing, chips, footer, shadow, radii, and Caption grow proportionally during resize.
- `0.1.12` aligns Canvas metadata cards with the approved single-surface reference: the native content is no longer wrapped by a second bordered panel, Caption is centered plain text outside the card, and each Label can store its own color. Label color is shared through Canvas collection into Side/Mini Palette items and is editable from Canvas, batch metadata, item details, and Mini Inspector.
  - Validation ran only in `Obsidian Sandbox`. A disposable Canvas covered 400×300 and 800×600 text cards, an image file node, and a Group. The two fixed sizes produced metadata scales 1.0 and 2.0, title sizes 17px and 34px, Label sizes 11px and 22px, and footer heights 52px and 104px. Live resize to 700×525 recalculated to 1.75. Native image content remained an image node, Group remained a Group, and clearing metadata restored the original node with no layer, inset, or scale variable. Sandbox fixtures were deleted afterward; the real Vault was not used for validation.
- `0.1.13` stops restyling Canvas nodes altogether. The plugin no longer changes the native node border, background, shadow, content inset, image radius, native label visibility, or Group chrome. It adds only pointer-transparent Label/Tag/date overlays on the existing card and keeps Caption as plain centered text below it; the original Canvas card remains the sole card surface.
- `0.1.14` replaces the Canvas `Palette metadata` modal's long color input with seven round default Label-color presets, a selected-state ring, and persistent user-added custom presets. Canvas Palette actions move out of the node context menu and into the native selected-node `.canvas-menu`: edit metadata, collect to Mini Palette, and save to Side Palette. The Side action preserves multi-Workspace routing through a destination menu.
  - Validation ran only in `Obsidian Sandbox`. A disposable two-node Canvas verified three toolbar buttons for a single selection, no duplicates after repeated refresh/native menu render, Node-target updates after selection changes, complete removal after deselection, and all three button callbacks. The preset modal exposed exactly seven defaults plus the custom-color button; default and custom selection rings, custom-preset persistence across plugin reload, saved Label color, and two-Workspace destination routing were verified. Disposable Canvas data and metadata were removed afterward.
- `0.1.15` makes existing Canvas metadata directly editable in place. Double-clicking a visible Label, individual Tag, or Caption replaces only that value with a small inline input at the same position. Enter or focus loss saves to the same Canvas-path/Node-ID metadata record, Escape cancels, an empty value removes that field (or Tag), and the automatic modification date remains read-only. Canvas selection, dragging, native content, and card styling remain unchanged outside the clicked metadata value.
  - Validation ran only in `Obsidian Sandbox`. A disposable text-node Canvas verified Label Enter-save with Label-color preservation, individual Tag deletion by empty blur-save, Caption Escape-cancel and blur-save, edit survival during metadata refresh, pointer-event isolation from the native node, reload persistence, a read-only date, unchanged native node data, single-overlay rendering, and an empty captured error log. The disposable Canvas and metadata were removed afterward.
- `0.1.16` keeps all three Canvas Palette toolbar actions visible when multiple Canvas nodes are selected. Edit Palette Metadata opens once and applies the saved Tags, Label, Label color, and Caption to every selected node; Collect to Mini Palette and Save directly to Side Palette use the existing complete-selection collection path, preserving the existing multi-node Group snapshot behavior.
  - Validation ran only in `Obsidian Sandbox`. A disposable two-node/one-edge Canvas verified three toolbar actions for one and two selected nodes, stable selection keys, no duplicate buttons after repeated refresh, removal after deselection, one metadata save applied identically to both nodes, and both Mini and Side collection producing a two-node/one-edge Group. The error log was empty and all disposable metadata, Palette Items, and Canvas data were removed afterward.
- `0.1.17` corrects multi-selection classification. Selecting multiple ordinary Canvas nodes now creates one Palette Item per selected node in its original Card/Markdown/Image type. A Group Palette Item is created only for an explicitly selected Canvas Group, and selecting the Group boundary alone automatically captures its contained nodes, nested Groups, and internal edges. Nodes already contained by a selected Group are not duplicated as separate Items.
  - Validation ran only in `Obsidian Sandbox`. Two selected ordinary text nodes produced two separate Card Items through the real toolbar. Selecting only a Group boundary produced one Group containing its five total nodes, nested Group, and two internal edges while excluding two external/crossing edges. Selecting that Group together with an outside Card and an explicitly selected contained Card produced one Group plus one outside Card without duplicating the contained Card. The error log was empty and all disposable Palette Items and Canvas data were removed afterward.
- `0.1.18` keeps a collected Palette Item linked to its original Canvas node using the stored Canvas path and Node ID. Original Canvas Card content and collected Card content synchronize in both directions; Tags, Label, Label color, and Caption share the same node metadata in both directions. The linked-Canvas row and a `Locate on Canvas` context action open the source Canvas, select the original node, and zoom it into view. Group snapshots refresh when their original Canvas changes, while Markdown and Image Items continue to reference their original files.
  - Validation ran only in `Obsidian Sandbox`. A disposable Canvas verified preserved Canvas path/Node ID, open-Canvas and closed-file Palette→Canvas Card updates, Canvas→Palette Card title/content updates, Group-child snapshot refresh, metadata synchronization in both directions, plugin-reload persistence, and actual linked-row click selection of the original node. The captured error log was empty and the disposable files and Palette data were removed afterward.
- `0.1.19` consolidates the user's cross-machine development rules in this HANDOFF: authorization boundaries, investigation-first implementation, scope control, architecture preservation, Sandbox-only runtime testing, honest test reporting, cleanup, sequential `0.1.x` release policy, BRAT asset/SHA verification, and completion-report requirements. It also removes the obsolete pre-`0.1.18` prohibition on bidirectional Card synchronization. No plugin runtime behavior changes in this release.
  - Documentation-release validation covered TypeScript no-emit, production bundling, generated-bundle syntax, JSON parsing, and installation/reload as version `0.1.19` in `Obsidian Sandbox`. The plugin loaded successfully and the captured error log was empty. Feature-level runtime regressions were not re-run because no runtime source changed.
- `0.1.20` extends linked Card identity from the original Canvas node to every Canvas placement created by Palette drag-and-drop. A placement now receives the Item's metadata immediately, participates in Palette-to-Canvas and Canvas-to-Palette content synchronization, and propagates Tags, Label, Label color, and Caption to the original and every other linked Card. Markdown/Image file-reference behavior and Group snapshot behavior remain unchanged.
  - Validation ran only in an isolated `Obsidian Sandbox`. A real DOM drag-and-drop from Side Palette created a second linked text node and persisted its Canvas path/Node ID. Editing the dropped node updated the Palette Item and original node; editing the Palette updated both Canvas nodes; editing metadata on the dropped node updated the Item, both metadata records, and both Canvas overlays. All content, placements, metadata, and overlays survived an Obsidian restart. The captured error log was empty and disposable fixtures were removed afterward.
- `0.2.0` prevents Side Palette selection from resetting or visibly shifting its scrollable panels. Full view rebuilds capture and restore the Viewport, Outliner, Tag Index, and Label Index scroll offsets for the current Workspace. The selection count and Delete action use an always-reserved status slot so the item grid keeps the same vertical origin before and after selection, and the batch `Edit metadata` action is removed from that slot.
  - Validation ran only in an isolated `Obsidian Sandbox` with 36 disposable Card fixtures. After setting Viewport, Outliner, and Tag Index offsets to 620, 430, and 65 pixels, real DOM single selection, Ctrl multi-selection, and Outliner selection all preserved those exact offsets. The status slot remained 43 pixels before and after selection, `Selected 1/2`, Delete, and Card check markers updated correctly, batch `Edit metadata` was absent, and the captured error log was empty. All disposable Items, selections, collections, pending data, plugin data, and the Sandbox vault were removed afterward.
- `0.2.1` restores the visible `Selected <count>` text in the fixed Side Palette status slot. The slot no longer receives the global `is-active` class, which had applied the solid Accent background intended for active buttons and made the Accent-colored count text disappear against it. Scroll preservation, fixed slot height, Delete, and selection markers remain unchanged.
  - Validation ran only in an isolated `Obsidian Sandbox` with 20 disposable Card fixtures. In both Light and Dark plugin themes, the count used the same computed foreground color as the panel text, remained visibly sized, and sat on the intended 14% Accent tint instead of a solid Accent fill. The selected state kept a 43-pixel slot, Delete remained visible, batch `Edit metadata` remained absent, and a 420-pixel then 310-pixel Viewport offset survived selection and theme rerenders exactly. The captured error log was empty and all fixtures and the Sandbox vault were removed afterward.
- `0.2.2` adopts Windows File Explorer selection behavior in the Side Palette Viewport. Plain click selects one Card, Ctrl/Cmd-click toggles individual Cards, Shift-click selects the visible range from the anchor, blank-space click clears selection, and a pointer drag beginning only on blank grid space draws a live selection rectangle; Ctrl/Cmd-drag adds its hits to the existing selection. Single selection uses border emphasis without a check marker, while multi-selection shows markers on every selected Card and matching Outliner rows. Card-origin drag continues to use the existing Canvas payload path. Grid Caption layout now reserves 24 pixels below the Card and centers the Caption there instead of collapsing that space with a negative margin.
  - Validation ran only in an isolated `Obsidian Sandbox` with 16 disposable captioned Card fixtures. Real click events produced one selected Card with zero markers, Ctrl-click produced two Cards with two markers, Shift-click selected the four-Card visible range from the Ctrl-updated anchor, and blank-grid click cleared all selection while the 380-pixel Viewport offset remained exact. A real pointer sequence showed a visible selection rectangle and three live-highlighted Cards before pointer-up; release persisted those three, and Ctrl-pointer-drag added two more. Outliner check counts matched multi-selection. Caption and Card centers were identical, the Card reserved a 24-pixel bottom margin, and the rendered Caption ended 13 pixels before the next Card. A real Card dragstart still wrote the Card ID/type Palette payload and did not invoke marquee selection. The captured error log was empty and all fixtures and the Sandbox vault were removed afterward.
- `0.2.3` repairs Viewport controls: Grid/List and View settings interactions work again, selection status no longer overlaps View settings, and the settings panel only collapses from its own toggle.
- `0.2.4` replaces hidden Tag/Label filtering with an Obsidian-like query parser and visible Search tokens. It supports `tag:`, `label:`, implicit AND, `OR`, and parentheses; index-chip state is derived from the visible query.
- `0.2.5` removes Card-width adjustment, keeps width responsive, extends Card-height and preview-font settings to both Grid and List, and allows a smaller height range.
- `0.2.6` adds Viewport type toggles (`All`, `Image`, `MD`, `Card`, `Group`), `type:` and `space:` search facets, and a responsive Linked spaces dialog. Lower preview font sizes render a larger source slice for unselected thumbnails.
- `0.2.7` reconciles stored Canvas links against current Canvas documents, removes stale placement records, promotes a surviving placement when the origin disappears, and adds guarded per-space Unlink. Unlink removes only that Canvas relationship/nodes; it does not delete the Palette Item, Vault source, or other placements.
- `0.2.8` introduces the visible Viewport reorder insertion marker and restricts Card/Markdown internal wheel scrolling to selected items. Unselected thumbnails leave wheel events to the Viewport.
- `0.2.9` stabilizes selection, scrolling, and reorder: blank Viewport clicks clear selection, drag measurements are cached, the insertion indicator is a fixed overlay rather than an in-flow element, and selected text previews alone consume internal scrolling.
- `0.2.10` compacts Card/Markdown thumbnail typography (paragraph, heading, list, quote, table, and code-block spacing) in Grid/List only. It does not change source documents, editors, or large previews.
- `0.2.11` fixes the real full-body limitation. A selected Card/Markdown renders the complete source instead of the compact character slice, and vertical pointer dragging or the wheel browses its internal body. Body panning temporarily disables native Card drag so it does not reorder or drop the Card accidentally.
- `0.2.12` constrains embedded images in Card/Markdown thumbnails to the available Card width/height, preserves aspect ratio, and centers them instead of cropping or stretching.
- `0.2.13` applies the same containment intent to embedded `iframe`/`video` content using a centered 16:9 frame bounded by the configured Card height. Automated checks passed, but the user's exact Obsidian embed/theme combination still needs visual confirmation.
- `0.2.14` updates this cross-PC handoff and README/version metadata only. It introduces no runtime behavior change.
- `0.2.15` fixes the remaining embedded-video clipping. The affected video was rendered by an MX-style `.mx-video-view` Shadow DOM player rather than a direct `iframe`/`video`, so the `0.2.13` child-element rule never constrained its 400-pixel minimum width inside a 306-pixel Card body. Canvas Palette now removes that minimum width, fits the player host and its Shadow DOM mount to the real Card width as a complete 16:9 block, and adds media-block scroll snapping for selected Card/Markdown previews.
  - Direct read-only DOM inspection of the user's demonstrated view measured the player at `400×225` inside a `306×220` body before the rule. A temporary non-persistent style application measured it at approximately `306×172` afterward and showed the complete player frame inside the Card. No Vault files or Palette records were changed. An isolated Sandbox Vault was not available, so installation/reload validation of the packaged build was not performed in this task.
- `0.2.16` adds persisted Front/Back content across Palette Items and linked Canvas placements, native Live Preview Back editing, location-local current-face state, and one-shot unlink preservation.
- `0.2.17` makes Canvas Front/Back explicitly opt-in per node. Selecting one Canvas node shows `Enable Front / Back` in the native node toolbar; only after activation does that node receive its small flip control. A linked node shows `Unlink from Palette` in the same toolbar, and the old node context-menu interception is removed. Existing nodes with actual Back content or a saved Back face migrate as enabled, while ordinary nodes remain unchanged.

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

- Schema version 6 migration, pre-collection Canvas-node metadata, custom Label-color presets, Workspace Canvas association, per-item Canvas placement history, per-workspace Side layout, Mini Palette geometry, themes, and custom Accent persistence.
- Canvas Adapter for guarded active Canvas selection, Canvas JSON capture, file/text/group creation, Group ID remapping, and Collection mind-map export.
- Floating Canvas-hosted Mini Palette with hover trigger, window move/resize, Collect Inspector, Storage filters/sort/view modes, docked panes, previews, and Canvas drag/drop.
- Side Palette three-way independent divider resize, per-Pane scrolling, content-first type-aware Grid/List Viewport, nested Outliner, searchable Tag/Label indexes, type/linked-space filters, item move/reorder, Windows-style multi-selection, guarded deletion/unlinking, and type-preserving Canvas export.
- Preview service for rendered Card/Markdown content, contained images/videos, and subgraph visualizations. Selected Card/Markdown thumbnails render and browse their complete source; unselected thumbnails remain compact. Side Palette Card/Markdown double-click uses the native Quick Editor, while Image/Group opens the large preview and Image supports wheel zoom.
- Canvas Node and selected-text context-menu integration: `Collect to Mini Palette` or `Save directly to Side Palette — <Workspace>`. Vault File Explorer and active-file collection actions remain excluded because collection is Canvas-native.
- Canvas Node metadata integration: `Edit Palette Metadata` stores values under Canvas path and Node ID, decorates the runtime node without changing Canvas JSON/content, and synchronizes Tags, Label, Label color, and Caption across the shared Palette Item and all linked Canvas nodes. Linked Card content also synchronizes across the Palette Item, its origin, and every recorded placement.

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

## Broader regression checks still worth repeating

Focused release checks are recorded above, but a future change touching shared interaction paths should repeat the relevant broader regressions below. Do not describe them as passed unless they were executed for that change:

1. Selected text inside a Canvas card shows both Canvas Palette collection routes.
2. Side cards update their linked-Canvas label immediately after a successful export.
3. Ctrl/Cmd multi-selection, selection markers, batch tags, guarded delete, and native Quick Editor double-click all behave correctly without click/double-click conflicts.
4. Floating Mini Palette layering, hover opening, drag, resize, and drop interception remain compatible with third-party Canvas plugins.

## Safety and unresolved behavior

- Do not rename MD/image files when changing display titles.
- Preserve shared identity. A Palette Item and all of its Canvas/Workspace placements are linked views of the same asset, not independent copies. Card content/common metadata synchronization has automated coverage; do not regress it while changing drag/drop, deletion, or Workspace organization.
- Palette deletion and Canvas unlink/delete semantics still need a final user-approved popup flow. The desired direction is explicit choice when deleting a linked Canvas Card (remove only this placement versus also remove linked Palette/Canvas placements). Palette-side deletion must not delete the original Vault file. Do not silently guess destructive scope.
- The `0.2.15` MX-style Shadow DOM player fix was measured with a temporary non-persistent rule in the user's demonstrated view, but the packaged build was not installed into an isolated Sandbox because no Sandbox Vault was available. A future shared-media change should repeat Grid/List checks at Card heights 32-220px for standard iframe/video embeds, local videos, and `.mx-video-view` players.
- Mini Palette link/content/metadata consistency should be rechecked before declaring synchronization complete; the user previously reported that Palette-to-Canvas drag could lose metadata or shared content.
- Keep Collect and Storage separate, and keep Mini Palette Canvas-hosted rather than as a regular Obsidian tab.
- Keep the Storage panes docked, the grid responsive, and Light/Dark layouts geometrically identical.
- Do not define the More menu or final pane limits without user direction. Copy/link and search semantics are already fixed above.
- Do not advance to `0.3.0` without explicit user instruction.

## Release checklist

Use the complete release and GitHub verification rules in `Development operating instructions`. The short form is: build, Sandbox-test the affected paths when possible, bump the next sequential patch version unless the user requested a minor bump, update README/HANDOFF, commit, push, publish `main.js`, `manifest.json`, and `styles.css`, and verify the public release and matching Git refs. The user explicitly requires a release after every implemented modification.
