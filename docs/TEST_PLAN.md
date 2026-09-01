# Test plan

## Automated

- TypeScript compile and production bundle.
- Data migration retains defaults and user data.
- Search covers title, content, caption, tag, and label.
- Group normalization preserves relative positions, hierarchy references, and internal edges.
- Group restore remaps every node and edge ID.
- Export materialization preserves canonical Mini IDs, restores Card/MD/Image/Group types, and reports skipped missing sources once per batch.
- Group snapshot migration preserves legacy `nodeBacks` and per-node metadata when remapping Nodes and Edges.
- Export Bundle creation keeps the Canvas and Palette Store unchanged until the final placement commit; no Export path creates a new `.canvas` file.
- Workspace and Collection subtree bundles preserve Outliner order, item child hierarchy, and right-to-left hierarchy edges.

## Manual in Obsidian

- Enable and disable without console errors.
- Open a Canvas; verify the hover trigger mounts, Mini Palette opens, moves, resizes, and closes without affecting Canvas editing.
- Collect a Canvas text node, MD node, image node, and Group; inspect, import, drag each to another Canvas, and confirm file references and Group edges/layout.
- Right-click each Canvas Node type and verify the Canvas Palette menu has both Mini Palette and direct Side Palette Workspace destinations, with no equivalent File Explorer collection action.
- Every Item, Collection, and Workspace Export opens an existing-Canvas picker (active Canvas selected by default), then shows a non-mutating placement preview. Verify `Escape`, target-tab change, and plugin unload remove only the preview.
- Place Item, nested Collection, and Workspace bundles at a chosen empty Canvas position. Verify an overlapping bundle shows the warning preview and cannot insert, and confirm no new `.canvas` file is created.
- Export a duplicate bundle and verify `Replace existing`, `Keep existing and add`, and `Cancel` each affect the linked placement only as labelled.
- From Side, use `Export to Mini Palette`; verify a second export leaves one Mini Storage link and retains the original Workspace and metadata.
- In Mini Storage, use both the context-menu `Export to Canvas` action and `Place on Canvas`. Check Card text, MD/Image file references without Vault copies, missing MD Card fallback, and missing Image skip.
- Export a Group with nested groups; verify relative placement, valid parent links, internal Edge directions, and each nested node's tags, label, caption, Front/Back metadata.
- Right-click a Collection to export only its subtree; use the Header Export for the whole Workspace. Verify item child edges and no overlap around large Groups.
- Create workspaces, collections, and memos; test reorder/move to collection and representative Workspace switching.
- Verify Light, Dark, Follow Obsidian, Obsidian accent, and custom accent without layout changes.
- Verify deletion cannot modify source Vault files.
