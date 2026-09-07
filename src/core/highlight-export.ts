export type HighlightExportDestination = "canvas" | "side" | "mini";
export type HighlightCanvasLayout = "bundle" | "mindmap";

interface HighlightMatch { start: number; end: number; content: string; }

/** Extracts non-empty Obsidian and HTML highlight bodies in source order. */
export function extractHighlights(source: string): string[] {
  const matches = [...markdownHighlights(source), ...htmlHighlights(source)]
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const accepted: HighlightMatch[] = [];
  for (const match of matches) {
    if (!match.content.trim()) continue;
    if (accepted.some((previous) => match.start < previous.end && previous.start < match.end)) continue;
    accepted.push(match);
  }
  return accepted.map((match) => match.content.trim());
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
