// @vitest-environment happy-dom
import path from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ProjectState } from "../src/shared/contracts.js";
import { observeWorkspaceVersion } from "../src/renderer/workspace-version.js";

const project: ProjectState = {
  id: "workspace-project",
  name: "Game",
  type: "general",
  workspacePath: "/old/game",
  workspaceLocation: "external",
  updatedAt: "2026-10-18T00:00:00Z",
  preview: { status: "waiting" },
};
const getProject = vi.fn(async () => project);
const save = vi.fn();
const choose = vi.fn();
vi.doMock(path.resolve("src/renderer/api.ts"), async (original) => ({
  ...(await original<typeof import("../src/renderer/api.js")>()),
  getProject,
  updateProjectWorkspace: save,
  getProjectCover: async () => undefined,
}));
const { ProjectCard } = await import("../src/renderer/project-card.js");
let root: ReturnType<typeof createRoot>, container: HTMLDivElement;
const changed = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperty(window, "ohMyGameDesktop", {
    configurable: true,
    value: { selectProjectDirectory: choose },
  });
  observeWorkspaceVersion(project.id, "opened-version");
  getProject.mockClear();
  save
    .mockReset()
    .mockResolvedValue({ ...project, workspacePath: "/new/game" });
  choose.mockReset();
  changed.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete (window as any).ohMyGameDesktop;
  vi.unstubAllGlobals();
});
const click = async (label: string) =>
  act(async () => {
    const button = [
      ...document.querySelectorAll<HTMLButtonElement>("button"),
    ].find((b) => b.textContent === label);
    expect(button, label).toBeTruthy();
    button!.click();
  });
async function open(status?: "running") {
  await act(async () =>
    root.render(
      <ProjectCard
        project={project}
        fallback={0}
        agentStatus={status}
        onOpen={() => {}}
        actions={{
          onRename() {},
          onDuplicate() {},
          onDelete() {},
          onWorkspaceChanged: changed,
        }}
      />,
    ),
  );
  await act(async () =>
    container.querySelector<HTMLButtonElement>(".project-card-menu")!.click(),
  );
}

it("opens the chooser from the project menu and preserves the selection when the native picker is cancelled", async () => {
  await open();
  await click("Choose workspace");
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "Project identity and conversations are kept",
  );
  expect(
    document.querySelector<HTMLInputElement>("input[readonly]")?.value,
  ).toBe("/old/game");
  choose.mockResolvedValueOnce("/new/game").mockResolvedValueOnce(undefined);
  await click("Choose folder…");
  await click("Choose folder…");
  expect([...document.querySelectorAll("input")].map((i) => i.value)).toContain(
    "/new/game",
  );
  expect(save).not.toHaveBeenCalled();
  await act(async () =>
    document
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(save).toHaveBeenCalledExactlyOnceWith(
    project.id,
    "/new/game",
    "opened-version",
  );
  expect(changed).toHaveBeenCalledWith(
    expect.objectContaining({ workspacePath: "/new/game" }),
  );
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it("keeps the dialog and selected folder after a refused change and allows retry", async () => {
  await open();
  await click("Choose workspace");
  choose.mockResolvedValue("/new/game");
  await click("Choose folder…");
  save.mockRejectedValueOnce(
    Object.assign(new Error("busy"), { code: "workspace_busy" }),
  );
  await act(async () =>
    document
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "Wait for agents",
  );
  expect(changed).not.toHaveBeenCalled();
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  await act(async () =>
    document
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(changed).toHaveBeenCalledOnce();
});

it("disables workspace changes on a card with an active agent", async () => {
  await open("running");
  const button = [
    ...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
  ].find((b) => b.textContent === "Choose workspace");
  expect(button?.disabled).toBe(true);
  expect(getProject).not.toHaveBeenCalled();
});
