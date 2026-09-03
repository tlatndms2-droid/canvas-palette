import type { PaletteData, SideLayoutState } from "./types";
import { ASSET_DENSITY_DEFAULT, legacyDensity } from "../ui/asset-density";

export const DEFAULT_SIDE_LAYOUT: SideLayoutState = {
  viewportRatio: 0.52, topRatio: 0.69, indexRatio: 0.5, viewMode: "grid", densityLevel: ASSET_DENSITY_DEFAULT,
  responsiveTab: "viewport",
  selectedCollectionId: null, focusedCollectionId: null, collapsedCollectionIds: [], collapsedItemIds: [],
  outlinerItemHeight: 30, outlinerFontSize: 13, outlinerIncludeDescendants: true, outlinerWrapTitles: false
};

export const DEFAULT_DATA: PaletteData = {
  schemaVersion: 24,
  settings: { theme: "obsidian", accentMode: "obsidian", accentColor: "#7c3aed", labelColorPresets: [], cardHeight: 220, fontSize: 14, columns: 4 },
  items: {},
  workspaces: {},
  collections: {},
  pendingItemIds: [],
  canvasNodeMetadata: {},
  uiState: { activeWorkspaceId: null, lastCanvasPath: null, selectedItemId: null, sideSelectedItemIds: [], sideItemFaces: {}, miniItemFaces: {}, quickEditor: { x: null, y: null, width: null, height: null }, workspaceExplorer: { viewMode: "details", sort: "modified-desc" }, pendingCanvasWorkspaceCleanup: [], miniPalette: {
    tab: "collect", storageItemIds: [], isOpen: false, position: { x: 24, y: 62 }, size: { width: 1120, height: 720 },
    leftPaneOpen: true, rightPaneOpen: true, leftPaneWidth: 248, rightPaneWidth: 310,
    viewMode: "grid", densityLevel: ASSET_DENSITY_DEFAULT, cardHeight: 220, sort: "modified-desc",
    collectSelectedItemIds: [], collectSelectionAnchorId: null, storageSelectedItemIds: [], storageSelectionAnchorId: null, focusedItemId: null, selectedItemIds: []
  } }
};

export function migrateData(raw: Partial<PaletteData> | null | undefined): PaletteData {
  if (!raw) return structuredClone(DEFAULT_DATA);
  const rawSettings = raw.settings as (Partial<PaletteData["settings"]> & { cardSize?: number }) | undefined;
  const { cardSize: _legacyCardSize, ...migratedSettings } = rawSettings ?? {};
  const legacyUi = (raw.uiState ?? {}) as Partial<PaletteData["uiState"]> & { miniTab?: "collect" | "storage"; leftPaneOpen?: boolean; rightPaneOpen?: boolean; leftPaneWidth?: number; rightPaneWidth?: number };
  const migratedAt = Date.now();
  const workspaces = Object.fromEntries(Object.entries(raw.workspaces ?? {}).map(([id, workspace]) => [id, {
    ...workspace,
    kind: workspace.kind ?? "general",
    ownerCanvasPath: workspace.ownerCanvasPath ?? null,
    representativeCanvasPath: workspace.representativeCanvasPath ?? null,
    sideLayout: { ...DEFAULT_SIDE_LAYOUT, ...workspace.sideLayout, densityLevel: workspace.sideLayout?.densityLevel ?? legacyDensity(workspace.sideLayout?.viewMode, rawSettings?.cardHeight) },
    createdAt: workspace.createdAt ?? migratedAt,
    modifiedAt: workspace.modifiedAt ?? workspace.createdAt ?? migratedAt
  }]));
  const { storageWorkspaceFilter: _legacyStorageWorkspaceFilter, hiddenStorageItemIds: _legacyHiddenStorageItemIds, ...legacyMiniPalette } = (legacyUi.miniPalette ?? {}) as Partial<PaletteData["uiState"]["miniPalette"]> & { storageWorkspaceFilter?: string | null; hiddenStorageItemIds?: string[] };
  return {
    ...structuredClone(DEFAULT_DATA),
    ...raw,
    settings: { ...DEFAULT_DATA.settings, ...migratedSettings, labelColorPresets: [...new Set(rawSettings?.labelColorPresets ?? [])] },
    schemaVersion: 24,
    items: Object.fromEntries(Object.entries(raw.items ?? {}).map(([id, item]) => {
      const repairedType = item.type === "markdown" && !item.origin?.filePath ? "card" : item.type;
      const supportsFaces = repairedType !== "group" && repairedType !== "link";
      const group = repairedType === "group" && item.group ? {
        ...item.group,
        nodeBacks: item.group.nodeBacks ?? {},
        nodeMetadata: item.group.nodeMetadata ?? Object.fromEntries(Object.entries(item.group.nodeBacks ?? {}).map(([nodeId, backContent]) => [nodeId, { tags: [], label: "", labelColor: "", caption: "", backContent, currentFace: "front", facesEnabled: true, modifiedAt: item.modifiedAt ?? migratedAt }]))
      } : item.group;
      const rawLink = item.webLink;
      const webLink = repairedType === "link" && rawLink?.url ? { url: rawLink.url, siteName: rawLink.siteName ?? "", description: rawLink.description ?? "", thumbnailUrl: rawLink.thumbnailUrl ?? "", width: rawLink.width ?? 280, height: rawLink.height ?? 180, color: rawLink.color, capturedAt: rawLink.capturedAt ?? item.createdAt ?? migratedAt } : undefined;
      return [id, { ...item, group, type: repairedType, webLink, sourceDeletedAt: repairedType === "markdown" ? item.sourceDeletedAt : undefined, backContent: supportsFaces ? item.backContent ?? "" : "", facesEnabled: supportsFaces && (item.facesEnabled ?? Boolean(item.backContent)), labelColor: item.labelColor ?? "", canvasPlacements: item.canvasPlacements ?? [], parentItemId: item.parentItemId ?? null, childItemIds: item.childItemIds ?? [] }];
    })),
    workspaces,
    collections: raw.collections ?? {},
    pendingItemIds: raw.pendingItemIds ?? [],
    canvasNodeMetadata: Object.fromEntries(Object.entries(raw.canvasNodeMetadata ?? {}).map(([canvasPath, nodes]) => [canvasPath,
      Object.fromEntries(Object.entries(nodes).map(([nodeId, metadata]) => [nodeId, {
        ...metadata,
        backContent: metadata.backContent ?? "",
        currentFace: metadata.currentFace ?? "front",
        facesEnabled: metadata.facesEnabled ?? Boolean(metadata.backContent || metadata.currentFace === "back"),
        labelColor: metadata.labelColor ?? ""
      }]))
    ])),
    uiState: {
      ...DEFAULT_DATA.uiState,
      ...legacyUi,
      sideSelectedItemIds: legacyUi.sideSelectedItemIds ?? [],
      sideItemFaces: legacyUi.sideItemFaces ?? {},
      miniItemFaces: legacyUi.miniItemFaces ?? {},
      quickEditor: { ...DEFAULT_DATA.uiState.quickEditor, ...legacyUi.quickEditor },
      workspaceExplorer: { ...DEFAULT_DATA.uiState.workspaceExplorer, ...legacyUi.workspaceExplorer },
      pendingCanvasWorkspaceCleanup: legacyUi.pendingCanvasWorkspaceCleanup ?? [],
      miniPalette: {
      ...DEFAULT_DATA.uiState.miniPalette, ...legacyMiniPalette,
      storageItemIds: legacyMiniPalette.storageItemIds?.filter((id) => Boolean(raw.items?.[id]) && !(raw.pendingItemIds ?? []).includes(id)) ?? [],
      densityLevel: legacyUi.miniPalette?.densityLevel ?? legacyDensity(legacyUi.miniPalette?.viewMode, legacyUi.miniPalette?.cardHeight),
      collectSelectedItemIds: legacyUi.miniPalette?.collectSelectedItemIds ?? (legacyUi.miniPalette?.tab === "collect" ? legacyUi.miniPalette?.selectedItemIds ?? [] : []),
      collectSelectionAnchorId: legacyUi.miniPalette?.collectSelectionAnchorId ?? null,
      storageSelectedItemIds: legacyUi.miniPalette?.storageSelectedItemIds ?? (legacyUi.miniPalette?.tab === "storage" ? legacyUi.miniPalette?.selectedItemIds ?? [] : []),
      storageSelectionAnchorId: legacyUi.miniPalette?.storageSelectionAnchorId ?? null,
      focusedItemId: legacyUi.miniPalette?.focusedItemId ?? null,
      selectedItemIds: [],
      tab: legacyUi.miniPalette?.tab ?? legacyUi.miniTab ?? DEFAULT_DATA.uiState.miniPalette.tab,
      leftPaneOpen: legacyUi.miniPalette?.leftPaneOpen ?? legacyUi.leftPaneOpen ?? DEFAULT_DATA.uiState.miniPalette.leftPaneOpen,
      rightPaneOpen: legacyUi.miniPalette?.rightPaneOpen ?? legacyUi.rightPaneOpen ?? DEFAULT_DATA.uiState.miniPalette.rightPaneOpen,
      leftPaneWidth: legacyUi.miniPalette?.leftPaneWidth ?? legacyUi.leftPaneWidth ?? DEFAULT_DATA.uiState.miniPalette.leftPaneWidth,
      rightPaneWidth: legacyUi.miniPalette?.rightPaneWidth ?? legacyUi.rightPaneWidth ?? DEFAULT_DATA.uiState.miniPalette.rightPaneWidth
      }
    }
  };
}
