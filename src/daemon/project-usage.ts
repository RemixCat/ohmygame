import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type { FastifyInstance } from "fastify";
import type { ProjectState } from "../shared/contracts.js";
import {
  addUsage,
  emptyActivity,
  emptyUsage,
  type UsageReport,
  type UsageRequest,
  type UsageTotals,
  type ProjectStatistics,
} from "../shared/project-usage.js";
import type { ConversationManager } from "./conversations.js";
import type { ProjectManager } from "./projects.js";
import type { ToolRunner } from "./tools.js";
import { inspectCanvasBoard, readCanvasIndex } from "./canvas-workspace.js";
import { readCanvasAssets } from "./canvas-assets.js";
import { readCanvasFile } from "./canvas-files.js";

type Source = { id: string; title: string; entries: SessionEntry[] };
export interface UsageFilter {
  from?: string;
  to?: string;
  timezone: string;
}
const number = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const object = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
function usageFor(message: Record<string, unknown>): UsageTotals {
  const result = emptyUsage();
  result.requests = 1;
  const usage = object(message.usage);
  const token = (value: unknown) =>
    number(value) && Number.isSafeInteger(value);
  if (
    usage &&
    ["input", "output", "cacheRead", "cacheWrite"].every((key) =>
      token(usage[key]),
    )
  ) {
    result.input = usage.input as number;
    result.output = usage.output as number;
    result.cacheRead = usage.cacheRead as number;
    result.cacheWrite = usage.cacheWrite as number;
    result.total =
      result.input + result.output + result.cacheRead + result.cacheWrite;
    if (
      token(usage.reasoning) &&
      (usage.reasoning as number) <= result.output
    ) {
      result.reasoning = usage.reasoning as number;
      result.reasoningRequests = 1;
    }
    if (result.cacheRead > 0) result.cacheHitRequests = 1;
    const cost = object(usage.cost);
    // Pi calculates this from its model table; zero often means an unpriced custom model.
    if (
      cost &&
      ["input", "output", "cacheRead", "cacheWrite", "total"].every((key) =>
        number(cost[key]),
      ) &&
      (cost.total as number) > 0
    ) {
      result.cost = {
        input: cost.input as number,
        output: cost.output as number,
        cacheRead: cost.cacheRead as number,
        cacheWrite: cost.cacheWrite as number,
        total: cost.total as number,
      };
      result.pricedRequests = 1;
    }
  } else result.missingUsage = 1;
  if (number(message.durationMs)) {
    result.durationMs = message.durationMs;
    result.timedRequests = 1;
  }
  result.failedRequests =
    message.stopReason === "error" || message.isError === true ? 1 : 0;
  result.abortedRequests = message.stopReason === "aborted" ? 1 : 0;
  return result;
}
export function usageFilter(query: Record<string, unknown>): UsageFilter {
  const result: UsageFilter = {
    timezone: typeof query.timezone === "string" ? query.timezone : "UTC",
  };
  try {
    new Intl.DateTimeFormat("en", { timeZone: result.timezone }).format();
  } catch {
    throw new Error("Invalid timezone");
  }
  for (const key of ["from", "to"] as const)
    if (query[key] !== undefined) {
      const value = query[key];
      if (
        typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 10) !== value
      )
        throw new Error("Invalid date range");
      result[key] = value;
    }
  if (result.from && result.to && result.from > result.to)
    throw new Error("Invalid date range");
  return result;
}
export function usageDay(
  timestamp: string,
  timezone: string,
  formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }),
): string {
  const parts = formatter.formatToParts(new Date(timestamp));
  return ["year", "month", "day"]
    .map((type) => parts.find((p) => p.type === type)!.value)
    .join("-");
}
function timestampFor(
  entry: SessionEntry,
  message?: Record<string, unknown>,
): string | null {
  const time = number(message?.timestamp)
    ? message.timestamp
    : Date.parse(entry.timestamp);
  return Number.isFinite(time) && Math.abs(time) <= 8.64e15
    ? new Date(time).toISOString()
    : null;
}
/** Read every saved branch, so rewinding and compaction do not erase historical spend. */
export function aggregateUsage(
  sources: Source[],
  filter: UsageFilter,
  limit = 500,
): UsageReport {
  const report: UsageReport = {
    totals: emptyUsage(),
    activity: emptyActivity(),
    sharedRequests: 0,
    models: [],
    days: [],
    conversations: [],
    tools: [],
    requests: [],
    requestsTruncated: false,
  };
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: filter.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const seen = new Set<string>(),
    models = new Map<string, UsageReport["models"][number]>(),
    days = new Map<string, UsageTotals>(),
    tools = new Map<string, UsageReport["tools"][number]>();
  for (const source of sources) {
    const conversation = {
      id: source.id,
      title: source.title,
      usage: emptyUsage(),
      activity: emptyActivity(),
    };
    report.conversations.push(conversation);
    for (const entry of source.entries) {
      const message =
        entry.type === "message" ? object(entry.message) : undefined;
      const timestamp = timestampFor(entry, message);
      const day = timestamp
        ? usageDay(timestamp, filter.timezone, formatter)
        : null;
      if (
        (filter.from || filter.to) &&
        (!day ||
          (filter.from && day < filter.from) ||
          (filter.to && day > filter.to))
      )
        continue;
      // Forked session files may copy the same historical entries. Charge their shared prefix once.
      const key = JSON.stringify(
        typeof message?.responseId === "string" && message.responseId
          ? [
              "response",
              message.provider,
              message.model,
              message.responseId,
              timestamp,
            ]
          : [
              entry.id,
              entry.timestamp,
              message?.role,
              message?.provider,
              message?.model,
            ],
      );
      if (seen.has(key)) {
        if (
          message?.role === "assistant" ||
          (message?.role === "toolResult" && message.usage)
        )
          report.sharedRequests++;
        continue;
      }
      seen.add(key);
      if (message?.role === "user") {
        report.activity.userMessages++;
        conversation.activity.userMessages++;
      }
      if (entry.type === "compaction") {
        report.activity.compactions++;
        conversation.activity.compactions++;
      }
      if (message?.role === "toolResult") {
        const name =
          typeof message.toolName === "string" ? message.toolName : "unknown";
        const tool = tools.get(name) ?? {
          name,
          calls: 0,
          errors: 0,
          durationMs: 0,
          timedCalls: 0,
        };
        tool.calls++;
        report.activity.toolCalls++;
        conversation.activity.toolCalls++;
        if (message.isError === true) {
          tool.errors++;
          report.activity.toolErrors++;
          conversation.activity.toolErrors++;
        }
        if (number(message.durationMs)) {
          tool.durationMs += message.durationMs;
          tool.timedCalls++;
        }
        tools.set(name, tool);
      }
      if (
        !message ||
        !(
          message.role === "assistant" ||
          (message.role === "toolResult" && message.usage)
        )
      )
        continue;
      const kind =
        message.role === "assistant"
          ? ("assistant" as const)
          : ("tool" as const);
      const provider =
        typeof message.provider === "string"
          ? message.provider
          : kind === "tool"
            ? "tool"
            : "unknown";
      const model =
        typeof message.model === "string"
          ? message.model
          : kind === "tool" && typeof message.toolName === "string"
            ? message.toolName
            : "unknown";
      const usage = usageFor(message),
        modelKey = JSON.stringify([provider, model, kind]);
      const group = models.get(modelKey) ?? {
        provider,
        model,
        kind,
        usage: emptyUsage(),
      };
      addUsage(report.totals, usage);
      addUsage(conversation.usage, usage);
      addUsage(group.usage, usage);
      models.set(modelKey, group);
      if (day) {
        const daily = days.get(day) ?? emptyUsage();
        addUsage(daily, usage);
        days.set(day, daily);
      }
      report.requests.push({
        id: entry.id,
        conversationId: source.id,
        timestamp,
        provider,
        model,
        kind,
        status:
          typeof message.stopReason === "string"
            ? message.stopReason
            : message.isError
              ? "error"
              : "stop",
        usage,
      });
      if (report.requests.length >= Math.max(2, limit * 2)) {
        report.requests.sort((a, b) =>
          (b.timestamp ?? "").localeCompare(a.timestamp ?? ""),
        );
        report.requests = report.requests.slice(0, limit);
      }
    }
  }
  report.models = [...models.values()].sort(
    (a, b) => b.usage.total - a.usage.total,
  );
  report.days = [...days]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, usage]) => ({ date, usage }));
  report.tools = [...tools.values()].sort((a, b) => b.calls - a.calls);
  report.requests.sort((a, b) =>
    (b.timestamp ?? "").localeCompare(a.timestamp ?? ""),
  );
  report.requestsTruncated = report.totals.requests > limit;
  report.requests = report.requests.slice(0, limit);
  return report;
}
async function sourcesFor(
  project: ProjectState,
  conversations: ConversationManager,
  only?: string,
) {
  const storedItems = only
    ? [await conversations.get(project, only)].flatMap((item) =>
        item ? [item] : [],
      )
    : await conversations.listStored(project);
  if (only && !storedItems.length) return undefined;
  storedItems.sort(
    (a, b) =>
      a.summary.createdAt.localeCompare(b.summary.createdAt) ||
      a.summary.id.localeCompare(b.summary.id),
  );
  const sources: Source[] = [];
  let unavailable = 0;
  for (const stored of storedItems) {
    const summary = stored.summary;
    try {
      const manager = await conversations.view(project, stored);
      sources.push({
        id: summary.id,
        title: summary.title,
        entries: manager.getEntries(),
      });
    } catch {
      unavailable++;
    }
  }
  return { sources, count: storedItems.length, unavailable };
}
export function registerProjectUsageRoutes(
  app: FastifyInstance,
  options: {
    projects: ProjectManager;
    conversations: ConversationManager;
    tools: ToolRunner;
  },
) {
  app.get<{ Params: { projectId: string; conversationId: string } }>(
    "/projects/:projectId/conversations/:conversationId/usage",
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const project = options.projects.get(request.params.projectId);
      if (!project) return reply.code(404).send({ error: "Project not found" });
      const data = await sourcesFor(
        project,
        options.conversations,
        request.params.conversationId,
      );
      if (!data)
        return reply.code(404).send({ error: "Conversation not found" });
      if (data.unavailable)
        return reply
          .code(503)
          .send({ error: "Conversation usage is temporarily unavailable" });
      const report = aggregateUsage(data.sources, { timezone: "UTC" }, 1);
      return {
        projectId: project.id,
        conversationId: request.params.conversationId,
        generatedAt: new Date().toISOString(),
        totals: report.totals,
        last: report.requests[0] ?? null,
      };
    },
  );
  app.get<{
    Params: { projectId: string };
    Querystring: Record<string, unknown>;
  }>("/projects/:projectId/statistics", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const project = options.projects.get(request.params.projectId);
    if (!project) return reply.code(404).send({ error: "Project not found" });
    let filter: UsageFilter;
    try {
      filter = usageFilter(request.query);
    } catch (cause) {
      return reply.code(400).send({ error: (cause as Error).message });
    }
    const only = request.query.conversationId;
    if (
      only !== undefined &&
      (typeof only !== "string" || !only || only.length > 120)
    )
      return reply.code(400).send({ error: "Invalid conversation ID" });
    const data = await sourcesFor(
      project,
      options.conversations,
      only as string | undefined,
    );
    if (!data) return reply.code(404).send({ error: "Conversation not found" });
    const report: ProjectStatistics = {
      ...aggregateUsage(data.sources, filter),
      projectId: project.id,
      projectName: project.name,
      generatedAt: new Date().toISOString(),
      ...filter,
      conversationCount: data.count,
      unavailableConversations: data.unavailable,
      canvas: null,
      media: {
        total: 0,
        byStatus: Object.create(null),
        byTool: Object.create(null),
      },
      activityUnavailable: false,
    };
    try {
      const index = await readCanvasIndex(project.workspacePath);
      if (index) {
        const assets = await readCanvasAssets(project.workspacePath);
        report.canvas = {
          boards: index.boards.length,
          documents: index.documents.length,
          tables: index.tables?.length ?? 0,
          assets: Object.keys(assets.assets).length,
          nodes: 0,
          edges: 0,
          groups: 0,
          nodeTypes: Object.create(null),
          unavailableBoards: 0,
        };
        for (const board of index.boards) {
          try {
            const detail = await inspectCanvasBoard(
              project.workspacePath,
              board.id,
            );
            if (!detail?.detail) {
              report.canvas.unavailableBoards++;
              continue;
            }
            const content = detail.detail.board;
            report.canvas.nodes += content.nodes.length;
            report.canvas.edges += content.edges.length;
            report.canvas.groups += content.groups?.length ?? 0;
            for (const node of content.nodes)
              report.canvas.nodeTypes[node.type] =
                (report.canvas.nodeTypes[node.type] ?? 0) + 1;
          } catch {
            report.canvas.unavailableBoards++;
          }
        }
      }
    } catch {
      report.activityUnavailable = true;
    }
    try {
      const byId = new Map(
        options.tools
          .jobs()
          .filter((job) => job.context?.projectId === project.id)
          .map((job) => [job.id, job]),
      );
      // Canvas history survives removal from the global runner's in-memory jobs map.
      const text = await readCanvasFile(project.workspacePath, "jobs.json");
      const jobs = text ? JSON.parse(text) : [];
      if (!Array.isArray(jobs)) throw new Error("Invalid canvas job history");
      for (const job of jobs)
        if (
          typeof job?.id === "string" &&
          job.context?.projectId === project.id &&
          !byId.has(job.id)
        )
          byId.set(job.id, job);
      for (const job of byId.values()) {
        const date = Number.isFinite(Date.parse(job.createdAt))
          ? usageDay(job.createdAt, filter.timezone)
          : null;
        if (
          (filter.from || filter.to) &&
          (!date ||
            (filter.from && date < filter.from) ||
            (filter.to && date > filter.to))
        )
          continue;
        report.media.total++;
        const status = typeof job.status === "string" ? job.status : "unknown",
          tool = typeof job.toolId === "string" ? job.toolId : "unknown";
        report.media.byStatus[status] =
          (report.media.byStatus[status] ?? 0) + 1;
        report.media.byTool[tool] = (report.media.byTool[tool] ?? 0) + 1;
      }
    } catch {
      report.activityUnavailable = true;
    }
    return report;
  });
}
