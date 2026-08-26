export type PaletteItemType = "card" | "markdown" | "image" | "group";
export type PaletteTheme = "obsidian" | "light" | "dark";
export type AccentMode = "obsidian" | "custom";
export type AssetViewMode = "grid" | "list";

export interface TextSourceRange { from: { line: number; ch: number }; to: { line: number; ch: number }; }
export interface ItemOrigin { canvasPath?: string; canvasNodeId?: string; workspaceId?: string; filePath?: string; textRange?: TextSourceRange; }
export interface CanvasPlacement { canvasPath: string; nodeIds: string[]; placedAt: number; }
export interface PaletteMetadata { tags: string[]; label: string; labelColor?: string; caption: string; modifiedAt: number; }

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

export interface GroupSnapshot { bounds: { width: number; height: number }; nodes: CanvasNodeSnapshot[]; edges: CanvasEdgeSnapshot[]; }

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
  canvasPlacements: CanvasPlacement[];
  content?: string;
  group?: GroupSnapshot;
}

export interface Collection { id: string; workspaceId: string; parentId: string | null; name: string; childCollectionIds: string[]; itemIds: string[]; }

export interface SideLayoutState { viewportRatio: number; topRatio: number; indexRatio: number; viewMode: AssetViewMode; }
export interface PaletteWorkspace {
  id: string;
  name: string;
  canvasPaths: string[];
  representativeCanvasPath: string | null;
  rootCollectionIds: string[];
  looseItemIds: string[];
  sideLayout: SideLayoutState;
}

export interface PaletteSettings {
  theme: PaletteTheme;
  accentMode: AccentMode;
  accentColor: string;
  labelColorPresets: string[];
  cardSize: number;
  fontSize: number;
  columns: number;
}

export interface MiniPaletteState {
  tab: "collect" | "storage";
  isOpen: boolean;
  position: { x: number; y: number };
  size: { width: number; height: number };
  leftPaneOpen: boolean;
  rightPaneOpen: boolean;
  leftPaneWidth: number;
  rightPaneWidth: number;
  viewMode: AssetViewMode;
  sort: "modified-desc" | "modified-asc" | "title-asc" | "title-desc";
  selectedItemIds: string[];
}

export interface QuickEditorGeometry { x: number | null; y: number | null; width: number | null; height: number | null; }

export interface UIState {
  activeWorkspaceId: string | null;
  selectedItemId: string | null;
  sideSelectedItemIds: string[];
  quickEditor: QuickEditorGeometry;
  miniPalette: MiniPaletteState;
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
