import type { AssetViewMode } from "../core/types";

export const ASSET_DENSITY_MIN = 0;
export const ASSET_DENSITY_MAX = 6;
export const ASSET_DENSITY_DEFAULT = 4;

const STEPS = [
  { label: "Details", minWidth: 0, height: 96 },
  { label: "Extra small", minWidth: 116, height: 112 },
  { label: "Small", minWidth: 148, height: 144 },
  { label: "Compact", minWidth: 180, height: 178 },
  { label: "Medium", minWidth: 220, height: 220 },
  { label: "Large", minWidth: 268, height: 270 },
  { label: "Extra large", minWidth: 320, height: 320 }
] as const;

export function clampAssetDensity(value: number | undefined): number {
  return Math.max(ASSET_DENSITY_MIN, Math.min(ASSET_DENSITY_MAX, Math.round(value ?? ASSET_DENSITY_DEFAULT)));
}

export function assetDensityLabel(value: number): string { return STEPS[clampAssetDensity(value)].label; }
export function assetViewMode(value: number): AssetViewMode { return clampAssetDensity(value) === 0 ? "list" : "grid"; }
export function nextAssetDensity(value: number, deltaY: number): number { return deltaY === 0 ? clampAssetDensity(value) : clampAssetDensity(value + (deltaY < 0 ? 1 : -1)); }

export function legacyDensity(viewMode: AssetViewMode | undefined, cardHeight: number | undefined): number {
  if (viewMode === "list") return 0;
  const height = cardHeight ?? STEPS[ASSET_DENSITY_DEFAULT].height;
  let closest = 1;
  for (let index = 2; index < STEPS.length; index += 1) {
    if (Math.abs(STEPS[index].height - height) < Math.abs(STEPS[closest].height - height)) closest = index;
  }
  return closest;
}

export function applyAssetDensity(element: HTMLElement, value: number, prefix: "cp-grid" | "cp-asset-grid"): number {
  const density = clampAssetDensity(value);
  const step = STEPS[density];
  element.classList.remove(`${prefix}--grid`, `${prefix}--list`);
  element.classList.add(`${prefix}--${assetViewMode(density)}`);
  element.dataset.density = String(density);
  element.style.setProperty("--cp-density-card-width", `${step.minWidth}px`);
  element.style.setProperty("--cp-density-card-height", `${step.height}px`);
  return density;
}
