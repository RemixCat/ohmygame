// @vitest-environment happy-dom
import path from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Node } from "@xyflow/react";
import type { EditorCanvas } from "../src/renderer/editor-canvas.js";
import type { CanvasBoardStorage } from "../src/renderer/canvas-board-storage.js";
import type { CanvasDocuments } from "../src/renderer/canvas-document-node.js";
import type {
  ProjectState,
  AssetCanvasDocument,
  ToolJob,
  ImageModelCatalog,
} from "../src/shared/contracts.js";
import { createAssetCanvasDocument } from "../src/shared/asset-canvas.js";
import { t } from "../src/renderer/i18n.js";
type CanvasProps = Parameters<typeof EditorCanvas<Node>>[0];
let props: CanvasProps;
const imageModel = {
  provider: "test",
  id: "image",
  name: "Image",
  providerName: "Test",
  supportsReferenceImage: true,
  sizes: ["1024x1024"],
  generationOptions: [{ resolution: "1K", aspectRatio: "1:1" }],
  protocol: "openai-images",
  maxOutputs: 1,
};
const textModel = {
  provider: "test",
  id: "vision",
  name: "Vision",
  providerName: "Test",
  reasoningLevels: ["off"],
};
const otherImageModel = { ...imageModel, id: "other", name: "Other image" };
let imageCatalog: ImageModelCatalog;
let project: ProjectState;
vi.doMock(path.resolve("src/renderer/editor-canvas.tsx"), async (original) => ({
  ...(await original<typeof import("../src/renderer/editor-canvas.js")>()),
  EditorCanvas: (value: CanvasProps) => {
    props = value;
    return <div className="react-flow__pane" />;
  },
}));
vi.doMock(
  path.resolve("src/renderer/model-selector.tsx"),
  async (original) => ({
    ...(await original<typeof import("../src/renderer/model-selector.js")>()),
    useAgentModels: () => ({
      models: [textModel],
      defaultModel: { provider: "test", id: "vision" },
      defaultReasoningLevel: "off",
      status: "ready",
    }),
  }),
);
vi.doMock(path.resolve("src/renderer/api.ts"), async (original) => ({
  ...(await original<typeof import("../src/renderer/api.js")>()),
  listImageModelCatalog: async () => imageCatalog,
  listVideoModelCatalog: async () => ({ models: [], providers: [] }),
  listModel3DCatalog: async () => ({ models: [], providers: [] }),
  listModel3DOperations: async () => [],
}));
vi.doMock(path.resolve("src/renderer/library-assets.ts"), async (original) => ({
  ...(await original<typeof import("../src/renderer/library-assets.js")>()),
  loadLibraryAssets: async () => [],
}));
const recognize = vi.fn(async () => ({
  text: '[{"name":"Ship","description":"Metal ship","prompt":"One ship"},{"name":"Moon","description":"Round moon","prompt":"One moon"}]',
  model: { provider: "test", id: "vision" },
}));
vi.doMock(path.resolve("src/renderer/canvas-api.ts"), async (original) => ({
  ...(await original<typeof import("../src/renderer/canvas-api.js")>()),
  generateCanvasText: recognize,
}));
const { CanvasBoardEditor } =
  await import("../src/renderer/asset-canvas-workspace.js");
const { CanvasTableStorage } =
  await import("../src/renderer/canvas-table-storage.js");
let root: ReturnType<typeof createRoot>,
  container: HTMLDivElement,
  saved: AssetCanvasDocument;
const generate = vi.fn(async (nodeId: string): Promise<ToolJob> => ({
  id: nodeId,
  toolId: "generate-image",
  status: "succeeded",
  title: nodeId,
  createdAt: "",
  context: { nodeId, projectId: "p", boardId: "b" },
}));
let storage: CanvasBoardStorage;
beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  recognize.mockClear();
  generate.mockReset();
  generate.mockImplementation(async (nodeId) => ({
    id: nodeId,
    toolId: "generate-image",
    status: "succeeded",
    title: nodeId,
    createdAt: "",
    context: { nodeId, projectId: "p", boardId: "b" },
  }));
  imageCatalog = {
    models: [otherImageModel, imageModel] as ImageModelCatalog["models"],
    providers: [],
    defaultModel: { provider: "test", id: "image" },
  };
  project = { id: "p", type: "web-game" } as ProjectState;
  saved = createAssetCanvasDocument();
  saved.nodes = [
    {
      id: "source",
      type: "asset",
      title: "Ship",
      position: { x: 0, y: 0 },
      data: { assetId: "reference", mediaType: "image" },
    },
  ];
  saved.editorLayout.nodes.source = { x: 0, y: 0 };
  storage = {
    key: "p:b",
    boardId: "b",
    load: async () => structuredClone(saved),
    save: async (value) => {
      saved = structuredClone(value);
      return value;
    },
    refresh: async () => undefined,
    reconcile: (_submitted, current) => current,
    resolveConflict: async (_version, value) => value,
    jobs: async () => [],
    generate,
    cancel: vi.fn(),
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await mount();
});
async function mount() {
  await act(async () =>
    root.render(
      <CanvasBoardEditor
        project={project}
        storage={storage}
        documents={
          { documents: [], flush: async () => {} } as unknown as CanvasDocuments
        }
        tables={{
          storage: new CanvasTableStorage("p"),
          open: vi.fn(),
          add: vi.fn(),
        }}
        assets={[]}
      />,
    ),
  );
}
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (element) => element.textContent === label,
  )!;
const modelSelect = () =>
  container.querySelector<HTMLSelectElement>(
    ".canvas-quick-panel fieldset select",
  )!;
const refreshModels = async () => {
  await act(async () =>
    window.dispatchEvent(new Event("ohmygame-models-changed")),
  );
};
async function choose(kind: "objects" | "views" | "describe" | "model-3d") {
  await act(async () =>
    props.onOpenMenu({
      kind: "node",
      nodeId: "source",
      flowPosition: { x: 500, y: 0 },
      screenPosition: { x: 100, y: 100 },
    }),
  );
  await act(async () => button(t(`canvasQuick.${kind}`)).click());
}
it("creates three ordinary image nodes with shared source, independent prompts and one undo", async () => {
  await choose("views");
  expect(props.nodes.filter((node) => node.type === "image")).toHaveLength(3);
  const images = props.nodes.filter((node) => node.type === "image");
  expect(
    images.every(
      (node) =>
        JSON.stringify(node.data.images) ===
        '[{"type":"node","nodeId":"source"}]',
    ),
  ).toBe(true);
  expect(new Set(images.map((node) => node.data.prompt)).size).toBe(3);
  expect(generate).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(1));
  await act(async () =>
    props.onOpenMenu({
      kind: "pane",
      flowPosition: { x: 0, y: 0 },
      screenPosition: { x: 0, y: 0 },
    }),
  );
  await act(async () => button(t("assetCanvas.undo")).click());
  expect(props.nodes).toHaveLength(1);
});
it("recognizes without image requests, only generates checked items, and reloads their saved metadata", async () => {
  await choose("objects");
  expect(button(t("canvasQuick.run")).disabled).toBe(true);
  await act(async () => button(t("canvasQuick.recognize")).click());
  expect(recognize).toHaveBeenCalledOnce();
  expect(generate).not.toHaveBeenCalled();
  expect(saved.nodes.find((node) => node.type === "text")?.data).toMatchObject({
    references: [{ type: "node", nodeId: "source" }],
  });
  const checkbox = document.querySelector<HTMLInputElement>(
    'input[type="checkbox"]',
  )!;
  await act(async () => checkbox.click());
  expect(generate).not.toHaveBeenCalled();
  await act(async () => button(t("canvasQuick.run")).click());
  expect(generate).toHaveBeenCalledOnce();
  const outputs = props.nodes.filter((node) => node.type === "image");
  expect(outputs).toHaveLength(1);
  expect(outputs[0]).toMatchObject({
    title: "Ship",
    data: { images: [{ type: "node", nodeId: "source" }] },
  });
  await act(async () => vi.advanceTimersByTimeAsync(500));
  await act(async () => root.unmount());
  root = createRoot(container);
  await mount();
  const controller = props.nodes.find(
    (node) => node.type === "text",
  )! as Node & { quickAction: { objects: { selected: boolean }[] } };
  expect(controller.quickAction.objects.map((item) => item.selected)).toEqual([
    true,
    false,
  ]);
  expect(props.nodes.filter((node) => node.type === "image")).toHaveLength(1);
});
it("creates linked description and 3D nodes without invoking generation", async () => {
  await choose("describe");
  expect(props.nodes.at(-1)?.data.references).toEqual([
    { type: "node", nodeId: "source" },
  ]);
  await choose("model-3d");
  expect(props.nodes.at(-1)).toMatchObject({
    type: "model-3d",
    data: { images: [{ type: "node", nodeId: "source" }] },
  });
  expect(generate).not.toHaveBeenCalled();
  expect(recognize).not.toHaveBeenCalled();
});
it("uses the configured default rather than the first model and follows settings changes before running", async () => {
  await choose("views");
  expect(modelSelect().value).toBe("null");
  expect(modelSelect().selectedOptions[0]?.textContent).toContain("Image");
  expect(props.nodes.find((node) => node.type === "text")).not.toHaveProperty(
    "quickAction.imageModel",
  );
  imageCatalog.defaultModel = { provider: "test", id: "other" };
  await refreshModels();
  expect(modelSelect().selectedOptions[0]?.textContent).toContain(
    "Other image",
  );
  await act(async () => button(t("canvasQuick.runViews")).click());
  expect(generate).toHaveBeenCalledTimes(3);
  expect(
    saved.nodes
      .filter((node) => node.type === "image")
      .every(
        (node) =>
          node.data.model?.id === "other" &&
          node.data.model.provider === "test",
      ),
  ).toBe(true);
});
it("prefers a project default and preserves an explicit batch override", async () => {
  project = {
    ...project,
    mediaModelDefaults: { image: { provider: "test", id: "other" } },
  };
  await mount();
  await choose("views");
  expect(modelSelect().selectedOptions[0]?.textContent).toContain(
    "Other image",
  );
  await act(async () => {
    modelSelect().value = JSON.stringify({ provider: "test", id: "image" });
    modelSelect().dispatchEvent(new Event("change", { bubbles: true }));
  });
  await refreshModels();
  await act(async () => button(t("canvasQuick.runViews")).click());
  expect(generate).toHaveBeenCalledTimes(3);
  expect(
    saved.nodes
      .filter((node) => node.type === "image")
      .every((node) => node.data.model?.id === "image"),
  ).toBe(true);
});
it("requires a configured default even when the model catalog is nonempty", async () => {
  delete imageCatalog.defaultModel;
  await refreshModels();
  await choose("views");
  expect(modelSelect().value).toBe("null");
  expect(container.textContent).toContain(t("canvasQuick.missingImageModel"));
  expect(button(t("canvasQuick.runViews")).disabled).toBe(true);
  expect(generate).not.toHaveBeenCalled();
  expect(container.querySelector('a[href*="settings"]')).not.toBeNull();
  await act(async () => vi.advanceTimersByTimeAsync(500));
  await act(async () => root.unmount());
  root = createRoot(container);
  await mount();
  expect(props.nodes.filter((node) => node.type === "image").every((node) => !node.data.model)).toBe(true);
});
it("retries only failed views without submitting the successful ones again", async () => {
  await choose("views");
  let failedId: string | undefined;
  generate.mockImplementation(async (nodeId) => {
    failedId ??= nodeId;
    return {
      id: nodeId,
      toolId: "generate-image",
      status: nodeId === failedId ? "failed" : "succeeded",
      title: nodeId,
      createdAt: "",
      context: { nodeId, projectId: "p", boardId: "b" },
    };
  });
  await act(async () => button(t("canvasQuick.runViews")).click());
  expect(generate).toHaveBeenCalledTimes(3);
  generate.mockClear();
  await act(async () => button(t("canvasQuick.retryFailed")).click());
  expect(generate).toHaveBeenCalledExactlyOnceWith(failedId);
});
