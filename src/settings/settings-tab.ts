import { PluginSettingTab, Setting } from "obsidian";
import type CanvasPalettePlugin from "../main";

export class CanvasPaletteSettingTab extends PluginSettingTab {
  constructor(private readonly plugin: CanvasPalettePlugin) { super(plugin.app, plugin); }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Canvas Palette" });
    new Setting(containerEl).setName("Theme").setDesc("Follow Obsidian by default; theme changes never alter layout.").addDropdown((dropdown) => dropdown
      .addOption("obsidian", "Follow Obsidian").addOption("light", "Light").addOption("dark", "Dark")
      .setValue(this.plugin.store.data.settings.theme)
      .onChange(async (value) => { this.plugin.store.data.settings.theme = value as "obsidian" | "light" | "dark"; this.plugin.store.changed(); }));
    new Setting(containerEl).setName("Accent color").setDesc("Use Obsidian's accent or select a custom Canvas Palette accent.").addDropdown((dropdown) => dropdown
      .addOption("obsidian", "Use Obsidian accent").addOption("custom", "Custom color")
      .setValue(this.plugin.store.data.settings.accentMode)
      .onChange((value) => { this.plugin.store.data.settings.accentMode = value as "obsidian" | "custom"; this.plugin.store.changed(); this.display(); }));
    if (this.plugin.store.data.settings.accentMode === "custom") new Setting(containerEl).setName("Custom accent").addColorPicker((picker) => picker
      .setValue(this.plugin.store.data.settings.accentColor)
      .onChange((value) => { this.plugin.store.data.settings.accentColor = value; this.plugin.store.changed(); }));
    new Setting(containerEl).setName("Asset size").setDesc("Side Palette and Mini Palette each keep their own Explorer-style item-size level. Change it from the palette's View settings or Control panel.");
    new Setting(containerEl).setName("Font size").setDesc("Reduce preview text from the default size.").addSlider((slider) => slider
      .setLimits(8, 14, 1).setDynamicTooltip().setValue(this.plugin.store.data.settings.fontSize)
      .onChange((value) => { this.plugin.store.data.settings.fontSize = value; this.plugin.store.changed(); }));
  }
}
