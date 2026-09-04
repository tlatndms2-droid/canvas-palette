export type PaletteItemType = "card" | "markdown" | "image" | "video" | "link" | "group";
export type PaletteTheme = "obsidian" | "light" | "dark";
export type AccentMode = "obsidian" | "custom";
export type AssetViewMode = "grid" | "list";
export type CardFace = "front" | "back";
export type WorkspaceKind = "general" | "canvas" | "archive";
export type WorkspaceExplorerViewMode = "list" | "details" | "icons";
export type WorkspaceExplorerSort = "modified-desc" | "modified-asc" | "created-desc" | "created-asc" | "name-asc" | "name-desc";

export interface TextSourceRange { from: { line: number; ch: number }; to: { line: number; ch: number }; }
export interface ItemOrigin { canvasPath?: string; canvasNodeId?: string; workspaceId?: string; filePath?: string; textRange?: TextSourceRange; }
export interface CanvasPlacement { canvasPath: string; nodeIds: string[]; placedAt: number; }
/** A display-only Canvas link address. Its number is derived from the saved link order. */
export interface NumberedCanvasLink { canvasPath: string; nodeId: string; number: number; total: number; }
export interface PaletteMetadata { tags: string[]; label: string; labelColor?: string; caption: string; /** Legacy stored value retained for compatibility; Canvas now uses PaletteSettings.canvasCaptionFontSize. */ captionFontSize?: number; backContent: string; currentFace: CardFace; facesEnabled: boolean; modifiedAt: number; }

export interface CanvasNodeSnapshot {
  id: string;
  type: "text" | "file" | "group" | string;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  file?: string;
  /** JSON Canvas external-link node URL. */
  url?: string;
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

export interface GroupSnapshot {
  bounds: { width: number; height: number };
  nodes: CanvasNodeSnapshot[];
  edges: CanvasEdgeSnapshot[];
  /** Legacy Front/Back-only snapshot; retained for data created before schema 22. */
  nodeBacks?: Record<string, string>;
  /** Per-node Palette metadata for a stored Canvas subgraph. */
  nodeMetadata?: Record<string, PaletteMetadata>;
}

/** A validated, one-time expansion of a stored Group into ordinary Outliner data. */
export interface GroupDecompositionInput {
  folders: Array<{ nodeId: string; name: string; parentNodeId: string | null }>;
  items: PaletteItem[];
  itemFolderIds: Record<string, string>;
  edges: Array<{ fromNode: string; toNode: string }>;
}

export interface PaletteItem {
  id: string;
  type: PaletteItemType;
  displayTitle: string;
  tags: string[];
  label: string;
  labelColor?: string;
  caption: string;
  /** Legacy stored value retained for compatibility; Palette captions use their fixed display size. */
  captionFontSize?: number;
  createdAt: number;
  modifiedAt: number;
  origin: ItemOrigin;
  sourceDeletedAt?: number;
  canvasPlacements: CanvasPlacement[];
  content?: string;
  /** Reference-only source path retained by independent Canvas-structure copies. */
  sourceReferencePath?: string;
  /** A one-time, display-only snapshot of a native Canvas link. */
  webLink?: { url: string; siteName: string; description: string; thumbnailUrl: string; width: number; height: number; color?: string; capturedAt: number; };
  backContent: string;
  facesEnabled: boolean;
  group?: GroupSnapshot;
  parentItemId?: string | null;
  childItemIds?: string[];
  /** Collections may be nested beneath any Item, just like child Items. */
  childCollectionIds?: string[];
  /** Mixed display order for direct child Items and Collections. */
  outlineOrder?: string[];
  /** ID of the source Item when this is an independent Archive snapshot. */
  archivedFromItemId?: string;
}

/** Mixed display order for direct cards and folders in an Outliner level. */
export interface Collection { id: string; workspaceId: string; parentId: string | null; /** Mutually exclusive with parentId. */ parentItemId?: string | null; name: string; childCollectionIds: string[]; itemIds: string[]; outlineOrder?: string[]; }
/** A visible Outliner row. This is session UI state, never persisted with a workspace. */
export interface OutlineSelectionTarget { kind: "collection" | "item"; id: string; }

export interface SideLayoutState {
  viewportRatio: number; topRatio: number; indexRatio: number; viewMode: AssetViewMode;
  responsiveTab: "viewport" | "outliner";
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
  /** Mixed display order for the Workspace root. */
  outlineOrder?: string[];
  sideLayout: SideLayoutState;
  createdAt: number;
  modifiedAt: number;
  /** Canvas selections shown as additional Outliner trees. They do not change an item's normal folder. */
  outlineStructures?: OutlineStructure[];
}

export interface OutlineStructure { id: string; canvasPath: string; rule: "edge" | "position"; rootItemIds: string[]; childItemIds: Record<string, string[]>; itemIds: string[]; }

export interface PaletteSettings {
  theme: PaletteTheme;
  accentMode: AccentMode;
  accentColor: string;
  labelColorPresets: string[];
  cardHeight: number;
  fontSize: number;
  columns: number;
  /** One shared display size for captions rendered on every Canvas. */
  canvasCaptionFontSize: number;
}

export interface MiniPaletteState {
  tab: "collect" | "storage";
  /** Explicit relay links sent from Side Palette. Source Workspace items remain canonical. */
  storageItemIds: string[];
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
export interface WorkspaceExplorerGeometry extends QuickEditorGeometry { collapsed: boolean; expandedCanvasPaths: string[]; }

export interface UIState {
  activeWorkspaceId: string | null;
  lastCanvasPath: string | null;
  selectedItemId: string | null;
  sideSelectedItemIds: string[];
  sideItemFaces: Record<string, CardFace>;
  miniItemFaces: Record<string, CardFace>;
  quickEditor: QuickEditorGeometry;
  miniPalette: MiniPaletteState;
  workspaceExplorer: { viewMode: WorkspaceExplorerViewMode; sort: WorkspaceExplorerSort; geometry: WorkspaceExplorerGeometry };
  pendingCanvasWorkspaceCleanup: string[];
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
