import type { CanvasEdgeSnapshot, CanvasNodeSnapshot, GroupSnapshot } from "../core/types";

export interface RestoredGroupSnapshot extends GroupSnapshot {
  originalToRestored: Map<string, string>;
  discardedReferences: number;
}

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

export function restoreGroup(snapshot: GroupSnapshot, x: number, y: number, nodeIdFactory: () => string, edgeIdFactory: () => string): RestoredGroupSnapshot {
  const idMap = new Map<string, string>();
  const nodes = snapshot.nodes.filter((node, index, all) => typeof node.id === "string" && node.id.length > 0 && all.findIndex((candidate) => candidate.id === node.id) === index);
  let discardedReferences = snapshot.nodes.length - nodes.length;
  for (const node of nodes) idMap.set(node.id, nodeIdFactory());
  const restoredNodes = nodes.map((node) => {
    const parentId = node.parentId && idMap.has(node.parentId) ? idMap.get(node.parentId) : undefined;
    if (node.parentId && !parentId) discardedReferences++;
    return { ...node, id: idMap.get(node.id)!, x: node.x + x, y: node.y + y, parentId };
  });
  const restoredEdges = snapshot.edges.flatMap((edge) => {
    const fromNode = idMap.get(edge.fromNode);
    const toNode = idMap.get(edge.toNode);
    if (!fromNode || !toNode) { discardedReferences++; return []; }
    return [{ ...edge, id: edgeIdFactory(), fromNode, toNode }];
  });
  return {
    bounds: { ...snapshot.bounds },
    nodes: restoredNodes,
    edges: restoredEdges,
    nodeBacks: snapshot.nodeBacks,
    nodeMetadata: snapshot.nodeMetadata,
    originalToRestored: idMap,
    discardedReferences
  };
}
