// @vitest-environment happy-dom
import { act, forwardRef } from "react";
import { createRoot } from "react-dom/client";
import type { Edge, Node, ReactFlowProps } from "@xyflow/react";
import { afterEach, expect, it, vi } from "vitest";
import { EditorCanvas } from "../src/renderer/editor-canvas.js";

const flow = vi.hoisted(() => ({
  props: undefined as ReactFlowProps<Node, Edge> | undefined,
}));
vi.mock("@xyflow/react", async (original) => ({
  ...(await original<typeof import("@xyflow/react")>()),
  ReactFlow: forwardRef<HTMLDivElement, ReactFlowProps<Node, Edge>>(
    (props, ref) => {
      flow.props = props;
      return (
        <div ref={ref}>
          <div className="react-flow__node" data-id="target">
            <div
              className="react-flow__handle target"
              data-handleid="references"
            />
            <textarea />
          </div>
        </div>
      );
    },
  ),
}));
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
});
async function setup(valid = true) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const connect = vi.fn(),
    end = vi.fn();
  await act(async () =>
    root.render(
      <EditorCanvas
        nodes={[]}
        addControl={null}
        onOpenMenu={vi.fn()}
        easyConnect
        onConnect={connect}
        onConnectEnd={end}
        isValidConnection={() => valid}
      />,
    ),
  );
  const target = container.querySelector<HTMLElement>(".react-flow__node")!;
  target.getBoundingClientRect = () =>
    ({ left: 100, right: 300, top: 100, bottom: 300 }) as DOMRect;
  target.getClientRects = () =>
    [target.getBoundingClientRect()] as unknown as DOMRectList;
  flow.props!.onConnectStart!(new MouseEvent("mousedown") as never, {
    nodeId: "source",
    handleId: "output",
    handleType: "source",
  });
  return { connect, end, target };
}
it("highlights the whole compatible card and connects when released over an inner field", async () => {
  const { connect, end, target } = await setup();
  document.dispatchEvent(
    new MouseEvent("mousemove", { clientX: 200, clientY: 200 }),
  );
  expect(target.classList.contains("is-connection-target")).toBe(true);
  flow.props!.onConnectEnd!(
    new MouseEvent("mouseup", { clientX: 200, clientY: 200 }),
    { isValid: false } as never,
  );
  expect(connect).toHaveBeenCalledExactlyOnceWith({
    source: "source",
    sourceHandle: "output",
    target: "target",
    targetHandle: "references",
  });
  expect(end).not.toHaveBeenCalled();
  expect(target.classList.contains("is-connection-target")).toBe(false);
});
it("accepts a release near a card but rejects distant and incompatible targets", async () => {
  const { connect, end } = await setup(false);
  flow.props!.onConnectEnd!(
    new MouseEvent("mouseup", { clientX: 315, clientY: 200 }),
    { isValid: false } as never,
  );
  expect(connect).not.toHaveBeenCalled();
  expect(end).toHaveBeenCalledOnce();
  await act(async () => root.unmount());
  container.remove();
  const next = await setup();
  flow.props!.onConnectEnd!(
    new MouseEvent("mouseup", { clientX: 315, clientY: 200 }),
    { isValid: false } as never,
  );
  expect(next.connect).toHaveBeenCalledOnce();
});
it("does not duplicate a handle connection or connect after Escape", async () => {
  const { connect, end, target } = await setup();
  flow.props!.onConnectEnd!(
    new MouseEvent("mouseup", { clientX: 200, clientY: 200 }),
    { isValid: true } as never,
  );
  expect(connect).not.toHaveBeenCalled();
  expect(end).toHaveBeenCalledOnce();
  flow.props!.onConnectStart!(new MouseEvent("mousedown") as never, {
    nodeId: "source",
    handleId: "output",
    handleType: "source",
  });
  document.dispatchEvent(
    new MouseEvent("mousemove", { clientX: 200, clientY: 200 }),
  );
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  flow.props!.onConnectEnd!(
    new MouseEvent("mouseup", { clientX: 200, clientY: 200 }),
    { isValid: false } as never,
  );
  expect(connect).not.toHaveBeenCalled();
  expect(target.classList.contains("is-connection-target")).toBe(false);
});
