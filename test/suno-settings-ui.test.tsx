// @vitest-environment happy-dom
import path from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { SUNO_MODELS, SUNO_PROVIDER_ID } from "../src/shared/suno.js";
import type { ProviderSummary } from "../src/shared/contracts.js";

const api = {
  updateSunoApiKey: vi.fn(async (_key: string) => ({ configured: true })),
  listAudioModelCatalog: vi.fn(async () => ({
    models: [...SUNO_MODELS],
    providers: [],
  })),
};
vi.doMock(path.resolve("src/renderer/api.ts"), async () => ({
  ...(await vi.importActual(path.resolve("src/renderer/api.ts"))),
  ...api,
}));
const { ModelsSettings } = await import("../src/renderer/models-settings.js");
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function render(configured = false) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const provider: ProviderSummary = {
    id: SUNO_PROVIDER_ID,
    name: "Suno · MuMu",
    configured,
    enabled: true,
    status: configured ? "connected" : "not_configured",
    credentialType: "api_key",
    methods: [{ type: "api_key", label: "MuMu API key" }],
    capabilities: ["audio"],
  };
  const onViewChange = vi.fn();
  await act(async () =>
    root.render(
      <ModelsSettings
        view={{ page: "provider", provider }}
        onViewChange={onViewChange}
      />,
    ),
  );
  return onViewChange;
}

it("offers one password field and saves the key without asking for an endpoint or model classification", async () => {
  const changed = await render();
  const inputs = host.querySelectorAll("input");
  expect(inputs).toHaveLength(1);
  const key = inputs[0]!;
  expect(key.type).toBe("password");
  expect(host.textContent).toContain("zhongzhuan.mumuverse.space");
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(key, " fixture-key ");
    key.dispatchEvent(new Event("input", { bubbles: true }));
    key.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(api.updateSunoApiKey).toHaveBeenCalledWith("fixture-key");
  expect(changed).toHaveBeenCalledWith({ page: "providers" });
  expect(key.value).toBe("");
});

it("shows music models and the existing enable/delete controls after connection", async () => {
  await render(true);
  expect(api.listAudioModelCatalog).toHaveBeenCalledOnce();
  expect(host.querySelectorAll(".provider-model-row")).toHaveLength(5);
  expect(host.querySelector('input[role="switch"]')).not.toBeNull();
  const deletion = host.querySelector<HTMLButtonElement>(
    ".settings-provider-delete",
  )!;
  await act(async () => deletion.click());
  expect(
    host.querySelector(".settings-provider-delete-confirmation"),
  ).not.toBeNull();
});
