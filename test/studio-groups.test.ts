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

it("remaps audio prompt links when duplicating a group or instantiating its workflow", async () => {
  const { captureWorkflow, duplicateBoardFragment, instantiateWorkflow } =
    await import("../src/shared/studio-templates.js");
  const board = createAssetCanvasDocument();
  board.nodes = [
    {
      id: "script",
      type: "text",
      position: { x: 0, y: 0 },
      data: { text: "Hello", instruction: "" },
    },
    {
      id: "voice",
      type: "speech",
      position: { x: 500, y: 0 },
      data: {
        text: "{{character}}",
        promptSource: { type: "node", nodeId: "script" },
        assetId: "old-audio",
      },
    },
    {
      id: "music",
      type: "music",
      position: { x: 500, y: 500 },
      data: {
        prompt: "Theme for {{character}}",
        instrumental: true,
        promptSource: { type: "node", nodeId: "script" },
      },
    },
  ];
  board.editorLayout.nodes = Object.fromEntries(
    board.nodes.map((node) => [node.id, node.position]),
  );
  const group = createGroup(board, ["voice", "music"], "Audio");
  const copy = duplicateBoardFragment(board);
  const script = copy.nodes.find((node) => node.type === "text")!;
  for (const node of copy.nodes.filter(
    (node) => node.type === "speech" || node.type === "music",
  ))
    expect(node.data.promptSource?.nodeId).toBe(script.id);
  const template = captureWorkflow(board, group, "Audio workflow");
  expect(template.inputs).toHaveLength(2);
  expect(
    template.board!.nodes.find((node) => node.type === "speech")!.data,
  ).not.toHaveProperty("assetId");
  template.variables = [
    {
      name: "character",
      description: "Character",
      defaultValue: "",
      required: true,
    },
  ];
  const instantiated = instantiateWorkflow(
    template,
    { character: "Captain" },
    Object.fromEntries(
      template.inputs.map((input) => [input.name, "Welcome aboard"]),
    ),
  );
  const ids = new Set(instantiated.nodes.map((node) => node.id));
  for (const node of instantiated.nodes.filter(
    (node) => node.type === "speech" || node.type === "music",
  )) {
    expect(node.data.promptSource).toBeDefined();
    expect(ids.has(node.data.promptSource!.nodeId)).toBe(true);
    expect(
      node.type === "speech" ? node.data.text : node.data.prompt,
    ).toContain("Captain");
  }
});
