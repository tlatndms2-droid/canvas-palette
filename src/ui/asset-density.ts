import type { AssetViewMode } from "../core/types";

export const ASSET_DENSITY_MIN = 0;
export const ASSET_DENSITY_MAX = 6;
export const ASSET_DENSITY_DEFAULT = 4;
export const PREVIEW_FONT_SIZE_MIN = 11;
export const PREVIEW_FONT_SIZE_MAX = 14;
export const PREVIEW_FONT_SIZE_DEFAULT = 14;

const STEPS = [
  { label: "Details", minWidth: 0, height: 96, titleSize: 14, titleLines: 2, previewOffset: -1, previewLines: 5, previewMaxHeight: 72 },
  { label: "Extra small", minWidth: 116, height: 112, titleSize: 12, titleLines: 2, previewOffset: 0, previewLines: 0, previewMaxHeight: 0 },
  { label: "Small", minWidth: 148, height: 144, titleSize: 13, titleLines: 2, previewOffset: -2, previewLines: 2, previewMaxHeight: 36 },
  { label: "Compact", minWidth: 180, height: 178, titleSize: 14, titleLines: 2, previewOffset: -1, previewLines: 3, previewMaxHeight: 54 },
  { label: "Medium", minWidth: 220, height: 220, titleSize: 15, titleLines: 2, previewOffset: 0, previewLines: 5, previewMaxHeight: 96 },
  { label: "Large", minWidth: 268, height: 270, titleSize: 15, titleLines: 2, previewOffset: 0, previewLines: 7, previewMaxHeight: 140 },
  { label: "Extra large", minWidth: 320, height: 320, titleSize: 16, titleLines: 2, previewOffset: 0, previewLines: 9, previewMaxHeight: 180 }
] as const;

export function clampPreviewFontSize(value: number | undefined): number {
  const candidate = typeof value === "number" && Number.isFinite(value) ? value : PREVIEW_FONT_SIZE_DEFAULT;
  return Math.max(PREVIEW_FONT_SIZE_MIN, Math.min(PREVIEW_FONT_SIZE_MAX, Math.round(candidate)));
}

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

export function applyAssetDensity(element: HTMLElement, value: number, prefix: "cp-grid" | "cp-asset-grid", preferredPreviewFontSize = PREVIEW_FONT_SIZE_DEFAULT): number {
  const density = clampAssetDensity(value);
  const step = STEPS[density];
  const previewFontSize = Math.max(PREVIEW_FONT_SIZE_MIN, clampPreviewFontSize(preferredPreviewFontSize) + step.previewOffset);
  element.classList.remove(`${prefix}--grid`, `${prefix}--list`);
  element.classList.add(`${prefix}--${assetViewMode(density)}`);
  element.dataset.density = String(density);
  element.style.setProperty("--cp-density-card-width", `${step.minWidth}px`);
  element.style.setProperty("--cp-density-card-height", `${step.height}px`);
  element.style.setProperty("--cp-density-title-size", `${step.titleSize}px`);
  element.style.setProperty("--cp-density-title-lines", String(step.titleLines));
  element.style.setProperty("--cp-density-preview-size", `${previewFontSize}px`);
  element.style.setProperty("--cp-density-preview-lines", String(step.previewLines));
  element.style.setProperty("--cp-density-preview-max-height", `${step.previewMaxHeight}px`);
  return density;
}
