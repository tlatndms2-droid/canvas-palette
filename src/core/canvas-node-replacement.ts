import type { CanvasNodeSnapshot } from "./types";

export interface MarkdownNodeReplacement {
  removedNode: CanvasNodeSnapshot;
  replacementNode: CanvasNodeSnapshot;
}

export function findMarkdownNodeReplacement(previousNodes: Map<string, CanvasNodeSnapshot>, currentNodes: Map<string, CanvasNodeSnapshot>, linkedNodeIds: string[], maximumDistance = 48): MarkdownNodeReplacement | null {
  const removedNode = linkedNodeIds.map((nodeId) => previousNodes.get(nodeId)).find((node): node is CanvasNodeSnapshot => Boolean(node?.type === "text" && !currentNodes.has(node.id)));
  if (!removedNode) return null;
  const replacementNode = [...currentNodes.values()]
    .filter((node) => node.type === "file" && node.file?.toLocaleLowerCase().endsWith(".md") && !previousNodes.has(node.id))
    .sort((left, right) => nodeDistance(left, removedNode) - nodeDistance(right, removedNode))[0];
  return replacementNode && nodeDistance(replacementNode, removedNode) <= maximumDistance ? { removedNode, replacementNode } : null;
}

function nodeDistance(left: CanvasNodeSnapshot, right: CanvasNodeSnapshot): number {
  const leftCenterX = left.x + left.width / 2;
  const leftCenterY = left.y + left.height / 2;
  const rightCenterX = right.x + right.width / 2;
  const rightCenterY = right.y + right.height / 2;
  return Math.hypot(leftCenterX - rightCenterX, leftCenterY - rightCenterY);
}
