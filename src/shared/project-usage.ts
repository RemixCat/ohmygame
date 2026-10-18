/** Usage describes saved SDK message records, not a provider invoice. */
export interface UsageTotals {
  requests: number;
  missingUsage: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
  reasoning: number | null;
  reasoningRequests: number;
  cacheHitRequests: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  } | null;
  pricedRequests: number;
  durationMs: number | null;
  timedRequests: number;
  failedRequests: number;
  abortedRequests: number;
}
export interface UsageRequest {
  id: string;
  conversationId: string;
  timestamp: string | null;
  provider: string;
  model: string;
  kind: "assistant" | "tool";
  status: string;
  usage: UsageTotals;
}
export interface UsageActivity {
  userMessages: number;
  toolCalls: number;
  toolErrors: number;
  compactions: number;
}
export interface UsageReport {
  totals: UsageTotals;
  activity: UsageActivity;
  sharedRequests: number;
  models: Array<{
    provider: string;
    model: string;
    kind: UsageRequest["kind"];
    usage: UsageTotals;
  }>;
  days: Array<{ date: string; usage: UsageTotals }>;
  conversations: Array<{
    id: string;
    title: string;
    usage: UsageTotals;
    activity: UsageActivity;
  }>;
  tools: Array<{
    name: string;
    calls: number;
    errors: number;
    durationMs: number;
    timedCalls: number;
  }>;
  requests: UsageRequest[];
  requestsTruncated: boolean;
}
export interface ProjectStatistics extends UsageReport {
  projectName: string;
  projectId: string;
  generatedAt: string;
  timezone: string;
  from?: string;
  to?: string;
  conversationCount: number;
  unavailableConversations: number;
  canvas: {
    boards: number;
    documents: number;
    tables: number;
    assets: number;
    nodes: number;
    edges: number;
    groups: number;
    nodeTypes: Record<string, number>;
    unavailableBoards: number;
  } | null;
  media: {
    total: number;
    byStatus: Record<string, number>;
    byTool: Record<string, number>;
  };
  activityUnavailable: boolean;
}
export interface ConversationUsage {
  projectId: string;
  conversationId: string;
  generatedAt: string;
  totals: UsageTotals;
  last: UsageRequest | null;
}
export function emptyUsage(): UsageTotals {
  return {
    requests: 0,
    missingUsage: 0,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
    reasoning: null,
    reasoningRequests: 0,
    cacheHitRequests: 0,
    cost: null,
    pricedRequests: 0,
    durationMs: null,
    timedRequests: 0,
    failedRequests: 0,
    abortedRequests: 0,
  };
}
export function emptyActivity(): UsageActivity {
  return { userMessages: 0, toolCalls: 0, toolErrors: 0, compactions: 0 };
}
export function addUsage(target: UsageTotals, value: UsageTotals): void {
  for (const key of [
    "requests",
    "missingUsage",
    "input",
    "output",
    "cacheRead",
    "cacheWrite",
    "total",
    "reasoningRequests",
    "cacheHitRequests",
    "pricedRequests",
    "timedRequests",
    "failedRequests",
    "abortedRequests",
  ] as const)
    target[key] += value[key];
  if (value.reasoning !== null)
    target.reasoning = (target.reasoning ?? 0) + value.reasoning;
  if (value.durationMs !== null)
    target.durationMs = (target.durationMs ?? 0) + value.durationMs;
  if (value.cost) {
    target.cost ??= {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    };
    for (const key of [
      "input",
      "output",
      "cacheRead",
      "cacheWrite",
      "total",
    ] as const)
      target.cost[key] += value.cost[key];
  }
}
/** Token-weighted cache-read fraction, not a request hit rate or a discount. */
export function cacheHitRate(usage: UsageTotals): number | null {
  const input = usage.input + usage.cacheRead + usage.cacheWrite;
  return input > 0 ? usage.cacheRead / input : null;
}
