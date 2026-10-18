// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useCanvasBoardNavigation } from "../src/renderer/canvas-board-links.js";
let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
let nav: ReturnType<typeof useCanvasBoardNavigation>;
let activeId: string, boards: { id: string; name: string }[];
const flush = vi.fn(async () => {});
const loadBoards = vi.fn(async () => boards);
const activate = vi.fn((id: string) => {
  activeId = id;
});
function Harness() {
  nav = useCanvasBoardNavigation({ activeId, flush, loadBoards, activate });
  return null;
}
const render = () => act(async () => root.render(<Harness />));
const open = async (id: string, linked = true) => {
  await act(async () => {
    await nav.open(id, linked);
  });
  await render();
};
const back = async () => {
  await act(async () => {
    await nav.back();
  });
  await render();
};
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  activeId = "overview";
  boards = ["overview", "detail", "assets"].map((id) => ({ id, name: id }));
  flush.mockReset().mockResolvedValue();
  loadBoards.mockReset().mockImplementation(async () => boards);
  activate.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await render();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it("saves before transitions and unwinds nested/cyclic navigation; a manual board switch resets the trail", async () => {
  await open("detail");
  await open("assets");
  await open("detail");
  expect(nav.trail).toEqual(["overview", "detail", "assets"]);
  await back();
  expect(activeId).toBe("assets");
  await back();
  expect(activeId).toBe("detail");
  await back();
  expect(activeId).toBe("overview");
  expect(nav.trail).toEqual([]);
  expect(flush.mock.invocationCallOrder[0]).toBeLessThan(
    loadBoards.mock.invocationCallOrder[0]!,
  );
  expect(loadBoards.mock.invocationCallOrder[0]).toBeLessThan(
    activate.mock.invocationCallOrder[0]!,
  );
  await open("detail");
  await open("assets", false);
  expect(nav.trail).toEqual([]);
});
it("never leaves the current board when save/read fails or the target was deleted", async () => {
  flush.mockRejectedValueOnce(new Error("Unsaved changes"));
  await act(async () => {
    await expect(nav.open("detail")).rejects.toThrow("Unsaved changes");
  });
  expect(loadBoards).not.toHaveBeenCalled();
  expect(activate).not.toHaveBeenCalled();
  loadBoards.mockRejectedValueOnce(new Error("Offline"));
  await act(async () => {
    await expect(nav.open("detail")).rejects.toThrow("Offline");
  });
  expect(activate).not.toHaveBeenCalled();
  boards = boards.filter((b) => b.id !== "detail");
  await act(async () => {
    await expect(nav.open("detail")).rejects.toThrow("deleted");
  });
  expect(activeId).toBe("overview");
  expect(nav.trail).toEqual([]);
});
it("skips deleted return destinations without losing the remaining route", async () => {
  await open("detail");
  await open("assets");
  boards = boards.filter((b) => b.id !== "detail");
  await back();
  expect(activeId).toBe("overview");
  expect(nav.trail).toEqual([]);
});
it("serializes rapid clicks while a save is in flight and bounds history", async () => {
  let release!: () => void;
  flush.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = nav.open("detail");
    await nav.open("assets");
  });
  expect(nav.busy).toBe(true);
  expect(activate).not.toHaveBeenCalled();
  await act(async () => {
    release();
    await pending;
  });
  await render();
  expect(activate).toHaveBeenCalledTimes(1);
  expect(activeId).toBe("detail");
  for (let i = 0; i < 55; i++) await open(i % 2 ? "detail" : "assets");
  expect(nav.trail).toHaveLength(50);
});
