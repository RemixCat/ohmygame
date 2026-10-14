import { describe, expect, it, vi } from "vitest";
import { Check } from "typebox/value";
import { ASSET_CANVAS_SCHEMA } from "../src/shared/asset-canvas-schema.js";
import {
  parseRecognizedObjects,
  THREE_VIEWS,
  viewPrompt,
} from "../src/shared/canvas-quick-actions.js";
import { duplicateCanvasSelection } from "../src/renderer/asset-canvas-clipboard.js";
import { CanvasBatchRunner } from "../src/renderer/canvas-batch-runner.js";
import type { AssetCanvasNode, ToolJob } from "../src/shared/contracts.js";
const job = (id: string, status: ToolJob["status"] = "running"): ToolJob => ({
  id,
  status,
  toolId: "generate-image",
  title: id,
  createdAt: "",
});
const tick = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

describe("canvas shortcuts", () => {
  it("validates provider lists, defaults to no selections and rejects malformed or excessive results", () => {
    expect(
      parseRecognizedObjects(
        '```json\n[{"name":"Ship","description":"Metal","prompt":"One ship"}]\n```',
        () => "ship",
      ),
    ).toEqual([
      {
        id: "ship",
        name: "Ship",
        description: "Metal",
        prompt: "One ship",
        selected: false,
      },
    ]);
    for (const value of [
      "oops",
      "{}",
      '[{"name":"Ship"}]',
      JSON.stringify(
        Array(17).fill({ name: "x", description: "", prompt: "x" }),
      ),
      '[{"name":" ","description":"","prompt":"x"}]',
    ])
      expect(() => parseRecognizedObjects(value)).toThrow();
    expect(
      THREE_VIEWS.map(viewPrompt).every(
        (prompt) =>
          prompt.includes("exactly ONE") && prompt.includes("No other views"),
      ),
    ).toBe(true);
  });
  it("persists selections/settings in the schema and remaps copied groups without controlling the original", () => {
    const source: AssetCanvasNode = {
      id: "source",
      type: "asset",
      position: { x: 0, y: 0 },
      data: { assetId: "ref", mediaType: "image" },
    };
    const controller: AssetCanvasNode = {
      id: "group",
      type: "text",
      position: { x: 400, y: 0 },
      data: {
        text: "",
        instruction: "recognize",
        references: [{ type: "node", nodeId: "source" }],
      },
      quickAction: {
        kind: "objects",
        sourceNodeId: "source",
        imageModel: { provider: "test", id: "vision" },
        resolution: "1K",
        aspectRatio: "1:1",
        objects: [
          {
            id: "ship",
            name: "Ship",
            description: "Metal",
            prompt: "One ship",
            selected: true,
          },
        ],
      },
    };
    const image: AssetCanvasNode = {
      id: "result",
      type: "image",
      position: { x: 800, y: 0 },
      data: {
        prompt: "One ship",
        resolution: "1K",
        aspectRatio: "1:1",
        images: [{ type: "node", nodeId: "source" }],
      },
      quickAction: {
        kind: "objects",
        sourceNodeId: "source",
        groupId: "group",
        itemId: "ship",
      },
    };
    const saved = JSON.parse(
      JSON.stringify({
        version: 1,
        viewport: { width: 1280, height: 720 },
        nodes: [source, controller, image],
        edges: [],
      }),
    );
    expect(
      Check(ASSET_CANVAS_SCHEMA, {
        ...saved,
        nodes: saved.nodes.map(
          ({ position: _position, ...node }: AssetCanvasNode) => node,
        ),
      }),
    ).toBe(true);
    let id = 0;
    const copy = duplicateCanvasSelection(
      saved.nodes,
      [],
      { x: 0, y: 900 },
      () => `copy-${++id}`,
    );
    expect(copy.nodes[1]?.quickAction).toMatchObject({
      sourceNodeId: "copy-1",
      objects: [{ selected: true }],
    });
    expect(copy.nodes[2]?.quickAction).toMatchObject({
      sourceNodeId: "copy-1",
      groupId: "copy-2",
    });
    expect(
      duplicateCanvasSelection([image], [], { x: 0, y: 900 }).nodes[0]
        ?.quickAction,
    ).toBeUndefined();
    saved.nodes[1].quickAction.objects[0].selected = "yes";
    expect(
      Check(ASSET_CANVAS_SCHEMA, {
        ...saved,
        nodes: saved.nodes.map(
          ({ position: _position, ...node }: AssetCanvasNode) => node,
        ),
      }),
    ).toBe(false);
  });
});
describe("batch runner", () => {
  it("holds two slots until completion, including during polling outages, and continues after one failure", async () => {
    const started: string[] = [];
    const states = new Map<string, ToolJob>();
    const waits: (() => void)[] = [];
    let offline = true;
    const failed = vi.fn();
    const runner = new CanvasBatchRunner(
      ["top", "front", "right"],
      async (id) => {
        started.push(id);
        const result = job(id);
        states.set(id, result);
        return result;
      },
      async () => {
        if (offline) throw new Error("offline");
        return [...states.values()];
      },
      vi.fn(),
      vi.fn(),
      failed,
      () => new Promise((resolve) => waits.push(resolve)),
    );
    const run = runner.run();
    await tick();
    expect(started).toEqual(["top", "front"]);
    waits.splice(0).forEach((resolve) => resolve());
    await tick();
    expect(started).toHaveLength(2);
    offline = false;
    states.set("front", job("front", "failed"));
    waits.splice(0).forEach((resolve) => resolve());
    await tick();
    expect(started).toEqual(["top", "front", "right"]);
    states.set("top", job("top", "succeeded"));
    states.set("right", job("right", "succeeded"));
    waits.splice(0).forEach((resolve) => resolve());
    await run;
    expect(failed).not.toHaveBeenCalled();
  });
  it("cancels an in-flight start and never submits remaining queued items", async () => {
    const cancelled = vi.fn(async () => {});
    let release!: (job: ToolJob) => void;
    const start = vi.fn((id: string) =>
      id === "a"
        ? new Promise<ToolJob>((resolve) => {
            release = resolve;
          })
        : Promise.resolve(job(id, "succeeded")),
    );
    const runner = new CanvasBatchRunner(
      ["a", "b", "c"],
      start,
      async () => [],
      cancelled,
      vi.fn(),
      vi.fn(),
    );
    const run = runner.run();
    runner.stop(true);
    release(job("a"));
    await run;
    expect(start.mock.calls.map(([id]) => id)).toEqual(["a", "b"]);
    expect(cancelled).toHaveBeenCalledWith("a");
    expect(runner.pending.size).toBe(0);
    expect([...runner.cancelled]).toEqual(["c"]);
    expect(runner.starting.size).toBe(0);
  });
});
