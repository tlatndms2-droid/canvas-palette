export type MiniLayoutMode = "wide" | "medium" | "narrow" | "minimum";
export type SideLayoutMode = "wide" | "medium" | "very-narrow";
export type FlyoutSide = "left" | "right";

export const MINI_BREAKPOINTS = { wide: 900, medium: 680, narrow: 480, minimum: 360 } as const;
export const SIDE_BREAKPOINTS = { wide: 520, medium: 360, minimum: 300 } as const;

export function miniLayoutMode(width: number): MiniLayoutMode {
  if (width >= MINI_BREAKPOINTS.wide) return "wide";
  if (width >= MINI_BREAKPOINTS.medium) return "medium";
  if (width >= MINI_BREAKPOINTS.narrow) return "narrow";
  return "minimum";
}

export function sideLayoutMode(width: number): SideLayoutMode {
  if (width >= SIDE_BREAKPOINTS.wide) return "wide";
  if (width >= SIDE_BREAKPOINTS.medium) return "medium";
  return "very-narrow";
}

export interface FlyoutPlacement {
  side: FlyoutSide;
  width: number;
  panelLeft: number;
}

/** Keeps an attached flyout inside the Obsidian viewport without covering its palette. */
export function attachedFlyoutPlacement(
  hostWidth: number,
  panelLeft: number,
  panelWidth: number,
  preferredSide: FlyoutSide,
  requestedWidth: number,
  gap = 8
): FlyoutPlacement {
  const rightSpace = Math.max(0, hostWidth - panelLeft - panelWidth - gap);
  const leftSpace = Math.max(0, panelLeft - gap);
  const opposite: FlyoutSide = preferredSide === "right" ? "left" : "right";
  const preferredSpace = preferredSide === "right" ? rightSpace : leftSpace;
  const oppositeSpace = opposite === "right" ? rightSpace : leftSpace;
  let side = preferredSpace >= requestedWidth || preferredSpace >= oppositeSpace ? preferredSide : opposite;
  const totalWidth = panelWidth + requestedWidth + gap;
  let nextLeft = panelLeft;
  if (totalWidth <= hostWidth) {
    if (side === "right" && rightSpace < requestedWidth) nextLeft = Math.max(0, hostWidth - totalWidth);
    if (side === "left" && leftSpace < requestedWidth) nextLeft = Math.min(hostWidth - panelWidth, requestedWidth + gap);
  }
  const available = side === "right"
    ? Math.max(0, hostWidth - nextLeft - panelWidth - gap)
    : Math.max(0, nextLeft - gap);
  return { side, width: Math.max(0, Math.min(requestedWidth, available)), panelLeft: nextLeft };
}
