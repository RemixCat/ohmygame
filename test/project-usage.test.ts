import { mkdtemp, readFile, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  SessionManager,
  type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import { aggregateUsage, usageFilter } from "../src/daemon/project-usage.js";
import { cacheHitRate } from "../src/shared/project-usage.js";
import { createApp } from "../src/daemon/app.js";
const directories: string[] = [],
  apps: ReturnType<typeof createApp>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await Promise.all(
    directories
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  );
});
const usage = (
  input = 100,
  output = 20,
  cacheRead = 300,
  cacheWrite = 100,
) => ({
  input,
  output,
  cacheRead,
  cacheWrite,
  totalTokens: input + output + cacheRead + cacheWrite,
  reasoning: 10,
  cost: {
    input: 0.01,
    output: 0.02,
    cacheRead: 0.003,
    cacheWrite: 0.005,
    total: 0.038,
  },
});
const message = (
  id = "a",
  extra: Record<string, unknown> = {},
  date = "2026-10-18T18:00:00.000Z",
): SessionEntry =>
  ({
    type: "message",
    id,
    parentId: null,
    timestamp: date,
    message: {
      role: "assistant",
      provider: "custom-provider",
      model: "model",
      content: [{ type: "text", text: "PRIVATE CONTENT" }],
      usage: usage(),
      stopReason: "stop",
      durationMs: 2000,
      timestamp: Date.parse(date),
      ...extra,
    },
  }) as SessionEntry;
const report = (entries: SessionEntry[], filter = { timezone: "UTC" }) =>
  aggregateUsage([{ id: "c", title: "Plan", entries }], filter);
describe("usage aggregation", () => {
  it("uses disjoint input/cache/output buckets and counts reasoning as an output subset", () => {
    const stats = report([message()]);
    expect(stats.totals).toMatchObject({
      requests: 1,
      input: 100,
      output: 20,
      cacheRead: 300,
      cacheWrite: 100,
      total: 520,
      reasoning: 10,
      pricedRequests: 1,
      durationMs: 2000,
    });
    expect(cacheHitRate(stats.totals)).toBe(0.6);
    expect(stats.totals.cost?.total).toBeCloseTo(0.038);
    expect(stats.models[0]!.usage).toEqual(stats.totals);
    expect(JSON.stringify(stats)).not.toContain("PRIVATE CONTENT");
  });
  it("preserves unknown usage, zero/unknown estimates and absent reasoning/timing", () => {
    const stats = report([
      message("missing", { usage: undefined, durationMs: undefined }),
      message("zero", {
        usage: {
          ...usage(0, 0, 0, 0),
          reasoning: undefined,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        durationMs: undefined,
      }),
    ]);
    expect(stats.totals).toMatchObject({
      requests: 2,
      missingUsage: 1,
      cost: null,
      reasoning: null,
      durationMs: null,
    });
    expect(cacheHitRate(stats.totals)).toBeNull();
    const bad = report([
      message("bad", { usage: { ...usage(), input: -1 } }),
      message("huge", { usage: { ...usage(), input: 1e300 } }),
    ]);
    expect(bad.totals.missingUsage).toBe(2);
    expect(bad.totals.total).toBe(0);
  });
  it("keeps failed/aborted spend, compaction history and reported tool usage", () => {
    const tool = message("tool", {
      role: "toolResult",
      toolName: "render",
      toolCallId: "call",
      isError: true,
    });
    const stats = report([
      message("fail", { stopReason: "error" }),
      message("abort", { stopReason: "aborted" }),
      tool,
      {
        id: "compact",
        type: "compaction",
        timestamp: "2026-10-18T18:01:00Z",
      } as SessionEntry,
    ]);
    expect(stats.totals).toMatchObject({
      requests: 3,
      total: 1560,
      failedRequests: 2,
      abortedRequests: 1,
    });
    expect(stats.activity).toMatchObject({
      toolCalls: 1,
      toolErrors: 1,
      compactions: 1,
    });
    expect(stats.tools[0]).toMatchObject({
      name: "render",
      calls: 1,
      errors: 1,
      durationMs: 2000,
    });
  });
  it("deduplicates copied historical entries/response IDs, preserving distinct retries and model groups", () => {
    const a = message("a", { responseId: "resp-1" });
    const stats = aggregateUsage(
      [
        { id: "original", title: "Original", entries: [a] },
        {
          id: "fork",
          title: "Fork",
          entries: [
            a,
            message("new-id", { responseId: "resp-1" }),
            message("retry", { model: "another-model", stopReason: "error" }),
            message(
              "reused-id",
              { responseId: "resp-1" },
              "2026-10-18T18:02:00.000Z",
            ),
          ],
        },
      ],
      { timezone: "UTC" },
    );
    expect(stats.sharedRequests).toBe(2);
    expect(stats.totals.requests).toBe(3);
    expect(stats.models).toHaveLength(2);
    expect(stats.conversations.map((c) => c.usage.requests)).toEqual([1, 2]);
  });
  it("filters inclusive dates in the selected timezone and bounds detail rows without truncating totals", () => {
    const entries = Array.from({ length: 505 }, (_, i) =>
      message(`entry-${i}`),
    );
    const stats = aggregateUsage([{ id: "c", title: "Plan", entries }], {
      timezone: "Asia/Shanghai",
      from: "2026-10-19",
      to: "2026-10-19",
    });
    expect(stats.requests).toHaveLength(500);
    expect(stats.requestsTruncated).toBe(true);
    expect(stats.totals.requests).toBe(505);
    expect(stats.days[0]!.date).toBe("2026-10-19");
    expect(
      report(entries, { timezone: "UTC", from: "2026-10-19" } as never).totals
        .requests,
    ).toBe(0);
    for (const query of [
      { from: "2026-02-30" },
      { from: "2026-10-20", to: "2026-10-19" },
      { timezone: "../secret" },
    ])
      expect(() => usageFilter(query)).toThrow();
  });
});
async function fixture() {
  const directory = await mkdtemp(
    path.join(tmpdir(), "ohmygame-project-usage-"),
  );
  directories.push(directory);
  const app = createApp({
    dataDirectory: directory,
    piAgentDirectory: path.join(directory, "pi"),
    localDebug: true,
  });
  apps.push(app);
  const response = await app.inject({
    method: "POST",
    url: "/projects",
    payload: { name: "Usage fixture", type: "asset-canvas" },
  });
  expect(response.statusCode).toBe(201);
  const project = response.json();
  const session = SessionManager.create(
    project.workspacePath,
    path.join(project.storagePath, "session"),
  );
  session.appendSessionInfo("Planning conversation");
  session.appendMessage({
    role: "user",
    content: "SECRET PROMPT",
    timestamp: Date.parse("2026-10-18T18:00:00Z"),
  });
  session.appendMessage(
    (message().type === "message" ? (message() as any).message : {}) as never,
  );
  const conversationId = session.getSessionId();
  return { app, project, directory, session, conversationId };
}
describe("project statistics API", () => {
  it("backfills saved sessions after restart, preserves files and rejects missing projects/conversations and invalid filters", async () => {
    const { app, project, session, conversationId } = await fixture();
    const base = `/projects/${project.id}`;
    const file = session.getSessionFile()!;
    const before = await readFile(file, "utf8");
    const stats = await app.inject({
      url: `${base}/statistics?timezone=Asia%2FShanghai`,
    });
    expect(stats.statusCode).toBe(200);
    expect(stats.headers["cache-control"]).toBe("no-store");
    const body = stats.json();
    expect(body.totals.total).toBe(520);
    expect(body.days[0].date).toBe("2026-10-19");
    expect(body.activity.userMessages).toBe(1);
    expect(stats.body).not.toContain("SECRET PROMPT");
    expect(stats.body).not.toContain("PRIVATE CONTENT");
    expect(stats.body).not.toContain(project.workspacePath);
    expect(await readFile(file, "utf8")).toBe(before);
    const current = await app.inject({
      url: `${base}/conversations/${conversationId}/usage`,
    });
    expect(current.json().totals.total).toBe(520);
    expect(current.json().last.usage.total).toBe(520);
    expect(
      (await app.inject({ url: `${base}/statistics?from=2026-02-30` }))
        .statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ url: `${base}/statistics?conversationId=missing` }))
        .statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ url: `${base}/conversations/missing/usage` }))
        .statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ url: `/projects/missing/statistics` })).statusCode,
    ).toBe(404);
  });
  it("scopes conversation details separately and counts media history without exposing inputs or rewriting files", async () => {
    const { app, project, conversationId } = await fixture();
    const second = SessionManager.create(
      project.workspacePath,
      path.join(project.storagePath, "session"),
    );
    second.appendMessage(
      (message("second", { model: "second-model" }) as any).message,
    );
    const canvas = path.join(project.workspacePath, "canvas");
    await mkdir(canvas, { recursive: true });
    const jobs = JSON.stringify([
      {
        id: "job",
        createdAt: "2026-10-18T18:00:00Z",
        status: "succeeded",
        toolId: "generate-image",
        input: { apiKey: "SECRET KEY" },
        context: { projectId: project.id, boardId: "b", nodeId: "n" },
      },
      { id: "foreign", context: { projectId: "other" } },
    ]);
    await writeFile(path.join(canvas, "jobs.json"), jobs);
    const stats = await app.inject({
      url: `/projects/${project.id}/statistics?conversationId=${conversationId}`,
    });
    expect(stats.statusCode).toBe(200);
    expect(stats.json().totals.requests).toBe(1);
    expect(stats.json().media.total).toBe(1);
    expect(stats.body).not.toContain("SECRET KEY");
    expect(await readFile(path.join(canvas, "jobs.json"), "utf8")).toBe(jobs);
    const all = (
      await app.inject({ url: `/projects/${project.id}/statistics` })
    ).json();
    expect(all.totals.requests).toBe(2);
  });
});
