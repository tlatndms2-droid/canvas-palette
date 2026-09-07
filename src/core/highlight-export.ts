export type HighlightExportDestination = "canvas" | "side" | "mini";
export type HighlightCanvasLayout = "bundle" | "mindmap";

interface HighlightMatch { start: number; end: number; content: string; }

export interface HighlightBlock {
  content: string;
  title: string;
}

/** Extracts logical highlighted Markdown blocks in source order. */
export function extractHighlights(source: string): HighlightBlock[] {
  const matches = [...markdownHighlights(source), ...htmlHighlights(source)]
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const accepted: HighlightMatch[] = [];
  for (const match of matches) {
    if (!match.content.trim()) continue;
    if (accepted.some((previous) => match.start < previous.end && previous.start < match.end)) continue;
    accepted.push(match);
  }
  const blocks: HighlightBlock[] = [];
  let current: { content: string; last: HighlightMatch } | null = null;
  for (const match of accepted) {
    if (!current) {
      current = { content: `${structuralPrefix(source, match.start)}${match.content}`, last: match };
      continue;
    }
    const gap = source.slice(current.last.end, match.start);
    if (isStructuralGap(gap)) {
      current.content += `${gap}${match.content}`;
      current.last = match;
      continue;
    }
    blocks.push(toBlock(current.content));
    current = { content: `${structuralPrefix(source, match.start)}${match.content}`, last: match };
  }
  if (current) blocks.push(toBlock(current.content));
  return blocks;
}

function structuralPrefix(source: string, position: number): string {
  const lineStart = Math.max(source.lastIndexOf("\n", position - 1) + 1, 0);
  const prefix = source.slice(lineStart, position);
  return /^[ \t]*(?:#{1,6}[ \t]+|[-*+][ \t]+|\d+[.)][ \t]+)?$/.test(prefix) ? prefix : "";
}

function isStructuralGap(gap: string): boolean {
  return gap.split(/\r?\n/).every((line, index) => {
    if (!line.trim()) return true;
    return index > 0 && /^[ \t]*(?:#{1,6}[ \t]+|[-*+][ \t]+|\d+[.)][ \t]+)$/.test(line);
  });
}

function toBlock(content: string): HighlightBlock {
  const normalized = content.trim();
  const first = normalized.split(/\r?\n/).find((line) => line.trim()) ?? "";
  const title = first
    .replace(/^\s*(?:#{1,6}[ \t]+|[-*+][ \t]+|\d+[.)][ \t]+)/, "")
    .trim()
    .slice(0, 60) || "Highlight";
  return { content: normalized, title };
}

function markdownHighlights(source: string): HighlightMatch[] {
  const matches: HighlightMatch[] = [];
  const delimiter = /==/g;
  let opening: RegExpExecArray | null = null;
  for (let token = delimiter.exec(source); token; token = delimiter.exec(source)) {
    if (!opening) { opening = token; continue; }
    const content = source.slice(opening.index + opening[0].length, token.index);
    if (!content.includes("<mark") && !content.includes("</mark")) matches.push({ start: opening.index, end: token.index + token[0].length, content });
    opening = null;
  }
  return matches;
}

function htmlHighlights(source: string): HighlightMatch[] {
  const matches: HighlightMatch[] = [];
  const tag = /<\/?mark(?:\s[^>]*)?>/gi;
  const stack: Array<{ start: number; contentStart: number; nested: boolean }> = [];
  for (let token = tag.exec(source); token; token = tag.exec(source)) {
    const isClosing = /^<\/mark/i.test(token[0]);
    if (!isClosing) {
      const nested = stack.length > 0;
      if (nested) stack[stack.length - 1].nested = true;
      stack.push({ start: token.index, contentStart: token.index + token[0].length, nested });
      continue;
    }
    const opening = stack.pop();
    if (!opening || opening.nested) continue;
    const content = source.slice(opening.contentStart, token.index);
    if (!content.includes("==")) matches.push({ start: opening.start, end: token.index + token[0].length, content });
  }
  return matches;
}
