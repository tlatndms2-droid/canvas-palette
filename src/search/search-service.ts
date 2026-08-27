import type { PaletteItem } from "../core/types";

export class SearchService {
  matches(item: PaletteItem, query: string): boolean {
    const tokens = this.tokens(query);
    if (tokens.length === 0) return true;
    let index = 0;
    const expression = (): boolean => {
      let result = conjunction();
      while (tokens[index]?.toLocaleUpperCase() === "OR") {
        index += 1;
        const right = conjunction();
        result = result || right;
      }
      return result;
    };
    const conjunction = (): boolean => {
      let result = true;
      let found = false;
      while (index < tokens.length && tokens[index] !== ")" && tokens[index].toLocaleUpperCase() !== "OR") {
        const right = primary();
        result = result && right;
        found = true;
      }
      return found ? result : true;
    };
    const primary = (): boolean => {
      const token = tokens[index++];
      if (token === "(") {
        const result = expression();
        if (tokens[index] === ")") index += 1;
        return result;
      }
      return this.matchesToken(item, token);
    };
    return expression();
  }

  filter(items: PaletteItem[], query: string): PaletteItem[] {
    return items.filter((item) => this.matches(item, query));
  }

  hasToken(query: string, token: string): boolean {
    const normalized = token.toLocaleLowerCase();
    return this.tokens(query).some((candidate) => candidate.toLocaleLowerCase() === normalized);
  }

  toggleToken(query: string, token: string): string {
    const tokens = this.tokens(query);
    const index = tokens.findIndex((candidate) => candidate.toLocaleLowerCase() === token.toLocaleLowerCase());
    if (index < 0) return [...tokens, token].join(" ").trim();
    tokens.splice(index, 1);
    if (tokens[index]?.toLocaleUpperCase() === "OR") tokens.splice(index, 1);
    else if (tokens[index - 1]?.toLocaleUpperCase() === "OR") tokens.splice(index - 1, 1);
    return tokens.join(" ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();
  }

  private tokens(query: string): string[] {
    return query.match(/label:"(?:\\.|[^"])*"|tag:#[^\s()]+|"(?:\\.|[^"])*"|\(|\)|\bOR\b|[^\s()]+/gi) ?? [];
  }

  private matchesToken(item: PaletteItem, token: string): boolean {
    const lower = token.toLocaleLowerCase();
    if (lower.startsWith("label:")) return item.label.toLocaleLowerCase() === this.unquote(token.slice(6)).toLocaleLowerCase();
    const tag = lower.startsWith("tag:#") ? token.slice(5) : token.startsWith("#") ? token.slice(1) : null;
    if (tag !== null) return item.tags.some((value) => value.toLocaleLowerCase() === tag.toLocaleLowerCase());
    const needle = this.unquote(token).toLocaleLowerCase();
    return [item.displayTitle, item.content ?? "", item.caption, item.label, ...item.tags].join("\n").toLocaleLowerCase().includes(needle);
  }

  private unquote(value: string): string {
    return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\") : value;
  }
}
