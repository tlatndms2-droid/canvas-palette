export interface PlacementBounds {
  id?: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function isContentNode(node: PlacementBounds): boolean { return node.type !== "group"; }

function overlaps(left: PlacementBounds, right: PlacementBounds): boolean {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y;
}

/**
 * Groups are Canvas containers, not occupied content. Only real content nodes
 * can block a multi-item export, and each incoming node is checked separately.
 */
export function bundleContentCollides(
  existingNodes: PlacementBounds[],
  bundleNodes: PlacementBounds[],
  origin: { x: number; y: number },
  ignoredNodeIds: Set<string> = new Set<string>(),
): boolean {
  const existingContent = existingNodes.filter((node) => isContentNode(node) && !(node.id && ignoredNodeIds.has(node.id)));
  return bundleNodes.filter(isContentNode).some((node) => {
    const placed = { ...node, x: node.x + origin.x, y: node.y + origin.y };
    return existingContent.some((existing) => overlaps(placed, existing));
  });
}
