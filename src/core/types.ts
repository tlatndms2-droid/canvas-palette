export type PaletteItemType = "card" | "markdown" | "image" | "group";
export type PaletteTheme = "obsidian" | "light" | "dark";
export type AccentMode = "obsidian" | "custom";
export type AssetViewMode = "grid" | "list";
export type CardFace = "front" | "back";
export type WorkspaceKind = "general" | "canvas";
export type WorkspaceExplorerViewMode = "list" | "details" | "icons";
export type WorkspaceExplorerSort = "modified-desc" | "modified-asc" | "created-desc" | "created-asc" | "name-asc" | "name-desc";

export interface TextSourceRange { from: { line: number; ch: number }; to: { line: number; ch: number }; }
export interface ItemOrigin { canvasPath?: string; canvasNodeId?: string; workspaceId?: string; filePath?: string; textRange?: TextSourceRange; }
export interface CanvasPlacement { canvasPath: string; nodeIds: string[]; placedAt: number; }
export interface PaletteMetadata { tags: string[]; label: string; labelColor?: string; caption: string; backContent: string; currentFace: CardFace; facesEnabled: boolean; modifiedAt: number; }

export interface CanvasNodeSnapshot {
  id: string;
  type: "text" | "file" | "group" | string;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  file?: string;
  label?: string;
  color?: string;
  parentId?: string;
  [key: string]: unknown;
}

export interface CanvasEdgeSnapshot {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: string;
  toSide?: string;
  label?: string;
  color?: string;
  [key: string]: unknown;
}

export interface GroupSnapshot { bounds: { width: number; height: number }; nodes: CanvasNodeSnapshot[]; edges: CanvasEdgeSnapshot[]; nodeBacks?: Record<string, string>; }

export interface PaletteItem {
  id: string;
  type: PaletteItemType;
  displayTitle: string;
  tags: string[];
  label: string;
  labelColor?: string;
  caption: string;
  createdAt: number;
  modifiedAt: number;
  origin: ItemOrigin;
  sourceDeletedAt?: number;
  canvasPlacements: CanvasPlacement[];
  content?: string;
  backContent: string;
  facesEnabled: boolean;
  group?: GroupSnapshot;
  parentItemId?: string | null;
  childItemIds?: string[];
}

export interface Collection { id: string; workspaceId: string; parentId: string | null; name: string; childCollectionIds: string[]; itemIds: string[]; }

export interface SideLayoutState {
  viewportRatio: number; topRatio: number; indexRatio: number; viewMode: AssetViewMode;
  densityLevel: number;
  selectedCollectionId: string | null;
  focusedCollectionId: string | null;
  collapsedCollectionIds: string[];
  collapsedItemIds: string[];
  outlinerItemHeight: number;
  outlinerFontSize: number;
  outlinerIncludeDescendants: boolean;
  outlinerWrapTitles: boolean;
}
export interface PaletteWorkspace {
  id: string;
  name: string;
  kind: WorkspaceKind;
  ownerCanvasPath: string | null;
  canvasPaths: string[];
  representativeCanvasPath: string | null;
  rootCollectionIds: string[];
  looseItemIds: string[];
  sideLayout: SideLayoutState;
  createdAt: number;
  modifiedAt: number;
}

export interface PaletteSettings {
  theme: PaletteTheme;
  accentMode: AccentMode;
  accentColor: string;
  labelColorPresets: string[];
  cardHeight: number;
  fontSize: number;
  columns: number;
}

export interface MiniPaletteState {
  tab: "collect" | "storage";
  /** Mini Storage-only workspace filter. null means All Workspaces. */
  storageWorkspaceFilter: string | null;
  isOpen: boolean;
  position: { x: number; y: number };
  size: { width: number; height: number };
  leftPaneOpen: boolean;
  rightPaneOpen: boolean;
  leftPaneWidth: number;
  rightPaneWidth: number;
  viewMode: AssetViewMode;
  densityLevel: number;
  cardHeight: number;
  sort: "modified-desc" | "modified-asc" | "title-asc" | "title-desc";
  collectSelectedItemIds: string[];
  collectSelectionAnchorId: string | null;
  storageSelectedItemIds: string[];
  storageSelectionAnchorId: string | null;
  focusedItemId: string | null;
  /** @deprecated migration-only selection used before schema 18 */
  selectedItemIds: string[];
}

export interface QuickEditorGeometry { x: number | null; y: number | null; width: number | null; height: number | null; }

export interface UIState {
  activeWorkspaceId: string | null;
  lastCanvasPath: string | null;
  selectedItemId: string | null;
  sideSelectedItemIds: string[];
  sideItemFaces: Record<string, CardFace>;
  miniItemFaces: Record<string, CardFace>;
  quickEditor: QuickEditorGeometry;
  miniPalette: MiniPaletteState;
  workspaceExplorer: { viewMode: WorkspaceExplorerViewMode; sort: WorkspaceExplorerSort };
}

export interface PaletteData {
  schemaVersion: number;
  settings: PaletteSettings;
  items: Record<string, PaletteItem>;
  workspaces: Record<string, PaletteWorkspace>;
  collections: Record<string, Collection>;
  pendingItemIds: string[];
  canvasNodeMetadata: Record<string, Record<string, PaletteMetadata>>;
  uiState: UIState;
}
