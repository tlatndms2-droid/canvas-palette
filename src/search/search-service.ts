import type { PaletteItem } from "../core/types";

export interface SearchItemContext { groupNames?: string[]; unlinked?: boolean; }

export class SearchService {
  matches(item: PaletteItem, query: string, context: SearchItemContext = {}): boolean {
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
      return this.matchesToken(item, token, context);
    };
    return expression();
  }

  filter(items: PaletteItem[], query: string, contextForItem?: (item: PaletteItem) => SearchItemContext): PaletteItem[] {
    return items.filter((item) => this.matches(item, query, contextForItem?.(item)));
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

  setFacet(query: string, facet: "type" | "space", token: string | null): string {
    const prefix = `${facet}:`;
    const tokens = this.tokens(query).filter((candidate) => !candidate.toLocaleLowerCase().startsWith(prefix));
    if (token) tokens.push(token);
    return tokens.join(" ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();
  }

  tokens(query: string): string[] {
    return query.match(/(?:label|space|tag|type|group|file|path):"(?:\\.|[^"])*"|tag:#[^\s()]+|"(?:\\.|[^"])*"|\(|\)|\bOR\b|[^\s()]+/gi) ?? [];
  }

  private matchesToken(item: PaletteItem, token: string, context: SearchItemContext): boolean {
    const lower = token.toLocaleLowerCase();
    if (lower === "unlinked") return context.unlinked ?? (!(item.origin.canvasPath && item.origin.canvasNodeId) && !item.canvasPlacements.some((placement) => placement.nodeIds.length > 0));
    if (lower.startsWith("label:")) return item.label.toLocaleLowerCase() === this.unquote(token.slice(6)).toLocaleLowerCase();
    if (lower.startsWith("type:")) return item.type === lower.slice(5);
    if (lower.startsWith("group:")) { const value = this.unquote(token.slice(6)).toLocaleLowerCase(); return (context.groupNames ?? []).some((name) => name.toLocaleLowerCase().includes(value)); }
    if (lower.startsWith("file:")) { const value = this.unquote(token.slice(5)).toLocaleLowerCase(); return [item.displayTitle, item.origin.filePath?.split("/").pop() ?? ""].some((name) => name.toLocaleLowerCase().includes(value)); }
    if (lower.startsWith("path:")) return (item.origin.filePath ?? "").toLocaleLowerCase().includes(this.unquote(token.slice(5)).toLocaleLowerCase());
    if (lower.startsWith("space:")) {
      const space = this.unquote(token.slice(6)).toLocaleLowerCase();
      return [item.origin.canvasPath, ...item.canvasPlacements.map((placement) => placement.canvasPath)].some((path) => path?.toLocaleLowerCase() === space);
    }
    const tag = lower.startsWith("tag:") ? this.unquote(token.slice(4)).replace(/^#/, "") : token.startsWith("#") ? token.slice(1) : null;
    if (tag !== null) return item.tags.some((value) => value.replace(/^#/, "").toLocaleLowerCase() === tag.toLocaleLowerCase());
    const needle = this.unquote(token).toLocaleLowerCase();
    return [item.displayTitle, item.content ?? "", item.backContent, item.caption, item.label, item.origin.filePath ?? "", ...item.tags, ...(context.groupNames ?? [])].join("\n").toLocaleLowerCase().includes(needle);
  }

  private unquote(value: string): string {
    return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\") : value;
  }
}
