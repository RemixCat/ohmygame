// @vitest-environment happy-dom
import path from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  emptyActivity,
  emptyUsage,
  type ProjectStatistics,
} from "../src/shared/project-usage.js";
const { getConversationUsage, getProjectStatistics } = vi.hoisted(() => ({
  getConversationUsage: vi.fn(),
  getProjectStatistics: vi.fn(),
}));
vi.doMock(path.resolve("src/renderer/project-usage-api.ts"), () => ({
  getConversationUsage,
  getProjectStatistics,
}));
const { ConversationUsageBar, ProjectStatisticsDialog } =
  await import("../src/renderer/project-usage.js");
const totals = {
  ...emptyUsage(),
  requests: 1,
  input: 100,
  output: 20,
  cacheRead: 300,
  cacheWrite: 100,
  total: 520,
};
function data(): ProjectStatistics {
  return {
    projectId: "p",
    projectName: "Game",
    generatedAt: new Date().toISOString(),
    timezone: "UTC",
    totals,
    activity: emptyActivity(),
    sharedRequests: 0,
    models: [],
    days: [],
    conversations: [
      { id: "c", title: "Plan", usage: totals, activity: emptyActivity() },
    ],
    requests: [],
    requestsTruncated: false,
    tools: [],
    conversationCount: 1,
    unavailableConversations: 0,
    canvas: null,
    media: { total: 0, byStatus: {}, byTool: {} },
    activityUnavailable: false,
  };
}
let root: ReturnType<typeof createRoot>, host: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  getConversationUsage.mockReset().mockResolvedValue({
    projectId: "p",
    conversationId: "c",
    totals,
    last: null,
  });
  getProjectStatistics.mockReset().mockResolvedValue(data());
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const button = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent === name,
  )!;
it("shows token/cache/unknown-price data below chat and opens the requested statistics scope", async () => {
  await act(async () =>
    root.render(
      <ConversationUsageBar projectId="p" conversationId="c" running={false} />,
    ),
  );
  expect(host.textContent).toContain("520");
  expect(host.textContent).toContain("60%");
  expect(host.textContent).toContain("Unpriced / unreported");
  await act(async () => button("Project statistics").click());
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "Cache hit rate (tokens)",
  );
  expect(getProjectStatistics.mock.lastCall![1]).not.toHaveProperty(
    "conversationId",
  );
  await act(async () => {
    const select = document.querySelector<HTMLSelectElement>(
      '[aria-label="Scope"]',
    )!;
    select.value = "conversation";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(getProjectStatistics.mock.lastCall![1]).toHaveProperty(
    "conversationId",
    "c",
  );
});
it("ignores stale conversation responses and cancels polling on unmount", async () => {
  let resolve!: (value: unknown) => void;
  getConversationUsage.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  await act(async () =>
    root.render(
      <ConversationUsageBar projectId="p" conversationId="old" running />,
    ),
  );
  await act(async () =>
    root.render(
      <ConversationUsageBar projectId="p" conversationId="c" running />,
    ),
  );
  await act(async () =>
    resolve({
      projectId: "p",
      conversationId: "old",
      totals: { ...totals, total: 999999 },
    }),
  );
  expect(host.textContent).toContain("520");
  expect(host.textContent).not.toContain("999");
  const signal = getConversationUsage.mock.lastCall![2] as AbortSignal;
  await act(async () => root.render(null));
  expect(signal.aborted).toBe(true);
  const count = getConversationUsage.mock.calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60000);
  });
  expect(getConversationUsage).toHaveBeenCalledTimes(count);
});
it("shows errors and retry instead of fabricated zero consumption, and rejects reversed date ranges", async () => {
  getConversationUsage.mockRejectedValueOnce(new Error("offline"));
  await act(async () =>
    root.render(
      <ConversationUsageBar projectId="p" conversationId="c" running={false} />,
    ),
  );
  expect(host.textContent).toContain("Usage unavailable");
  expect(host.textContent).not.toContain("Total tokens 0");
  await act(async () => button("Retry").click());
  expect(host.textContent).toContain("520");
  await act(async () => button("Project statistics").click());
  const set = async (label: string, value: string) =>
    act(async () => {
      const field = document.querySelector<HTMLInputElement>(
        `[aria-label="${label}"]`,
      )!;
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  await set("From date", "2026-10-20");
  await set("Through date", "2026-10-19");
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "start date",
  );
});
it("separates missing canvas data, partial history, and empty recorded usage", async () => {
  getProjectStatistics.mockResolvedValue({
    ...data(),
    totals: emptyUsage(),
    unavailableConversations: 1,
  });
  await act(async () =>
    root.render(<ProjectStatisticsDialog projectId="p" onClose={() => {}} />),
  );
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "may be incomplete",
  );
  await act(async () => button("Project content").click());
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "No readable saved canvas index",
  );
});
