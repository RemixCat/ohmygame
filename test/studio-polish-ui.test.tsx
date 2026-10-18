// @vitest-environment happy-dom
import path from "node:path";
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  emptyProduction,
  emptyStandard,
  emptyStudioLibrary,
  type ProjectProduction,
  type StudioEnvelope,
} from "../src/shared/studio.js";
const project = {
  id: "project",
  name: "Game",
  type: "general",
  workspacePath: "/game",
  updatedAt: "2026-10-18",
  preview: { status: "waiting" },
};
const assets = [
  {
    id: "image",
    assetId: "image",
    path: "fox.png",
    name: "fox.png",
    mediaType: "image",
    contentType: "image/png",
    size: 20,
    createdAt: "2026-10-18",
  },
  {
    id: "audio",
    assetId: "audio",
    path: "music.wav",
    name: "music.wav",
    mediaType: "audio",
    contentType: "audio/wav",
    size: 20,
    createdAt: "2026-10-18",
  },
];
let production: StudioEnvelope<ProjectProduction>;
const save = vi.fn(
  async (_id: string, value: StudioEnvelope<ProjectProduction>) => {
    production = structuredClone({ ...value, revision: crypto.randomUUID() });
    return production;
  },
);
const api = {
  getProjectProduction: vi.fn(async () => structuredClone(production)),
  saveProjectProduction: save,
  getStudioLibrary: vi.fn(async () => ({
    revision: "library",
    value: emptyStudioLibrary(),
  })),
  listProjects: async () => [project],
  saveStudioLibrary: vi.fn(async (d: unknown) => d),
};
vi.doMock(path.resolve("src/renderer/api.ts"), async (original) => ({
  ...(await original<typeof import("../src/renderer/api.js")>()),
  ...api,
}));
vi.doMock(path.resolve("src/renderer/library-assets.ts"), () => ({
  loadLibraryAssets: async () => assets,
}));
vi.doMock(path.resolve("src/renderer/canvas-api.ts"), async (original) => ({
  ...(await original<typeof import("../src/renderer/canvas-api.js")>()),
  getCanvasWorkspace: async () => ({ boards: [], assets: [] }),
}));
vi.doMock(path.resolve("src/renderer/asset-browser.tsx"), () => ({
  WorkspaceAssetCard: ({ asset, onOpen }: any) => (
    <button onClick={onOpen}>{asset.name}</button>
  ),
  WorkspaceAssetDialog: () => null,
  AssetThumbnail: () => null,
}));
vi.doMock(path.resolve("src/renderer/sprite-workbench.tsx"), () => ({
  SpriteWorkbench: ({ onClose }: any) => (
    <div role="dialog">
      <button onClick={onClose}>Close workbench</button>
    </div>
  ),
}));
const { StudioStandards } = await import("../src/renderer/studio-standards.js");
const { StudioLibraryView } = await import("../src/renderer/studio-library.js");
let root: ReturnType<typeof createRoot>, host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  production = { revision: "initial", value: emptyProduction() };
  production.value.standards = [
    {
      id: "live",
      name: "Published",
      draft: emptyStandard(),
      revisions: [
        { revision: 1, createdAt: "2026-10-18", content: emptyStandard() },
      ],
      activeRevision: 1,
    },
    { id: "scratch", name: "Unused", draft: emptyStandard(), revisions: [] },
  ];
  production.value.defaultStandardId = "live";
  save.mockClear();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});
const buttons = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].filter(
    (b) => b.textContent === label,
  );
async function click(label: string) {
  await act(async () => {
    expect(buttons(label).length, label).toBeGreaterThan(0);
    buttons(label)[0]!.click();
  });
}
async function name(value: string) {
  await act(async () => {
    const field = document.querySelector<HTMLInputElement>(
      '[role="dialog"] input',
    )!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submitName() {
  await act(async () => {
    const form = document.querySelector('[role="dialog"] form')!;
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
}

it("names a new standard once, returns from templates to its editor and persists only one draft", async () => {
  await act(async () =>
    root.render(
      <StrictMode>
        <StudioStandards projectId="project" />
      </StrictMode>,
    ),
  );
  await click("Prompts and templates");
  await click("New standard");
  expect(document.querySelectorAll(".studio-standard-row")).toHaveLength(2);
  await name("Character UI");
  await submitName();
  expect(document.querySelectorAll(".studio-standard-row")).toHaveLength(3);
  expect(document.querySelector(".studio-header h2")?.textContent).toBe(
    "Character UI",
  );
  expect(
    document.querySelector('.studio-tabs [aria-pressed="true"]')?.textContent,
  ).toBe("Art direction");
  await click("Save changes");
  expect(save).toHaveBeenCalledTimes(1);
  expect(
    production.value.standards.filter((s) => s.name === "Character UI"),
  ).toHaveLength(1);
  await click("New standard");
  await click("Cancel");
  expect(document.querySelectorAll(".studio-standard-row")).toHaveLength(3);
});
it("rejects duplicate names and removes an unpublished standard", async () => {
  await act(async () => root.render(<StudioStandards projectId="project" />));
  await click("New standard");
  await name("published");
  await submitName();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "already exists",
  );
  await click("Cancel");
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>(
        '[aria-label="Delete standard: Unused"]',
      )!
      .click(),
  );
  await click("Delete");
  expect(document.querySelectorAll(".studio-standard-row")).toHaveLength(1);
  await click("Save changes");
  expect(production.value.standards.map((s) => s.id)).toEqual(["live"]);
});
it("removes and restores a published standard while preserving immutable revisions", async () => {
  await act(async () => root.render(<StudioStandards projectId="project" />));
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>(
        '[aria-label="Delete standard: Published"]',
      )!
      .click(),
  );
  await click("Delete");
  await click("Save changes");
  expect(production.value.defaultStandardId).toBeUndefined();
  expect(production.value.standards[0]).toMatchObject({
    archived: true,
    revisions: [{ revision: 1 }],
  });
  expect(document.querySelectorAll(".studio-standard-row")).toHaveLength(1);
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('[aria-label="Restore Published"]')!
      .click(),
  );
  await click("Save changes");
  expect(production.value.standards[0]?.archived).toBeUndefined();
  expect(document.querySelectorAll(".studio-standard-row")).toHaveLength(2);
});
it("keeps the gallery visible by default, toggles advanced filters, and opens an inspector without a bulk toolbar", async () => {
  await act(async () => root.render(<StudioLibraryView />));
  expect(document.querySelectorAll(".studio-card")).toHaveLength(2);
  expect(
    document.querySelector<HTMLElement>(".studio-filter-panel")?.hidden,
  ).toBe(true);
  expect(
    document.querySelector(".studio-details")?.classList.contains("is-open"),
  ).toBe(false);
  await click("Filters");
  expect(
    document.querySelector<HTMLElement>(".studio-filter-panel")?.hidden,
  ).toBe(false);
  await click("Audio");
  expect(document.querySelectorAll(".studio-card")).toHaveLength(1);
  expect(document.querySelector(".studio-card")?.textContent).toContain(
    "music.wav",
  );
  await click("music.wav");
  expect(
    document.querySelector(".studio-details")?.classList.contains("is-open"),
  ).toBe(true);
  expect(document.querySelector(".studio-bulk-toolbar")).toBeNull();
  await act(async () =>
    document
      .querySelector<HTMLInputElement>('.studio-card input[type="checkbox"]')!
      .click(),
  );
  expect(document.querySelector(".studio-bulk-toolbar")).not.toBeNull();
  expect(
    document.querySelector<HTMLInputElement>('input[type="file"]')?.hidden,
  ).toBe(true);
});
it("preserves the 2D workbench entry under More tools", async () => {
  await act(async () => root.render(<StudioLibraryView />));
  const menu = document.querySelector<HTMLDetailsElement>(".studio-tool-menu")!;
  await act(async () => {
    menu.open = true;
  });
  await click("Open 2D workbench");
  expect(menu.open).toBe(false);
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
});
