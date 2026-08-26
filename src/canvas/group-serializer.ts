import type { CanvasEdgeSnapshot, CanvasNodeSnapshot, GroupSnapshot } from "../core/types";

export function serializeGroup(nodes: CanvasNodeSnapshot[], edges: CanvasEdgeSnapshot[]): GroupSnapshot {
  if (nodes.length === 0) return { bounds: { width: 0, height: 0 }, nodes: [], edges: [] };
  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxX = Math.max(...nodes.map((node) => node.x + node.width));
  const maxY = Math.max(...nodes.map((node) => node.y + node.height));
  const ids = new Set(nodes.map((node) => node.id));
  return {
    bounds: { width: maxX - minX, height: maxY - minY },
    nodes: nodes.map((node) => ({ ...node, x: node.x - minX, y: node.y - minY })),
    edges: edges.filter((edge) => ids.has(edge.fromNode) && ids.has(edge.toNode)).map((edge) => ({ ...edge }))
  };
}

export function restoreGroup(snapshot: GroupSnapshot, x: number, y: number, idFactory: () => string): GroupSnapshot {
  const idMap = new Map<string, string>();
  for (const node of snapshot.nodes) idMap.set(node.id, idFactory());
  return {
    bounds: { ...snapshot.bounds },
    nodes: snapshot.nodes.map((node) => ({ ...node, id: idMap.get(node.id)!, x: node.x + x, y: node.y + y, parentId: node.parentId ? idMap.get(node.parentId) : undefined })),
    edges: snapshot.edges.map((edge) => ({ ...edge, id: idFactory(), fromNode: idMap.get(edge.fromNode)!, toNode: idMap.get(edge.toNode)! }))
  };
}
