// @vitest-environment happy-dom
import path from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SpriteJob } from "../src/shared/spritecook.js";
const asset = {
  id: "sheet",
  name: "sheet.png",
  mediaType: "image",
  contentType: "image/png",
  width: 8,
  height: 8,
  size: 40,
  createdAt: "2026-10-18",
};
const api = {
  spriteSettings: vi.fn(async () => ({ configured: false, enabled: true })),
  spriteJobs: vi.fn(async (): Promise<SpriteJob[]> => []),
  getSpriteRecipe: vi.fn(async () => null),
  saveSpriteRecipe: vi.fn(async (value: unknown) => value),
  cutSpriteRecipe: vi.fn(async (_recipe: unknown) => [asset]),
  exportSpriteRecipe: vi.fn(async () => ({
    data: btoa("PK"),
    fileName: "studio-2d.zip",
  })),
  startSpriteJob: vi.fn(async () => ({})),
  attachSpriteJob: vi.fn(async () => ({})),
};
vi.doMock(path.resolve("src/renderer/sprite-api.ts"), () => api);
vi.doMock(path.resolve("src/renderer/library-assets.ts"), () => ({
  loadLibraryAssets: async () => [asset],
  downloadAssetBlob: vi.fn(),
}));
vi.doMock(path.resolve("src/renderer/api.ts"), () => ({
  getLibraryAsset: async () => new Blob(["fixture"], { type: "image/png" }),
  uploadLibraryAsset: vi.fn(),
}));
const { SpriteWorkbench } = await import("../src/renderer/sprite-workbench.js");
const { setLanguagePreference } = await import("../src/renderer/i18n.js");
let root: ReturnType<typeof createRoot>, host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setLanguagePreference("en");
  vi.stubGlobal(
    "Image",
    class {
      src = "";
      naturalWidth = 8;
      naturalHeight = 8;
      async decode() {}
    },
  );
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fixture");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    clearRect: vi.fn(),
    drawImage: vi.fn(),
  } as any);
  api.spriteJobs.mockResolvedValue([]);
  api.spriteSettings.mockResolvedValue({ configured: false, enabled: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent === label,
  )!;
async function edit(name: string, value: string) {
  const field = [...document.querySelectorAll<HTMLLabelElement>("label")].find(
    (l) => l.childNodes[0]?.textContent === name,
  )!;
  const input = field.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("edits per-component nine-slice borders and exports frames locally without a key", async () => {
  const close = vi.fn();
  await act(async () =>
    root.render(<SpriteWorkbench initialAssetId="sheet" onClose={close} />),
  );
  expect(document.querySelector("svg image")).toBeTruthy();
  await edit("Columns", "2");
  await act(async () => button("Replace slices with grid").click());
  await edit("Left", "1");
  await edit("Right", "1");
  await act(async () => button("Save editing settings").click());
  expect(api.saveSpriteRecipe.mock.lastCall?.[0]).toMatchObject({
    frames: [{ borders: { left: 1, right: 1 } }, {}],
    borders: { left: 0, right: 0 },
  });
  await act(async () => button("Apply these borders to all frames").click());
  await act(async () => button("Save slices to Library").click());
  expect(api.cutSpriteRecipe.mock.calls[0]?.[0]).toMatchObject({
    borders: { left: 1, right: 1 },
    frames: [{ width: 4 }, { width: 4 }],
  });
  await act(async () => button("Export PNGs, atlas & engine helpers").click());
  expect(api.exportSpriteRecipe).toHaveBeenCalledTimes(1);
  expect(api.startSpriteJob).not.toHaveBeenCalled();
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('button[aria-label="Close"]')!
      .click(),
  );
  expect(close).toHaveBeenCalledOnce();
});
it("reconciles an uncertain remote task without issuing another paid request", async () => {
  api.spriteJobs.mockResolvedValue([
    {
      id: "uncertain-1",
      operation: "animate",
      createdAt: "2026-10-18",
      account: "fixture",
      input: {},
      status: "uncertain",
      assets: [],
    },
  ]);
  await act(async () => root.render(<SpriteWorkbench onClose={vi.fn()} />));
  await act(async () => button("SpriteCook generation").click());
  const field = document.querySelector<HTMLInputElement>(
    'input[aria-label="Provider task ID"]',
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(field, "remote-1");
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => button("Attach existing task").click());
  expect(api.attachSpriteJob).toHaveBeenCalledWith("uncertain-1", "remote-1");
  expect(api.startSpriteJob).not.toHaveBeenCalled();
});
