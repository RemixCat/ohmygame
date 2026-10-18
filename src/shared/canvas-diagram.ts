import type {
  AssetCanvasNode,
  AssetCanvasEdge,
  AssetCanvasPosition,
} from "./contracts.js";

export type TopicNode = Extract<AssetCanvasNode, { type: "topic" }>;
export const TOPIC_COLORS = [
  "blue",
  "green",
  "orange",
  "purple",
  "gray",
] as const;
export const TOPIC_SHAPES = ["card", "rounded", "pill"] as const;
export const TOPIC_WIDTH = 224;
export const TOPIC_HEIGHT = 128;

export function createTopic(
  text: string,
  position: AssetCanvasPosition,
  color: TopicNode["data"]["color"] = "blue",
): TopicNode {
  return {
    id: crypto.randomUUID(),
    type: "topic",
    position,
    data: { text, color, shape: "rounded" },
  };
}
export function diagramEdge(
  source: string,
  target: string,
  directed = true,
): AssetCanvasEdge {
  return {
    id: crypto.randomUUID(),
    source,
    target,
    sourceHandle: "out",
    kind: "diagram",
    directed,
  };
}
/** Work on the selected connected diagram only, leaving other diagrams and media untouched. */
export function diagramComponent(
  nodes: readonly AssetCanvasNode[],
  edges: readonly AssetCanvasEdge[],
  seed: string,
): { nodes: TopicNode[]; edges: AssetCanvasEdge[] } {
  const topics = nodes.filter((n): n is TopicNode => n.type === "topic");
  const ids = new Set(topics.map((n) => n.id));
  if (!ids.has(seed)) return { nodes: [], edges: [] };
  const links = edges.filter(
    (e) => e.kind === "diagram" && ids.has(e.source) && ids.has(e.target),
  );
  const neighbors = new Map(topics.map((n) => [n.id, [] as string[]]));
  for (const edge of links) {
    neighbors.get(edge.source)!.push(edge.target);
    neighbors.get(edge.target)!.push(edge.source);
  }
  const visited = new Set([seed]),
    queue = [seed];
  for (let i = 0; i < queue.length; i++)
    for (const id of neighbors.get(queue[i]!) ?? [])
      if (!visited.has(id)) {
        visited.add(id);
        queue.push(id);
      }
  return {
    nodes: topics.filter((n) => visited.has(n.id)),
    edges: links.filter((e) => visited.has(e.source) && visited.has(e.target)),
  };
}

/** Cycle-safe spanning forest; shared/cross links stay intact rather than being rewritten into a tree. */
export function layoutDiagram(
  nodes: readonly TopicNode[],
  edges: readonly AssetCanvasEdge[],
  mode: "tree" | "layers",
): Map<string, AssetCanvasPosition> {
  const result = new Map<string, AssetCanvasPosition>();
  if (!nodes.length) return result;
  const ids = new Set(nodes.map((n) => n.id)),
    incoming = new Set<string>();
  const outgoing = new Map(nodes.map((n) => [n.id, [] as string[]]));
  for (const e of edges)
    if (e.kind === "diagram" && ids.has(e.source) && ids.has(e.target)) {
      outgoing.get(e.source)!.push(e.target);
      incoming.add(e.target);
    }
  const order = [...nodes.filter((n) => !incoming.has(n.id)), ...nodes];
  const depth = new Map<string, number>(),
    children = new Map<string, string[]>(),
    roots: string[] = [],
    visit: string[] = [];
  for (const root of order) {
    if (depth.has(root.id)) continue;
    roots.push(root.id);
    depth.set(root.id, 0);
    const queue = [root.id];
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i]!;
      visit.push(id);
      children.set(id, []);
      for (const next of outgoing.get(id)!)
        if (!depth.has(next)) {
          depth.set(next, depth.get(id)! + 1);
          children.get(id)!.push(next);
          queue.push(next);
        }
    }
  }
  const left = Math.min(...nodes.map((n) => n.position.x)),
    top = Math.min(...nodes.map((n) => n.position.y));
  const span = new Map<string, number>();
  for (const id of [...visit].reverse())
    span.set(
      id,
      Math.max(
        1,
        children.get(id)!.reduce((sum, child) => sum + span.get(child)!, 0),
      ),
    );
  if (mode === "tree") {
    let offset = 0;
    const queue: Array<[string, number]> = roots.map((id) => {
      const item: [string, number] = [id, offset];
      offset += span.get(id)!;
      return item;
    });
    for (let i = 0; i < queue.length; i++) {
      const [id, start] = queue[i]!;
      result.set(id, {
        x: left + depth.get(id)! * 320,
        y: top + (start + (span.get(id)! - 1) / 2) * 176,
      });
      let next = start;
      for (const child of children.get(id)!) {
        queue.push([child, next]);
        next += span.get(child)!;
      }
    }
  } else {
    const levels = new Map<number, string[]>();
    for (const id of visit) {
      const level = depth.get(id)!;
      if (!levels.has(level)) levels.set(level, []);
      levels.get(level)!.push(id);
    }
    // Keep cross-linked peers adjacent so a feedback loop need not cross an unrelated card.
    const peers = new Map(nodes.map((node) => [node.id, [] as string[]]));
    for (const edge of edges)
      if (
        ids.has(edge.source) &&
        ids.has(edge.target) &&
        depth.get(edge.source) === depth.get(edge.target)
      ) {
        peers.get(edge.source)!.push(edge.target);
        peers.get(edge.target)!.push(edge.source);
      }
    for (const [level, members] of levels) {
      const seen = new Set<string>();
      let row = 0;
      for (const first of members) {
        if (seen.has(first)) continue;
        const queue = [first];
        seen.add(first);
        for (let i = 0; i < queue.length; i++) {
          const id = queue[i]!;
          result.set(id, { x: left + level * 320, y: top + row++ * 176 });
          for (const next of peers.get(id)!)
            if (!seen.has(next)) {
              seen.add(next);
              queue.push(next);
            }
        }
      }
    }
  }
  return result;
}

export function relatedTopic(
  nodes: readonly AssetCanvasNode[],
  edges: readonly AssetCanvasEdge[],
  sourceId: string,
  sibling: boolean,
  text: string,
): { node: TopicNode; edge?: AssetCanvasEdge } | undefined {
  const source = nodes.find(
    (n): n is TopicNode => n.id === sourceId && n.type === "topic",
  );
  if (!source) return;
  const parentId = sibling
    ? edges.find(
        (e) =>
          e.kind === "diagram" && e.directed !== false && e.target === sourceId,
      )?.source
    : sourceId;
  const parent = nodes.find((n) => n.id === parentId && n.type === "topic");
  const position = {
    x: parent ? parent.position.x + 320 : source.position.x,
    y: source.position.y + (sibling ? 176 : 0),
  };
  // Fixed card bounds and a margin prevent repeated quick-add from stacking nodes.
  while (
    nodes.some(
      (n) =>
        Math.abs(n.position.x - position.x) < TOPIC_WIDTH + 32 &&
        Math.abs(n.position.y - position.y) < TOPIC_HEIGHT + 32,
    )
  )
    position.y += 176;
  const node = createTopic(text, position, source.data.color);
  if (source.groupId) node.groupId = source.groupId;
  return { node, ...(parent ? { edge: diagramEdge(parent.id, node.id) } : {}) };
}

/** Stable safe identifiers and quoted labels keep user text out of Mermaid syntax. */
export function exportDiagram(
  nodes: readonly TopicNode[],
  edges: readonly AssetCanvasEdge[],
  format: "mermaid" | "markdown",
): string {
  const ids = new Map(nodes.map((n, i) => [n.id, `n${i}`]));
  const links = edges.filter(
    (e) => e.kind === "diagram" && ids.has(e.source) && ids.has(e.target),
  );
  const escape = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/\|/g, "&#124;")
      .replace(/\r?\n/g, "<br/>");
  if (format === "mermaid")
    return [
      "flowchart LR",
      ...nodes.map((n) => `  ${ids.get(n.id)}["${escape(n.data.text)}"]`),
      ...links.map(
        (e) =>
          `  ${ids.get(e.source)} ${e.directed === false ? "---" : "-->"}${e.label ? `|"${escape(e.label)}"|` : ""} ${ids.get(e.target)}`,
      ),
    ].join("\n");
  const clean = (s: string) =>
    s.replace(/\r?\n/g, " ").replace(/([\\`*_\[\]<>#|])/g, "\\$1");
  return [
    "# Diagram",
    "",
    ...nodes.map((n) => `- **${ids.get(n.id)}**: ${clean(n.data.text)}`),
    "",
    "## Relationships",
    "",
    ...links.map(
      (e) =>
        `- ${ids.get(e.source)} ${e.directed === false ? "—" : "→"} ${ids.get(e.target)}${e.label ? `: ${clean(e.label)}` : ""}`,
    ),
  ].join("\n");
}
