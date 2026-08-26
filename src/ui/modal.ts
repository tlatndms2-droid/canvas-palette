import { App, Modal, Setting } from "obsidian";

export class TextPromptModal extends Modal {
  private value: string;
  constructor(app: App, private readonly title: string, initial: string, private readonly onSubmit: (value: string) => void, private readonly placeholder = "") { super(app); this.value = initial; }
  onOpen(): void {
    this.contentEl.createEl("h2", { text: this.title });
    new Setting(this.contentEl).addText((text) => text.setValue(this.value).setPlaceholder(this.placeholder).onChange((value) => { this.value = value; }));
    new Setting(this.contentEl).addButton((button) => button.setButtonText("Save").setCta().onClick(() => { if (this.value.trim()) this.onSubmit(this.value.trim()); this.close(); }));
  }
  onClose(): void { this.contentEl.empty(); }
}
