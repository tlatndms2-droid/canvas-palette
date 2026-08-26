export const DEFAULT_LABEL_COLORS = ["#a3a3a3", "#ef3340", "#f97300", "#eab308", "#16b85a", "#14b8a6", "#7c3aed"] as const;

export interface LabelColorPicker {
  readonly value: string;
}

export function createLabelColorPicker(parent: HTMLElement, initialValue: string | undefined, savedCustomColors: string[], onAddCustomColor: (color: string) => void): LabelColorPicker {
  const root = parent.createDiv({ cls: "cp-label-color-picker" });
  const defaults = root.createDiv({ cls: "cp-label-color-presets" });
  const customSection = root.createDiv({ cls: "cp-label-color-custom" });
  customSection.createDiv({ cls: "cp-label-color-custom__title", text: "Custom colors" });
  const custom = customSection.createDiv({ cls: "cp-label-color-presets" });
  const native = root.createEl("input", { cls: "cp-label-color-native", attr: { type: "color", "aria-label": "Add custom label color" } });
  const normalizedCustom = [...new Set(savedCustomColors.map(normalizeColor).filter((color): color is string => Boolean(color) && !DEFAULT_LABEL_COLORS.includes(color as typeof DEFAULT_LABEL_COLORS[number])))];
  let value = normalizeColor(initialValue) ?? DEFAULT_LABEL_COLORS[6];
  if (!DEFAULT_LABEL_COLORS.includes(value as typeof DEFAULT_LABEL_COLORS[number]) && !normalizedCustom.includes(value)) normalizedCustom.unshift(value);

  const select = (color: string): void => { value = color; render(); };
  const swatch = (target: HTMLElement, color: string): void => {
    const button = target.createEl("button", { cls: `cp-label-color-swatch${value === color ? " is-selected" : ""}`, attr: { type: "button", "aria-label": `Label color ${color}`, "aria-pressed": String(value === color) } });
    button.style.setProperty("--cp-swatch-color", color);
    button.addEventListener("click", () => select(color));
  };
  const render = (): void => {
    defaults.empty();
    for (const color of DEFAULT_LABEL_COLORS) swatch(defaults, color);
    const add = defaults.createEl("button", { cls: "cp-label-color-swatch cp-label-color-add", text: "+", attr: { type: "button", "aria-label": "Add custom label color" } });
    add.addEventListener("click", () => { native.value = value; native.click(); });
    custom.empty();
    for (const color of normalizedCustom) swatch(custom, color);
    customSection.toggleClass("is-empty", normalizedCustom.length === 0);
  };
  native.addEventListener("change", () => {
    const color = normalizeColor(native.value);
    if (!color) return;
    if (!DEFAULT_LABEL_COLORS.includes(color as typeof DEFAULT_LABEL_COLORS[number]) && !normalizedCustom.includes(color)) {
      normalizedCustom.push(color);
      onAddCustomColor(color);
    }
    select(color);
  });
  render();
  return { get value(): string { return value; } };
}

function normalizeColor(value: string | undefined): string | null {
  const color = value?.trim().toLowerCase();
  return color && /^#[0-9a-f]{6}$/.test(color) ? color : null;
}
