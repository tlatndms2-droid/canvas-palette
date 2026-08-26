import type { PaletteItem } from "../core/types";

export class SearchService {
  matches(item: PaletteItem, query: string): boolean {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return true;
    return [item.displayTitle, item.content ?? "", item.caption, item.label, ...item.tags]
      .join("\n")
      .toLocaleLowerCase()
      .includes(needle);
  }

  filter(items: PaletteItem[], query: string): PaletteItem[] {
    return items.filter((item) => this.matches(item, query));
  }
}
