import { expect, it } from "vitest";
import {
  createAssetCanvasDocument,
  createAssetGenerationNode,
} from "../src/shared/asset-canvas.js";
import { createGroup, moveGroup } from "../src/shared/canvas-groups.js";
import {
  groupCanvasNodes,
  groupCanvasEdges,
} from "../src/renderer/studio-groups.js";
import { canvasHistoryKey } from "../src/renderer/asset-canvas-workspace.js";
import { toAssetCanvasNode } from "../src/renderer/asset-canvas-workspace.js";
it("group drag follows member coordinates when moved right and proxy edges preserve actual links", () => {
  const board = createAssetCanvasDocument(),
    a = createAssetGenerationNode("image", { x: 96, y: 96 }),
    b = createAssetGenerationNode("image", { x: 800, y: 96 });
  board.nodes = [a, b];
  board.editorLayout.nodes = Object.fromEntries(
    board.nodes.map((n) => [n.id, n.position]),
  );
  const group = createGroup(board, [a.id], "Hero");
  const before = groupCanvasNodes(board, () => {})[0]!;
  const history = canvasHistoryKey(board);
  moveGroup(board, group, 500, 100);
  const after = groupCanvasNodes(board, () => {})[0]!;
  expect(after.position.x - before.position.x).toBe(500);
  expect(after.position.y - before.position.y).toBe(100);
  expect(canvasHistoryKey(board)).not.toBe(history);
  board.editorLayout.groups![group]!.collapsed = true;
  const edges = [{ id: "edge", source: a.id, target: b.id }];
  expect(groupCanvasEdges(board, edges)[0]?.source).toBe(
    `studio-group:${group}`,
  );
  expect(edges[0]?.source).toBe(a.id);
  expect(board.nodes).toHaveLength(2);
});
it("serializes group, standard and template provenance on the editor node", () => {
  const node = createAssetGenerationNode("image", { x: 96, y: 96 });
  node.groupId = "group";
  node.standardId = "style";
  node.standardOverrides = { art: "Copper" };
  node.template = { id: "template", revision: 3 };
  const output = toAssetCanvasNode({
    ...node,
    data: { prompt: "Fox", images: [], resolution: "1K", aspectRatio: "1:1" },
  } as never);
  expect(output).toMatchObject({
    groupId: "group",
    standardId: "style",
    standardOverrides: { art: "Copper" },
    template: { id: "template", revision: 3 },
  });
});
