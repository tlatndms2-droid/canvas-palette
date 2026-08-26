import type { PaletteData } from "./types";

export const DEFAULT_DATA: PaletteData = {
  schemaVersion: 1,
  settings: { theme: "obsidian", cardSize: 220, fontSize: 14, columns: 4 },
  items: {},
  workspaces: {},
  collections: {},
  pendingItemIds: [],
  uiState: {
    activeWorkspaceId: null,
    selectedItemId: null,
    miniTab: "collect",
    leftPaneOpen: true,
    rightPaneOpen: true,
    leftPaneWidth: 240,
    rightPaneWidth: 300
  }
};

export function migrateData(raw: Partial<PaletteData> | null | undefined): PaletteData {
  if (!raw) return structuredClone(DEFAULT_DATA);
  return {
    ...structuredClone(DEFAULT_DATA),
    ...raw,
    settings: { ...DEFAULT_DATA.settings, ...raw.settings },
    uiState: { ...DEFAULT_DATA.uiState, ...raw.uiState },
    schemaVersion: 1
  };
}
