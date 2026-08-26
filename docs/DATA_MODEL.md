# Data model

`PaletteData` is the persisted root and includes `schemaVersion`, settings, items, workspaces, collections, pending IDs, and UI state. Markdown and image items store Vault paths rather than copies. A group stores normalized node positions and only edges whose endpoints are both inside the captured set.
