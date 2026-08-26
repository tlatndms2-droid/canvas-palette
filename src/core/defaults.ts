import type { PaletteData, SideLayoutState } from "./types";

export const DEFAULT_SIDE_LAYOUT: SideLayoutState = { viewportRatio: 0.52, topRatio: 0.69, indexRatio: 0.5, viewMode: "grid" };

export const DEFAULT_DATA: PaletteData = {
  schemaVersion: 3,
  settings: { theme: "obsidian", accentMode: "obsidian", accentColor: "#7c3aed", cardSize: 220, fontSize: 14, columns: 4 },
  items: {},
  workspaces: {},
  collections: {},
  pendingItemIds: [],
  uiState: { activeWorkspaceId: null, selectedItemId: null, sideSelectedItemIds: [], quickEditor: { x: null, y: null, width: null, height: null }, miniPalette: {
    tab: "collect", isOpen: false, position: { x: 24, y: 62 }, size: { width: 1120, height: 720 },
    leftPaneOpen: true, rightPaneOpen: true, leftPaneWidth: 248, rightPaneWidth: 310,
    viewMode: "grid", sort: "modified-desc", selectedItemIds: []
  } }
};

export function migrateData(raw: Partial<PaletteData> | null | undefined): PaletteData {
  if (!raw) return structuredClone(DEFAULT_DATA);
  const legacyUi = raw.uiState as Partial<PaletteData["uiState"]> & { miniTab?: "collect" | "storage"; leftPaneOpen?: boolean; rightPaneOpen?: boolean; leftPaneWidth?: number; rightPaneWidth?: number };
  const workspaces = Object.fromEntries(Object.entries(raw.workspaces ?? {}).map(([id, workspace]) => [id, {
    ...workspace,
    representativeCanvasPath: workspace.representativeCanvasPath ?? null,
    sideLayout: { ...DEFAULT_SIDE_LAYOUT, ...workspace.sideLayout }
  }]));
  return {
    ...structuredClone(DEFAULT_DATA),
    ...raw,
    settings: { ...DEFAULT_DATA.settings, ...raw.settings },
    schemaVersion: 3,
    items: Object.fromEntries(Object.entries(raw.items ?? {}).map(([id, item]) => [id, { ...item, canvasPlacements: item.canvasPlacements ?? [] }])),
    workspaces,
    collections: raw.collections ?? {},
    pendingItemIds: raw.pendingItemIds ?? [],
    uiState: {
      ...DEFAULT_DATA.uiState,
      ...legacyUi,
      sideSelectedItemIds: legacyUi.sideSelectedItemIds ?? [],
      quickEditor: { ...DEFAULT_DATA.uiState.quickEditor, ...legacyUi.quickEditor },
      miniPalette: {
      ...DEFAULT_DATA.uiState.miniPalette, ...legacyUi.miniPalette,
      tab: legacyUi.miniPalette?.tab ?? legacyUi.miniTab ?? DEFAULT_DATA.uiState.miniPalette.tab,
      leftPaneOpen: legacyUi.miniPalette?.leftPaneOpen ?? legacyUi.leftPaneOpen ?? DEFAULT_DATA.uiState.miniPalette.leftPaneOpen,
      rightPaneOpen: legacyUi.miniPalette?.rightPaneOpen ?? legacyUi.rightPaneOpen ?? DEFAULT_DATA.uiState.miniPalette.rightPaneOpen,
      leftPaneWidth: legacyUi.miniPalette?.leftPaneWidth ?? legacyUi.leftPaneWidth ?? DEFAULT_DATA.uiState.miniPalette.leftPaneWidth,
      rightPaneWidth: legacyUi.miniPalette?.rightPaneWidth ?? legacyUi.rightPaneWidth ?? DEFAULT_DATA.uiState.miniPalette.rightPaneWidth
      }
    }
  };
}
