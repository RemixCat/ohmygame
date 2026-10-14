import type { AssetCanvasDocument, AssetCanvasNode } from "./contracts.js";
import { validateHierarchy, type CanvasGroup } from "./studio.js";

export function groupDescendants(
  groups: CanvasGroup[],
  id: string,
): Set<string> {
  const ids = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const group of groups)
      if (group.parentId && ids.has(group.parentId) && !ids.has(group.id)) {
        ids.add(group.id);
        changed = true;
      }
  }
  return ids;
}
export function validateCanvasGroups(board: AssetCanvasDocument): void {
  const groups = board.groups ?? [];
  validateHierarchy(groups);
  if (groups.length && board.version !== 2)
    throw new Error("Grouped boards require format version 2");
  const ids = new Set(groups.map((g) => g.id));
  if (board.nodes.some((n) => n.groupId && !ids.has(n.groupId)))
    throw new Error("Node references a missing group");
  for (const id of Object.keys(board.editorLayout.groups ?? {}))
    if (!ids.has(id)) throw new Error("Layout references a missing group");
}
export function createGroup(
  board: AssetCanvasDocument,
  nodeIds: string[],
  name: string,
  parentId?: string,
): string {
  const id = crypto.randomUUID();
  board.version = 2;
  (board.groups ??= []).push({
    id,
    name,
    color: "#7c6fe0",
    ...(parentId ? { parentId } : {}),
  });
  const nodes = board.nodes.filter((n) => nodeIds.includes(n.id));
  for (const n of nodes) n.groupId = id;
  (board.editorLayout.groups ??= {})[id] = {
    x: Math.min(96, ...nodes.map((n) => n.position.x)) - 32,
    y: Math.min(96, ...nodes.map((n) => n.position.y)) - 64,
  };
  validateCanvasGroups(board);
  return id;
}
export function ungroup(
  board: AssetCanvasDocument,
  id: string,
  deleteContents = false,
): void {
  const group = board.groups?.find((g) => g.id === id);
  if (!group) return;
  const descendants = groupDescendants(board.groups ?? [], id);
  if (deleteContents) {
    const removed = new Set(
      board.nodes
        .filter((n) => n.groupId && descendants.has(n.groupId))
        .map((n) => n.id),
    );
    board.nodes = board.nodes.filter((n) => !removed.has(n.id));
    board.edges = board.edges.filter(
      (e) => !removed.has(e.source) && !removed.has(e.target),
    );
    // References are reconciled by the normal node-removal path in the editor.
  } else {
    for (const n of board.nodes)
      if (n.groupId === id) n.groupId = group.parentId;
    for (const g of board.groups ?? [])
      if (g.parentId === id) g.parentId = group.parentId;
  }
  board.groups = board.groups?.filter((g) =>
    deleteContents ? !descendants.has(g.id) : g.id !== id,
  );
  for (const key of Object.keys(board.editorLayout.groups ?? {}))
    if (deleteContents ? descendants.has(key) : key === id)
      delete board.editorLayout.groups![key];
  for (const key of Object.keys(board.editorLayout.nodes))
    if (!board.nodes.some((n) => n.id === key))
      delete board.editorLayout.nodes[key];
}
export function moveGroup(
  board: AssetCanvasDocument,
  id: string,
  dx: number,
  dy: number,
): void {
  const ids = groupDescendants(board.groups ?? [], id);
  for (const node of board.nodes)
    if (node.groupId && ids.has(node.groupId)) {
      node.position.x += dx;
      node.position.y += dy;
      board.editorLayout.nodes[node.id] = {
        ...board.editorLayout.nodes[node.id],
        ...node.position,
      };
    }
  for (const groupId of ids) {
    const p = board.editorLayout.groups?.[groupId];
    if (p) {
      p.x += dx;
      p.y += dy;
    }
  }
}
export function collapsedAncestor(
  board: AssetCanvasDocument,
  node: AssetCanvasNode,
): string | undefined {
  let id = node.groupId,
    hidden: string | undefined;
  const seen = new Set<string>();
  while (id && !seen.has(id)) {
    seen.add(id);
    if (board.editorLayout.groups?.[id]?.collapsed) hidden = id;
    id = board.groups?.find((g) => g.id === id)?.parentId;
  }
  return hidden;
}
