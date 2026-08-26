# Test plan

## Automated

- TypeScript compile and production bundle.
- Data migration retains defaults and user data.
- Search covers title, content, caption, tag, and label.
- Group normalization preserves relative positions, hierarchy references, and internal edges.
- Group restore remaps every node and edge ID.

## Manual in Obsidian

- Enable and disable without console errors.
- Open a Canvas; verify the hover trigger mounts, Mini Palette opens, moves, resizes, and closes without affecting Canvas editing.
- Collect a Canvas text node, MD node, image node, and Group; inspect, import, drag each to another Canvas, and confirm file references and Group edges/layout.
- Export a nested Collection to Canvas and verify the tree edge directions.
- Create workspaces, collections, and memos; test reorder/move to collection and representative Workspace switching.
- Verify Light, Dark, Follow Obsidian, Obsidian accent, and custom accent without layout changes.
- Verify deletion cannot modify source Vault files.
