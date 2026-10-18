// @vitest-environment happy-dom
import path from "node:path";
import { act, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import type { Node } from "@xyflow/react";
import type { EditorCanvas } from "../src/renderer/editor-canvas.js";
import type { CanvasBoardStorage } from "../src/renderer/canvas-board-storage.js";
import type { CanvasDocuments } from "../src/renderer/canvas-document-node.js";
import {
  createAssetCanvasDocument,
  isAssetCanvasDocument,
} from "../src/shared/asset-canvas.js";
import type {
  AssetCanvasDocument,
  ProjectState,
} from "../src/shared/contracts.js";
let captured: Parameters<typeof EditorCanvas<Node>>[0];
vi.doMock(path.resolve("src/renderer/editor-canvas.tsx"), async (original) => ({
  ...(await original<typeof import("../src/renderer/editor-canvas.js")>()),
  EditorCanvas: (props: typeof captured) => {
    captured = props;
    return (
      <div>
        {props.nodes
          .filter((n) => n.type === "topic")
          .map((n) => {
            const Component = props.nodeTypes!.topic!;
            return (
              <div className="react-flow__node" data-id={n.id} key={n.id}>
                <Component {...(n as any)} />
              </div>
            );
          })}
      </div>
    );
  },
}));
vi.doMock("@xyflow/react", async (original) => ({
  ...(await original<typeof import("@xyflow/react")>()),
  Handle: () => null,
}));
vi.doMock(
  path.resolve("src/renderer/model-selector.tsx"),
  async (original) => ({
    ...(await original<typeof import("../src/renderer/model-selector.js")>()),
    useAgentModels: () => ({ models: [], status: "ready" }),
  }),
);
vi.doMock(path.resolve("src/renderer/api.ts"), async (original) => ({
  ...(await original<typeof import("../src/renderer/api.js")>()),
  listImageModelCatalog: async () => ({ models: [], providers: [] }),
  listVideoModelCatalog: async () => ({ models: [], providers: [] }),
  listModel3DCatalog: async () => ({ models: [], providers: [] }),
  listModel3DOperations: async () => [],
  listAudioModelCatalog: async () => ({ models: [], providers: [] }),
}));
vi.doMock(path.resolve("src/renderer/library-assets.ts"), async (original) => ({
  ...(await original<typeof import("../src/renderer/library-assets.js")>()),
  loadLibraryAssets: async () => [],
}));
const { CanvasBoardEditor } =
  await import("../src/renderer/asset-canvas-workspace.js");
const { CanvasTableStorage } =
  await import("../src/renderer/canvas-table-storage.js");
let root: ReturnType<typeof createRoot>,
  host: HTMLDivElement,
  flush: (() => Promise<void>) | undefined;
const generate = vi.fn(),
  save = vi.fn(async (b: AssetCanvasDocument) => structuredClone(b));
const settle = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
async function mount(b = createAssetCanvasDocument()) {
  const storage: CanvasBoardStorage = {
    key: "p:b",
    boardId: "b",
    load: async () => structuredClone(b),
    save,
    refresh: async () => undefined,
    reconcile: (_submitted, current) => current,
    resolveConflict: async (_v, value) => value,
    jobs: async () => [],
    generate,
    cancel: vi.fn(),
  };
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      <CanvasBoardEditor
        project={{ id: "p", type: "asset-canvas" } as ProjectState}
        storage={storage}
        documents={{ documents: [] } as unknown as CanvasDocuments}
        tables={{
          storage: new CanvasTableStorage("p"),
          open: vi.fn(),
          add: vi.fn(),
        }}
        assets={[]}
        onSaveReady={(fn) => {
          flush = fn;
        }}
      />,
    ),
  );
  await settle();
}
beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  save.mockClear();
  generate.mockClear();
  await mount();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function add() {
  await act(async () => {
    (captured.addControl as ReactElement<{ onAdd: Function }>).props.onAdd(
      "topic",
      { x: 0, y: 0 },
    );
  });
  await settle();
}
const node = () =>
  host.querySelector<HTMLElement>(".canvas-topic.is-selected")!;
const press = async (key: string, extra = {}) =>
  act(async () => {
    node().dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
        ...extra,
      }),
    );
  });
it("creates a real diagram, quick-adds by keyboard, saves relationships and never calls generation", async () => {
  await add();
  expect(captured.nodes).toHaveLength(3);
  expect(captured.edges).toHaveLength(2);
  await press("Tab");
  await settle();
  expect(captured.nodes).toHaveLength(4);
  expect(captured.edges).toHaveLength(3);
  await press("Enter");
  await settle();
  expect(captured.nodes).toHaveLength(5);
  expect(captured.edges).toHaveLength(4);
  await act(async () => {
    await flush!();
  });
  const b = save.mock.lastCall![0];
  expect(isAssetCanvasDocument(b)).toBe(true);
  expect(b.edges.every((e) => e.kind === "diagram")).toBe(true);
  expect(generate).not.toHaveBeenCalled();
  await act(async () => root.unmount());
  host.remove();
  await mount(b);
  expect(captured.nodes).toHaveLength(5);
  expect(captured.edges!.every((e) => e.data?.diagram)).toBe(true);
});
it("keeps editing durable before blur, cancels on Escape and ignores IME Enter", async () => {
  await add();
  await press(" ");
  const field = host.querySelector<HTMLTextAreaElement>(
    ".canvas-topic textarea",
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(field, "游戏系统");
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    await flush!();
  });
  expect(
    save.mock.lastCall![0].nodes.some(
      (n) => n.type === "topic" && n.data.text === "游戏系统",
    ),
  ).toBe(true);
  await act(async () =>
    field.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        isComposing: true,
        bubbles: true,
      }),
    ),
  );
  expect(host.querySelector(".canvas-topic textarea")).not.toBeNull();
  await act(async () =>
    field.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  await settle();
  expect(host.querySelector(".canvas-topic textarea")).toBeNull();
  expect(
    save.mock.lastCall![0].nodes.some(
      (n) => n.type === "topic" && n.data.text === "Central topic",
    ),
  ).toBe(true);
});
it("undo/redo restores relationship metadata and deletion removes wires without removing descendants", async () => {
  await add();
  await press("Tab");
  await settle();
  const last = captured.nodes.find((n) => n.selected)!;
  await act(async () => {
    captured.onNodesChange!([{ type: "remove", id: last.id }]);
    captured.onNodesDelete!([last]);
  });
  await settle();
  expect(captured.nodes).toHaveLength(3);
  expect(captured.edges).toHaveLength(2);
  const target = host.querySelector<HTMLElement>(".react-flow__node")!;
  await act(async () =>
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key: "z", metaKey: true, bubbles: true }),
    ),
  );
  await settle();
  expect(captured.nodes).toHaveLength(4);
  expect(captured.edges!.every((e) => e.data?.diagram)).toBe(true);
  await act(async () => {
    await flush!();
  });
  expect(save.mock.lastCall![0].edges.every((e) => e.kind === "diagram")).toBe(
    true,
  );
  await act(async () =>
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "z",
        metaKey: true,
        shiftKey: true,
        bubbles: true,
      }),
    ),
  );
  await settle();
  expect(captured.nodes).toHaveLength(3);
});

it("edits relationship labels and direction through the graph dialog and persists appearance", async () => {
  await add();
  const selected = captured.nodes.find((n) => n.selected)!;
  await act(async () => {
    (selected.data.topicRuntime as any).tools();
  });
  const color = document.querySelector<HTMLSelectElement>(
    '[aria-label="Color"]',
  )!;
  await act(async () => {
    color.value = "purple";
    color.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const field = document.querySelector<HTMLInputElement>(
    '.canvas-diagram-dialog input:not([type="checkbox"])',
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(field, "requires");
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    document
      .querySelector<HTMLInputElement>(
        '.canvas-diagram-dialog input[type="checkbox"]',
      )!
      .click();
  });
  await act(async () => {
    await flush!();
  });
  const saved = save.mock.lastCall![0];
  expect(saved.edges[0]).toMatchObject({
    kind: "diagram",
    label: "requires",
    directed: false,
  });
  expect(saved.nodes.find((n) => n.id === selected.id)?.data).toMatchObject({
    color: "purple",
  });
  expect(isAssetCanvasDocument(saved)).toBe(true);
});
