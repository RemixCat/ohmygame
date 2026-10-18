import { describe, expect, it } from "vitest";
import {
  createTopic,
  diagramEdge,
  diagramComponent,
  layoutDiagram,
  relatedTopic,
  exportDiagram,
} from "../src/shared/canvas-diagram.js";
import {
  createAssetCanvasDocument,
  isAssetCanvasDocument,
} from "../src/shared/asset-canvas.js";
import {
  createCanvasClipboard,
  parseCanvasClipboard,
  duplicateCanvasSelection,
} from "../src/renderer/asset-canvas-clipboard.js";
import {
  diagramFlowEdges,
  persistCanvasEdge,
  separateDiagramLabels,
} from "../src/renderer/canvas-diagram.js";
import {
  toAssetCanvasNode,
  connectionRelation,
} from "../src/renderer/asset-canvas-workspace.js";

const topic = (id: string, x = 0, y = 0) => ({
  ...createTopic(id, { x, y }),
  id,
});
function board() {
  const b = createAssetCanvasDocument();
  b.nodes = [topic("root"), topic("child", 320, 0)];
  b.edges = [
    { ...diagramEdge("root", "child"), label: "requires", directed: false },
  ];
  b.editorLayout.nodes = Object.fromEntries(
    b.nodes.map((n) => [n.id, n.position]),
  );
  return b;
}
describe("native canvas diagrams", () => {
  it("validates topic content and relationship semantics without accepting generation wires", () => {
    const b = board();
    expect(isAssetCanvasDocument(b)).toBe(true);
    const invalid = structuredClone(b);
    delete invalid.edges[0]!.kind;
    expect(isAssetCanvasDocument(invalid)).toBe(false);
    const self = structuredClone(b);
    self.edges[0]!.target = "root";
    expect(isAssetCanvasDocument(self)).toBe(false);
    const media = structuredClone(b);
    media.nodes[1] = {
      id: "child",
      type: "text",
      position: { x: 320, y: 0 },
      data: { text: "notes", instruction: "" },
    };
    expect(isAssetCanvasDocument(media)).toBe(false);
    const long = structuredClone(b);
    long.edges[0]!.label = "x".repeat(201);
    expect(isAssetCanvasDocument(long)).toBe(false);
    const longTopic = structuredClone(b);
    longTopic.nodes[0]!.data = { text: "x".repeat(2001) };
    expect(isAssetCanvasDocument(longTopic)).toBe(false);
  });
  it("retains labels, direction and appearance across renderer serialization and clipboard duplication", () => {
    const b = board();
    const edges = diagramFlowEdges(b.edges);
    expect(edges[0]!.markerEnd).toBe("");
    expect(edges.map(persistCanvasEdge)).toEqual(b.edges);
    const saved = toAssetCanvasNode({
      id: "styled",
      type: "topic",
      position: { x: 0, y: 0 },
      data: { text: "UI", topicColor: "purple", topicShape: "pill" },
    });
    expect(saved.data).toEqual({ text: "UI", color: "purple", shape: "pill" });
    const copy = parseCanvasClipboard(
      JSON.stringify(createCanvasClipboard("p", b.nodes, b.edges)),
    );
    expect(copy).toBeDefined();
    const duplicated = duplicateCanvasSelection(copy!.nodes, copy!.edges, {
      x: 800,
      y: 400,
    });
    expect(duplicated.edges[0]).toMatchObject({
      kind: "diagram",
      label: "requires",
      directed: false,
      source: duplicated.nodes[0]!.id,
      target: duplicated.nodes[1]!.id,
    });
  });
  it("only permits topic-to-topic wires, keeping topics out of media generation inputs", () => {
    const a = {
        id: "a",
        type: "topic" as const,
        position: { x: 0, y: 0 },
        data: { text: "a" },
      },
      b = { ...a, id: "b" };
    expect(connectionRelation(a, b, "out", [a, b], [], [])).toBe("diagram");
    expect(connectionRelation(a, a, "out", [a], [], [])).toBeUndefined();
    expect(
      connectionRelation(
        a,
        { id: "i", type: "image", position: { x: 0, y: 0 }, data: {} },
        "out",
        [a],
        [],
        [],
      ),
    ).toBeUndefined();
  });
  it("scopes layout and export to the selected connected component", () => {
    const nodes = [topic("a"), topic("b"), topic("isolated")];
    const links = [diagramEdge("a", "b")];
    const c = diagramComponent(nodes, links, "a");
    expect(c.nodes.map((n) => n.id)).toEqual(["a", "b"]);
    expect(exportDiagram(c.nodes, c.edges, "mermaid")).not.toContain(
      "isolated",
    );
    expect(diagramComponent(nodes, links, "missing").nodes).toEqual([]);
  });
  it("arranges branches without overlap and terminates on cross-links and cycles", () => {
    const nodes = [
      topic("a"),
      topic("b"),
      topic("c"),
      topic("d"),
      topic("isolated"),
    ];
    const edges = [
      diagramEdge("a", "b"),
      diagramEdge("a", "c"),
      diagramEdge("b", "d"),
      diagramEdge("c", "d"),
      diagramEdge("d", "a"),
    ];
    const before = structuredClone(nodes);
    for (const mode of ["tree", "layers"] as const) {
      const positions = layoutDiagram(nodes, edges, mode);
      expect(positions.size).toBe(nodes.length);
      expect(
        new Set([...positions.values()].map((p) => `${p.x},${p.y}`)).size,
      ).toBe(nodes.length);
      expect(positions.get("b")!.x).toBeGreaterThan(positions.get("a")!.x);
      for (const a of positions.values())
        for (const b of positions.values())
          if (a !== b)
            expect(
              Math.abs(a.x - b.x) >= 224 || Math.abs(a.y - b.y) >= 128,
            ).toBe(true);
    }
    expect(nodes).toEqual(before);
    expect(edges).toHaveLength(5);
  });
  it("handles deep graphs without recursive stack overflow", () => {
    const nodes = Array.from({ length: 2000 }, (_, i) => topic(String(i)));
    const edges = nodes.slice(1).map((n, i) => diagramEdge(String(i), n.id));
    edges.push(diagramEdge("1999", "0"));
    expect(layoutDiagram(nodes, edges, "tree").size).toBe(2000);
  });
  it("quick-add avoids occupied cards and siblings retain their existing parent", () => {
    const b = board();
    const child = relatedTopic(b.nodes, b.edges, "root", false, "new")!;
    expect(child.node.position).toEqual({ x: 320, y: 176 });
    expect(child.edge).toMatchObject({
      source: "root",
      target: child.node.id,
      kind: "diagram",
    });
    b.edges[0]!.directed = true;
    const sibling = relatedTopic(b.nodes, b.edges, "child", true, "sibling")!;
    expect(sibling.edge?.source).toBe("root");
    const independent = relatedTopic(b.nodes, b.edges, "root", true, "other")!;
    expect(independent.edge).toBeUndefined();
    expect(independent.node.position.y).toBe(176);
  });
  it("exports escaped labels with safe identifiers and retains cyclic/undirected relationships", () => {
    const nodes = [topic('a"evil'), topic("b")];
    nodes[0]!.data.text = '[title] "quote" <script> |\nnew';
    const edges = [
      { ...diagramEdge(nodes[0]!.id, "b", false), label: 'needs "UI" | stuff' },
      diagramEdge("b", nodes[0]!.id),
    ];
    const output = exportDiagram(nodes, edges, "mermaid");
    expect(output).toContain(
      'n0["[title] &quot;quote&quot; &lt;script&gt; &#124;<br/>new"]',
    );
    expect(output).toContain('n0 ---|"needs &quot;UI&quot; &#124; stuff"| n1');
    expect(output).toContain("n1 --> n0");
    expect(output).not.toContain('a"evil');
    expect(exportDiagram(nodes, edges, "markdown")).toContain("n0 — n1");
  });
});

it("updates generated diagram guidance once while preserving custom agent instructions", async () => {
  const { mkdtemp, mkdir, writeFile, readFile, rm } =
    await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const { ensureCanvasContract } =
    await import("../src/daemon/canvas-workspace.js");
  const root = await mkdtemp(path.join(tmpdir(), "canvas-diagram-contract-"));
  try {
    await mkdir(path.join(root, "canvas"));
    await writeFile(
      path.join(root, "canvas/AGENTS.md"),
      "# Custom project rules\nKeep our conventions.\n",
    );
    await writeFile(
      path.join(root, "canvas/README.md"),
      "# Canvas workspace\nOld generated guide.\n",
    );
    await ensureCanvasContract(root);
    await ensureCanvasContract(root);
    expect(await readFile(path.join(root, "canvas/AGENTS.md"), "utf8")).toBe(
      "# Custom project rules\nKeep our conventions.\n",
    );
    const guide = await readFile(path.join(root, "canvas/README.md"), "utf8");
    expect(guide.match(/## Diagram topics/g)).toHaveLength(1);
    expect(guide).toContain('kind "diagram"');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("separates feedback-loop labels without adding view styling to saved relationships", () => {
  const edges = [
    { ...diagramEdge("a", "b"), label: "input" },
    { ...diagramEdge("b", "a"), label: "feedback" },
  ];
  const display = separateDiagramLabels(diagramFlowEdges(edges));
  expect(display[0]!.labelStyle?.transform).not.toBe(
    display[1]!.labelStyle?.transform,
  );
  expect(display.map(persistCanvasEdge)).toEqual(edges);
});
