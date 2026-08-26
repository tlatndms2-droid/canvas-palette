# Test plan

## Automated

- TypeScript compile and production bundle.
- Data migration retains defaults and user data.
- Search covers title, content, caption, tag, and label.
- Group normalization preserves relative positions and internal edges.
- Group restore remaps every node and edge ID.

## Manual in Obsidian

- Enable and disable without console errors.
- Open both views and confirm persistence after reload.
- Collect text, Markdown, and image files, then import them into a workspace.
- Create workspaces, collections, and memos.
- Verify light/dark/Obsidian themes and narrow-pane reflow.
- Verify deletion cannot modify source Vault files.
