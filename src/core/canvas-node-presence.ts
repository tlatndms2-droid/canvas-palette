export function mergeCanvasNodeIds(savedNodeIds: Set<string>, openNodeIds: Set<string>): Set<string> {
  return new Set([...savedNodeIds, ...openNodeIds]);
}
