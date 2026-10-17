import type {
  AssetCanvasDocument,
  AssetCanvasNode,
  AssetCanvasReference,
} from "./contracts.js";
import {
  createAssetCanvasDocument,
  createAssetGenerationNode,
  validateAssetCanvasDocument,
} from "./asset-canvas.js";
import { groupDescendants } from "./canvas-groups.js";
import {
  renderPrompt,
  type WorkflowTemplate,
  type TemplateInput,
} from "./studio.js";

/** Remap semantic references, never task IDs or generation history. */
export function remapNode(
  node: AssetCanvasNode,
  ids: ReadonlyMap<string, string>,
  external?: (
    ref: AssetCanvasReference,
    field: TemplateInput["field"],
  ) => AssetCanvasReference | undefined,
): void {
  const ref = (
    r: AssetCanvasReference,
    field: TemplateInput["field"],
  ): AssetCanvasReference | undefined =>
    r.type === "library"
      ? r
      : ids.has(r.nodeId)
        ? { ...r, nodeId: ids.get(r.nodeId)! }
        : external?.(r, field);
  if (node.quickAction) {
    const source = ids.get(node.quickAction.sourceNodeId),
      group = node.quickAction.groupId && ids.get(node.quickAction.groupId);
    if (!source || (node.quickAction.groupId && !group))
      delete node.quickAction;
    else
      node.quickAction = {
        ...node.quickAction,
        sourceNodeId: source,
        ...(group ? { groupId: group } : {}),
      };
  }
  if (node.type === "image" || node.type === "model-3d")
    node.data.images = node.data.images.flatMap((r) => {
      const v = ref(r, "images");
      return v ? [v] : [];
    });
  if (node.type === "video") {
    node.data.references = node.data.references.flatMap((r) => {
      const v = ref(r, "references");
      return v ? [v] : [];
    });
    if (node.data.referenceMentions)
      node.data.referenceMentions = Object.fromEntries(
        Object.entries(node.data.referenceMentions).flatMap(([k, r]) => {
          const v = ref(r, "references");
          return v ? [[k, v]] : [];
        }),
      );
  }
  if (
    (node.type === "text" || node.type === "document") &&
    node.data.references
  )
    node.data.references = node.data.references.flatMap((r) => {
      const v = ref(r, "references");
      return v?.type === "node" ? [v] : [];
    });
  if (
    (node.type === "image" ||
      node.type === "video" ||
      node.type === "model-3d" ||
      node.type === "speech" ||
      node.type === "sound-effect" ||
      node.type === "music") &&
    node.data.promptSource
  ) {
    const v = ref(node.data.promptSource, "promptSource");
    if (v?.type === "node") node.data.promptSource = v;
    else delete node.data.promptSource;
  }
  if (
    (node.type === "model-3d" || node.type === "animate-3d") &&
    node.data.source
  ) {
    const v = ref(node.data.source, "source");
    if (v) node.data.source = v;
    else delete node.data.source;
  }
}
export function duplicateBoardFragment(
  board: AssetCanvasDocument,
  offset = { x: 96, y: 96 },
  newId = () => crypto.randomUUID(),
): AssetCanvasDocument {
  const out = structuredClone(board),
    ids = new Map(
      [...out.nodes, ...(out.groups ?? [])].map((n) => [n.id, newId()]),
    );
  for (const node of out.nodes) {
    node.id = ids.get(node.id)!;
    node.position.x += offset.x;
    node.position.y += offset.y;
    if (node.groupId) node.groupId = ids.get(node.groupId);
    remapNode(node, ids);
  }
  for (const group of out.groups ?? []) {
    group.id = ids.get(group.id)!;
    if (group.parentId) group.parentId = ids.get(group.parentId);
  }
  out.edges = out.edges
    .filter((e) => ids.has(e.source) && ids.has(e.target))
    .map((e) => ({
      ...e,
      id: newId(),
      source: ids.get(e.source)!,
      target: ids.get(e.target)!,
    }));
  out.editorLayout.nodes = Object.fromEntries(
    out.nodes.map((n) => [
      n.id,
      {
        ...board.editorLayout.nodes[[...ids].find(([, id]) => id === n.id)![0]],
        ...n.position,
      },
    ]),
  );
  if (board.editorLayout.groups)
    out.editorLayout.groups = Object.fromEntries(
      Object.entries(board.editorLayout.groups)
        .filter(([id]) => ids.has(id))
        .map(([id, p]) => [
          ids.get(id)!,
          { ...p, x: p.x + offset.x, y: p.y + offset.y },
        ]),
    );
  return out;
}
export function groupFragment(
  board: AssetCanvasDocument,
  groupId: string,
): AssetCanvasDocument {
  if (!board.groups?.some((g) => g.id === groupId))
    throw new Error("Group not found");
  const ids = groupDescendants(board.groups, groupId),
    out = structuredClone(board);
  delete (out as AssetCanvasDocument & { id?: string }).id;
  out.groups = out.groups!.filter((g) => ids.has(g.id));
  delete out.groups.find((g) => g.id === groupId)!.parentId;
  out.nodes = out.nodes.filter((n) => n.groupId && ids.has(n.groupId));
  const nodes = new Set(out.nodes.map((n) => n.id));
  out.edges = out.edges.filter(
    (e) => nodes.has(e.source) && nodes.has(e.target),
  );
  out.editorLayout.nodes = Object.fromEntries(
    Object.entries(out.editorLayout.nodes).filter(([id]) => nodes.has(id)),
  );
  out.editorLayout.groups = Object.fromEntries(
    Object.entries(out.editorLayout.groups ?? {}).filter(([id]) => ids.has(id)),
  );
  return out;
}
export function captureWorkflow(
  board: AssetCanvasDocument,
  groupId: string,
  name: string,
): WorkflowTemplate {
  const fragment = groupFragment(board, groupId),
    ids = new Map(fragment.nodes.map((n) => [n.id, n.id]));
  const template: WorkflowTemplate = {
    id: crypto.randomUUID(),
    name,
    revision: 1,
    kind: "workflow",
    prompt: "",
    variables: [],
    inputs: [],
    board: fragment,
    documents: [],
    tables: [],
  };
  const inputs = new Set<string>();
  for (const node of fragment.nodes) {
    if (node.type !== "asset" && "assetId" in node.data)
      delete node.data.assetId;
    delete node.template;
    delete node.standardId;
    remapNode(node, ids, (ref, field) => {
      const key = `${node.id}:${field}:${ref.type === "node" ? ref.nodeId : ref.assetId}`;
      if (!inputs.has(key)) {
        inputs.add(key);
        const original = board.nodes.find((n) => n.id === node.id);
        const references =
          original && field in original.data
            ? (original.data as unknown as Record<string, unknown>)[field]
            : undefined;
        const index = Array.isArray(references)
          ? references.findIndex(
              (r) => JSON.stringify(r) === JSON.stringify(ref),
            )
          : -1;
        template.inputs.push({
          ...(index >= 0 ? { index } : {}),
          name: `input_${template.inputs.length + 1}`,
          nodeId: node.id,
          field,
          mediaType:
            field === "promptSource"
              ? "text"
              : field === "source"
                ? "model"
                : field === "images" || node.type === "video"
                  ? "image"
                  : (() => {
                      const target =
                        ref.type === "node"
                          ? board.nodes.find((n) => n.id === ref.nodeId)
                          : undefined;
                      return target?.type === "image" ||
                        (target?.type === "asset" &&
                          target.data.mediaType === "image")
                        ? "image"
                        : "text";
                    })(),
        });
      }
      return undefined;
    });
  }
  for (const group of fragment.groups ?? []) delete group.standardId;
  return template;
}
export function instantiateWorkflow(
  template: WorkflowTemplate,
  values: Record<string, string>,
  bindings: Record<string, string>,
  offset = { x: 96, y: 96 },
): AssetCanvasDocument {
  if (!template.board) throw new Error("Workflow board is missing");
  for (const v of template.variables)
    if (v.required && !(values[v.name] ?? v.defaultValue).trim())
      throw new Error(`Missing template variable: ${v.name}`);
  const board = structuredClone(template.board);
  for (const input of template.inputs) {
    const value = bindings[input.name]?.trim();
    if (!value) throw new Error(`Missing input: ${input.name}`);
    const node = board.nodes.find((n) => n.id === input.nodeId);
    if (!node) throw new Error("Template input node not found");
    if (input.mediaType === "text") {
      const source: AssetCanvasNode = {
        id: crypto.randomUUID(),
        type: "text",
        position: { x: node.position.x - 550, y: node.position.y },
        ...(node.groupId ? { groupId: node.groupId } : {}),
        data: { text: value, instruction: "" },
      };
      board.nodes.push(source);
      board.editorLayout.nodes[source.id] = source.position;
      if (
        input.field === "promptSource" &&
        (node.type === "image" ||
          node.type === "video" ||
          node.type === "model-3d" ||
          node.type === "speech" ||
          node.type === "sound-effect" ||
          node.type === "music")
      )
        node.data.promptSource = { type: "node", nodeId: source.id };
      else if (
        (node.type === "text" || node.type === "document") &&
        input.field === "references"
      )
        (node.data.references ??= []).splice(
          input.index ?? node.data.references.length,
          0,
          { type: "node", nodeId: source.id },
        );
    } else {
      const ref = { type: "library" as const, assetId: value };
      if (
        input.field === "images" &&
        (node.type === "image" || node.type === "model-3d")
      )
        node.data.images.splice(input.index ?? node.data.images.length, 0, ref);
      else if (input.field === "references" && node.type === "video")
        node.data.references.splice(
          input.index ?? node.data.references.length,
          0,
          ref,
        );
      else if (
        input.field === "references" &&
        (node.type === "text" || node.type === "document")
      ) {
        const source: AssetCanvasNode = {
          id: crypto.randomUUID(),
          type: "asset",
          position: { x: node.position.x - 550, y: node.position.y },
          ...(node.groupId ? { groupId: node.groupId } : {}),
          data: { assetId: value, mediaType: input.mediaType },
        };
        board.nodes.push(source);
        board.editorLayout.nodes[source.id] = source.position;
        (node.data.references ??= []).splice(
          input.index ?? node.data.references.length,
          0,
          { type: "node", nodeId: source.id },
        );
      } else if (
        input.field === "source" &&
        (node.type === "model-3d" || node.type === "animate-3d")
      )
        node.data.source = ref;
    }
  }
  for (const node of board.nodes) {
    if ("prompt" in node.data)
      node.data.prompt = renderPrompt(
        { ...template, prompt: node.data.prompt ?? "" },
        values,
      );
    if (node.type === "speech")
      node.data.text = renderPrompt(
        { ...template, prompt: node.data.text },
        values,
      );
    if (node.type === "text")
      node.data.instruction = renderPrompt(
        { ...template, prompt: node.data.instruction ?? "" },
        values,
      );
    node.template = { id: template.id, revision: template.revision };
  }
  const out = duplicateBoardFragment(board, offset);
  validateAssetCanvasDocument(out);
  return out;
}
export const BUILTIN_WORKFLOWS: WorkflowTemplate[] = [
  "object-views",
  "character-sheet",
  "reference-3d",
  "ui-icons",
].map((id) => {
  const board = createAssetCanvasDocument();
  board.version = 2;
  board.groups = [{ id: "production", name: id, color: "#7c6fe0" }];
  board.editorLayout.groups = { production: { x: 32, y: 32 } };
  const prompts =
    id === "object-views"
      ? [
          "Front orthographic view of {{subject}}",
          "Side orthographic view of {{subject}}",
          "Back orthographic view of {{subject}}",
        ]
      : id === "character-sheet"
        ? [
            "Character reference sheet of {{subject}}, consistent identity, full body front, side and back views, neutral pose",
          ]
        : id === "reference-3d"
          ? ["Create a 3D model of {{subject}} from the reference image"]
          : [
              "Game UI icon sheet for {{subject}}, consistent silhouette, readable at small sizes, transparent background",
            ];
  board.nodes = prompts.map((prompt, i) => {
    const n = createAssetGenerationNode(
      id === "reference-3d" ? "model-3d" : "image",
      { x: 96 + i * 560, y: 96 },
    );
    n.id = `step_${i}`;
    n.data.prompt = prompt;
    n.groupId = "production";
    n.title = id === "object-views" ? ["Front", "Side", "Back"][i] : id;
    return n;
  });
  board.editorLayout.nodes = Object.fromEntries(
    board.nodes.map((n) => [n.id, n.position]),
  );
  return {
    id,
    name: id,
    kind: "workflow",
    revision: 1,
    prompt: "",
    variables: [
      {
        name: "subject",
        description: "Subject / character identity",
        defaultValue: "",
        required: true,
      },
    ],
    inputs:
      id === "reference-3d"
        ? [
            {
              name: "reference",
              nodeId: "step_0",
              field: "images",
              mediaType: "image",
            },
          ]
        : [],
    board,
    documents: [],
    tables: [],
  };
});
