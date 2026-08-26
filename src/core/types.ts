export type PaletteItemType = "card" | "markdown" | "image" | "group";

export interface ItemOrigin {
  canvasPath?: string;
  canvasNodeId?: string;
  workspaceId?: string;
  filePath?: string;
}

export interface CanvasNodeSnapshot {
  id: string;
  type: string;
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
  [key: string]: unknown;
}

export interface GroupSnapshot {
  nodes: CanvasNodeSnapshot[];
  edges: CanvasEdgeSnapshot[];
}

export interface PaletteItem {
  id: string;
  type: PaletteItemType;
  displayTitle: string;
  tags: string[];
  label: string;
  caption: string;
  createdAt: number;
  modifiedAt: number;
  origin: ItemOrigin;
  content?: string;
  group?: GroupSnapshot;
}

export interface Collection {
  id: string;
  workspaceId: string;
  parentId: string | null;
  name: string;
  childCollectionIds: string[];
  itemIds: string[];
}

export interface PaletteWorkspace {
  id: string;
  name: string;
  canvasPaths: string[];
  isRepresentativeFor: string[];
  rootCollectionIds: string[];
  looseItemIds: string[];
}

export interface PaletteSettings {
  theme: "obsidian" | "light" | "dark";
  cardSize: number;
  fontSize: number;
  columns: number;
}

export interface UIState {
  activeWorkspaceId: string | null;
  selectedItemId: string | null;
  miniTab: "collect" | "storage";
  leftPaneOpen: boolean;
  rightPaneOpen: boolean;
  leftPaneWidth: number;
  rightPaneWidth: number;
}

export interface PaletteData {
  schemaVersion: number;
  settings: PaletteSettings;
  items: Record<string, PaletteItem>;
  workspaces: Record<string, PaletteWorkspace>;
  collections: Record<string, Collection>;
  pendingItemIds: string[];
  uiState: UIState;
}
