import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  cacheHitRate,
  type ConversationUsage,
  type ProjectStatistics,
  type UsageTotals,
} from "../shared/project-usage.js";
import {
  getConversationUsage,
  getProjectStatistics,
} from "./project-usage-api.js";
import { ProjectSettingsDialogFrame } from "./project-settings-dialog.js";
import { language, t } from "./i18n.js";
import "./project-usage.css";
const count = (value: number) =>
  new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(value);
const compact = (value: number) =>
  new Intl.NumberFormat(language, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
const usd = (value: number | undefined) =>
  value === undefined
    ? t("projectUsage.unknown")
    : new Intl.NumberFormat(language, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 6,
      }).format(value);
const rate = (value: number | null) =>
  value === null
    ? "—"
    : new Intl.NumberFormat(language, {
        style: "percent",
        maximumFractionDigits: 1,
      }).format(value);
const estimate = (usage: UsageTotals) =>
  usage.cost && usage.pricedRequests < usage.requests
    ? t("projectUsage.partialCost", { value: usd(usage.cost.total) })
    : usd(usage.cost?.total);
const duration = (value: number | null) =>
  value === null
    ? "—"
    : `${new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(value / 1000)} s`;

export function ConversationUsageBar({
  projectId,
  conversationId,
  running,
}: {
  projectId: string;
  conversationId: string;
  running: boolean;
}) {
  const [data, setData] = useState<ConversationUsage>(),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0),
    [open, setOpen] = useState<"project" | "conversation">();
  useEffect(() => {
    let disposed = false,
      timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    setData(undefined);
    setError(false);
    async function load() {
      try {
        const next = await getConversationUsage(
          projectId,
          conversationId,
          controller.signal,
        );
        if (!disposed) {
          setData(next);
          setError(false);
        }
      } catch {
        if (!disposed) setError(true);
      }
      if (!disposed)
        timer = setTimeout(
          () => {
            if (document.hidden) timer = setTimeout(load, 30_000);
            else void load();
          },
          running ? 3000 : 30_000,
        );
    }
    void load();
    return () => {
      disposed = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [projectId, conversationId, running, retry]);
  const usage =
    data?.projectId === projectId && data.conversationId === conversationId
      ? data.totals
      : undefined;
  return (
    <div
      className="conversation-usage"
      aria-label={t("projectUsage.conversationUsage")}
    >
      <button
        type="button"
        className="conversation-usage-open"
        onClick={() => setOpen("conversation")}
        title={t("projectUsage.openDetails")}
      >
        {usage ? (
          <>
            <span>
              {t("projectUsage.tokens")} {compact(usage.total)}
            </span>
            <span>
              ↑ {compact(usage.input + usage.cacheRead + usage.cacheWrite)}
            </span>
            <span>↓ {compact(usage.output)}</span>
            <span>
              {t("projectUsage.cache")} {rate(cacheHitRate(usage))}
            </span>
            <span title={t("projectUsage.estimate")}>{estimate(usage)}</span>
          </>
        ) : (
          <span>
            {error ? t("projectUsage.unavailable") : t("common.loading")}
          </span>
        )}
      </button>
      {error && usage ? <span>{t("projectUsage.stale")}</span> : null}
      {error ? (
        <button type="button" onClick={() => setRetry((v) => v + 1)}>
          {t("common.retry")}
        </button>
      ) : null}
      <button type="button" onClick={() => setOpen("project")}>
        {t("projectUsage.projectStats")}
      </button>
      {open ? (
        <ProjectStatisticsDialog
          projectId={projectId}
          conversationId={conversationId}
          initialScope={open}
          onClose={() => setOpen(undefined)}
        />
      ) : null}
    </div>
  );
}

function UsageMetrics({ usage }: { usage: UsageTotals }) {
  const values = [
    [t("projectUsage.tokens"), count(usage.total)],
    [t("projectUsage.input"), count(usage.input)],
    [t("projectUsage.output"), count(usage.output)],
    [t("projectUsage.cacheRead"), count(usage.cacheRead)],
    [t("projectUsage.cacheWrite"), count(usage.cacheWrite)],
    [t("projectUsage.cacheRate"), rate(cacheHitRate(usage))],
    [
      t("projectUsage.reasoning"),
      usage.reasoning === null
        ? t("projectUsage.unknown")
        : count(usage.reasoning),
    ],
    [t("projectUsage.requests"), count(usage.requests)],
    [t("projectUsage.estimate"), estimate(usage)],
    [
      t("projectUsage.priced"),
      `${count(usage.pricedRequests)} / ${count(usage.requests)}`,
    ],
    [t("projectUsage.duration"), duration(usage.durationMs)],
    [
      t("projectUsage.average"),
      usage.timedRequests
        ? duration((usage.durationMs ?? 0) / usage.timedRequests)
        : "—",
    ],
    [t("projectUsage.failed"), count(usage.failedRequests)],
    [t("projectUsage.aborted"), count(usage.abortedRequests)],
    [t("projectUsage.missing"), count(usage.missingUsage)],
    [t("projectUsage.cacheRequests"), count(usage.cacheHitRequests)],
  ];
  return (
    <dl className="usage-metrics">
      {values.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
function UsageComposition({ usage }: { usage: UsageTotals }) {
  if (!usage.total) return null;
  const keys = ["input", "cacheRead", "cacheWrite", "output"] as const;
  return (
    <div className="usage-composition">
      <div
        className="usage-composition-bar"
        role="img"
        aria-label={t("projectUsage.composition")}
      >
        {keys.map((key) => (
          <span
            key={key}
            className={`usage-segment-${key}`}
            style={{ width: `${(usage[key] / usage.total) * 100}%` }}
            title={`${t(`projectUsage.${key}`)}: ${count(usage[key])}`}
          />
        ))}
      </div>
      <div className="usage-composition-legend">
        {keys.map((key) => (
          <span key={key}>
            <i className={`usage-segment-${key}`} />
            {t(`projectUsage.${key}`)}
          </span>
        ))}
      </div>
    </div>
  );
}
function UsageCells({ usage }: { usage: UsageTotals }) {
  return (
    <>
      <td>{count(usage.requests)}</td>
      <td>{count(usage.total)}</td>
      <td>{count(usage.input)}</td>
      <td>{count(usage.output)}</td>
      <td>{count(usage.cacheRead)}</td>
      <td>{count(usage.cacheWrite)}</td>
      <td>{rate(cacheHitRate(usage))}</td>
      <td>{estimate(usage)}</td>
    </>
  );
}
function UsageHeaders() {
  return (
    <>
      {[
        "requests",
        "tokens",
        "input",
        "output",
        "cacheRead",
        "cacheWrite",
        "cacheRate",
        "estimate",
      ].map((key) => (
        <th scope="col" key={key}>
          {t(`projectUsage.${key}`, { defaultValue: key })}
        </th>
      ))}
    </>
  );
}
function downloadStatistics(data: ProjectStatistics, format: "json" | "csv") {
  // Export only metadata already returned by the statistics endpoint; never conversation content.
  const rows: (string | number)[][] = [
    [
      "conversation_id",
      "timestamp",
      "provider",
      "model",
      "kind",
      "status",
      "input",
      "output",
      "cache_read",
      "cache_write",
      "reasoning",
      "total",
      "estimated_usd",
      "duration_ms",
      "usage_reported",
      "estimate_available",
    ],
  ];
  for (const row of data.requests)
    rows.push([
      row.conversationId,
      row.timestamp ?? "",
      row.provider,
      row.model,
      row.kind,
      row.status,
      row.usage.input,
      row.usage.output,
      row.usage.cacheRead,
      row.usage.cacheWrite,
      row.usage.reasoning ?? "",
      row.usage.total,
      row.usage.cost?.total ?? "",
      row.usage.durationMs ?? "",
      row.usage.missingUsage ? "false" : "true",
      row.usage.pricedRequests ? "true" : "false",
    ]);
  // Spreadsheet formula hardening applies even to model IDs controlled by a provider.
  const csvCell = (value: string | number) =>
    '"' +
    String(
      typeof value === "string" && /^\s*[=+\-@]|^[\t\r\n]/.test(value)
        ? "'" + value
        : value,
    ).replaceAll('"', '""') +
    '"';
  const output =
    format === "json"
      ? JSON.stringify(data, null, 2)
      : "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(
    new Blob([output], {
      type: format === "json" ? "application/json" : "text/csv;charset=utf-8",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `project-statistics-${data.projectId}.${format}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ProjectStatisticsDialog({
  projectId,
  conversationId,
  initialScope = "project",
  onClose,
}: {
  projectId: string;
  conversationId?: string;
  initialScope?: "project" | "conversation";
  onClose(): void;
}) {
  const [data, setData] = useState<ProjectStatistics>(),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0);
  const [scope, setScope] = useState(initialScope),
    [tab, setTab] = useState("overview"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const [timezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );
  const [requestPage, setRequestPage] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    setLoading(true);
    setError("");
    setData(undefined);
    setRequestPage(0);
    if (from && to && from > to) {
      setError(t("projectUsage.invalidRange"));
      setLoading(false);
      return;
    }
    void getProjectStatistics(
      projectId,
      {
        from: from || undefined,
        to: to || undefined,
        timezone,
        ...(scope === "conversation" && conversationId
          ? { conversationId }
          : {}),
      },
      controller.signal,
    )
      .then((next) => {
        if (!disposed) setData(next);
      })
      .catch((cause) => {
        if (!disposed)
          setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [projectId, from, to, timezone, retry, scope, conversationId]);
  const conversation = data?.conversations.find((c) => c.id === conversationId);
  const current =
    scope === "conversation" && conversation
      ? conversation
      : data
        ? { usage: data.totals, activity: data.activity }
        : undefined;
  const requests =
    data?.requests.filter(
      (r) => scope === "project" || r.conversationId === conversationId,
    ) ?? [];
  const tabs =
    scope === "conversation"
      ? ["overview", "requestsTab"]
      : [
          "overview",
          "models",
          "conversations",
          "days",
          "tools",
          "requestsTab",
          "canvas",
        ];
  function recentDays(days: number) {
    const today = new Date();
    const formatter = new Intl.DateTimeFormat("sv-SE", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    setTo(formatter.format(today));
    today.setDate(today.getDate() - days);
    setFrom(formatter.format(today));
  }
  return createPortal(
    <ProjectSettingsDialogFrame
      title={t("projectUsage.projectStats")}
      onClose={onClose}
    >
      <div className="project-statistics nokey">
        {data ? (
          <strong className="usage-project-name">{data.projectName}</strong>
        ) : null}
        <div className="usage-controls">
          {conversationId ? (
            <label>
              {t("projectUsage.scope")}
              <select
                aria-label={t("projectUsage.scope")}
                value={scope}
                onChange={(event) => {
                  setScope(event.target.value as typeof scope);
                  setTab("overview");
                  setRequestPage(0);
                }}
              >
                <option value="conversation">
                  {t("projectUsage.currentConversation")}
                </option>
                <option value="project">
                  {t("projectUsage.entireProject")}
                </option>
              </select>
            </label>
          ) : null}
          <label>
            {t("projectUsage.from")}
            <input
              type="date"
              aria-label={t("projectUsage.from")}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            {t("projectUsage.to")}
            <input
              type="date"
              aria-label={t("projectUsage.to")}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <button type="button" onClick={() => recentDays(0)}>
            {t("projectUsage.today")}
          </button>
          <button type="button" onClick={() => recentDays(6)}>
            {t("projectUsage.week")}
          </button>
          <button type="button" onClick={() => recentDays(29)}>
            {t("projectUsage.month")}
          </button>
          <button
            type="button"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
          >
            {t("projectUsage.allTime")}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => setRetry((v) => v + 1)}
          >
            {t("projectUsage.refresh")}
          </button>
          <span>{timezone}</span>
        </div>
        <p className="usage-note">{t("projectUsage.scopeNote")}</p>
        <nav className="usage-tabs" aria-label={t("projectUsage.sections")}>
          {tabs.map((key) => (
            <button
              type="button"
              key={key}
              aria-pressed={tab === key}
              onClick={() => {
                setTab(key);
                setRequestPage(0);
              }}
            >
              {t(`projectUsage.${key}`, { defaultValue: key })}
            </button>
          ))}
        </nav>
        {loading ? (
          <p role="status">{t("common.loading")}</p>
        ) : error ? (
          <p role="alert">
            {error}
            <button type="button" onClick={() => setRetry((v) => v + 1)}>
              {t("common.retry")}
            </button>
          </p>
        ) : data && current ? (
          <>
            {(data.unavailableConversations > 0 ||
              data.activityUnavailable ||
              (data.canvas?.unavailableBoards ?? 0) > 0) && (
              <p role="status">{t("projectUsage.partial")}</p>
            )}
            {scope === "conversation" && !conversation && (
              <p>{t("projectUsage.conversationMissing")}</p>
            )}
            {tab === "overview" ? (
              <>
                <UsageComposition usage={current.usage} />
                <UsageMetrics usage={current.usage} />
                {scope === "conversation" && requests[0] && (
                  <details>
                    <summary>
                      {t("projectUsage.last")} · {requests[0].model}
                    </summary>
                    <UsageMetrics usage={requests[0].usage} />
                  </details>
                )}
                <dl className="usage-metrics usage-activity">
                  {Object.entries(current.activity).map(([key, value]) => (
                    <div key={key}>
                      <dt>{t(`projectUsage.${key}`, { defaultValue: key })}</dt>
                      <dd>{count(value)}</dd>
                    </div>
                  ))}
                  {scope === "project" && (
                    <>
                      <div>
                        <dt>{t("projectUsage.conversationCount")}</dt>
                        <dd>{count(data.conversationCount)}</dd>
                      </div>
                      <div>
                        <dt>{t("projectUsage.shared")}</dt>
                        <dd>{count(data.sharedRequests)}</dd>
                      </div>
                    </>
                  )}
                </dl>
                <p className="usage-note">{t("projectUsage.formula")}</p>
                <p className="usage-note">{t("projectUsage.estimateNote")}</p>
                <p className="usage-note">
                  {t("projectUsage.durationNote", {
                    timed: current.usage.timedRequests,
                    total: current.usage.requests,
                    reasoning: current.usage.reasoningRequests,
                  })}
                </p>
                {current.usage.cost && (
                  <details>
                    <summary>{t("projectUsage.costBreakdown")}</summary>
                    <dl className="usage-metrics">
                      {["input", "output", "cacheRead", "cacheWrite"].map(
                        (key) => (
                          <div key={key}>
                            <dt>
                              {t(`projectUsage.${key}`, { defaultValue: key })}
                            </dt>
                            <dd>
                              {usd(
                                current.usage.cost![
                                  key as keyof typeof current.usage.cost
                                ],
                              )}
                            </dd>
                          </div>
                        ),
                      )}
                    </dl>
                  </details>
                )}
              </>
            ) : tab === "models" ? (
              <div className="usage-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{t("projectUsage.model")}</th>
                      <th>{t("projectUsage.provider")}</th>
                      <UsageHeaders />
                    </tr>
                  </thead>
                  <tbody>
                    {data.models.map((row) => (
                      <tr
                        key={JSON.stringify([
                          row.provider,
                          row.model,
                          row.kind,
                        ])}
                      >
                        <th scope="row">
                          {row.model}
                          {row.kind === "tool"
                            ? ` (${t("projectUsage.toolUsage")})`
                            : ""}
                        </th>
                        <td>{row.provider}</td>
                        <UsageCells usage={row.usage} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : tab === "conversations" ? (
              <div className="usage-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{t("projectUsage.conversation")}</th>
                      <UsageHeaders />
                    </tr>
                  </thead>
                  <tbody>
                    {data.conversations.map((row) => (
                      <tr key={row.id}>
                        <th scope="row" title={row.id}>
                          {row.title}
                        </th>
                        <UsageCells usage={row.usage} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : tab === "days" ? (
              <div className="usage-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{t("projectUsage.date")}</th>
                      <UsageHeaders />
                    </tr>
                  </thead>
                  <tbody>
                    {data.days.map((row) => (
                      <tr key={row.date}>
                        <th scope="row">{row.date}</th>
                        <UsageCells usage={row.usage} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : tab === "tools" ? (
              <div className="usage-table-scroll">
                <table>
                  <thead>
                    <tr>
                      {["tool", "toolCalls", "toolErrors", "duration"].map(
                        (key) => (
                          <th key={key}>
                            {t(`projectUsage.${key}`, { defaultValue: key })}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {data.tools.map((row) => (
                      <tr key={row.name}>
                        <th scope="row">{row.name}</th>
                        <td>{count(row.calls)}</td>
                        <td>{count(row.errors)}</td>
                        <td>
                          {row.timedCalls ? duration(row.durationMs) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : tab === "requestsTab" ? (
              <>
                {data.requestsTruncated && (
                  <p className="usage-note">{t("projectUsage.requestLimit")}</p>
                )}
                <div className="usage-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>{t("projectUsage.date")}</th>
                        <th>{t("projectUsage.model")}</th>
                        <th>{t("projectUsage.status")}</th>
                        <UsageHeaders />
                        <th>{t("projectUsage.duration")}</th>
                        <th>{t("projectUsage.reasoning")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {requests
                        .slice(requestPage * 50, (requestPage + 1) * 50)
                        .map((row) => (
                          <tr key={row.id}>
                            <th scope="row" title={row.conversationId}>
                              {row.timestamp
                                ? new Date(row.timestamp).toLocaleString(
                                    language,
                                  )
                                : "—"}
                            </th>
                            <td title={row.provider}>{row.model}</td>
                            <td>
                              {t(`projectUsage.status_${row.status}`, {
                                defaultValue: row.status,
                              })}
                            </td>
                            <UsageCells usage={row.usage} />
                            <td>{duration(row.usage.durationMs)}</td>
                            <td>
                              {row.usage.reasoning === null
                                ? "—"
                                : count(row.usage.reasoning)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <div className="usage-pager">
                  <button
                    disabled={requestPage === 0}
                    onClick={() => setRequestPage((v) => v - 1)}
                  >
                    {t("projectUsage.previous")}
                  </button>
                  <span>
                    {requestPage + 1} /{" "}
                    {Math.max(1, Math.ceil(requests.length / 50))}
                  </span>
                  <button
                    disabled={(requestPage + 1) * 50 >= requests.length}
                    onClick={() => setRequestPage((v) => v + 1)}
                  >
                    {t("projectUsage.next")}
                  </button>
                </div>
              </>
            ) : tab === "canvas" ? (
              <>
                <p className="usage-note">{t("projectUsage.snapshotNote")}</p>
                {data.canvas ? (
                  <>
                    <dl className="usage-metrics">
                      {[
                        "boards",
                        "documents",
                        "tables",
                        "assets",
                        "nodes",
                        "edges",
                        "groups",
                      ].map((key) => (
                        <div key={key}>
                          <dt>
                            {t(`projectUsage.${key}`, { defaultValue: key })}
                          </dt>
                          <dd>{count(data.canvas![key as "boards"])}</dd>
                        </div>
                      ))}
                    </dl>
                    <dl className="usage-metrics">
                      {Object.entries(data.canvas.nodeTypes).map(
                        ([type, value]) => (
                          <div key={type}>
                            <dt>{type}</dt>
                            <dd>{count(value)}</dd>
                          </div>
                        ),
                      )}
                    </dl>
                  </>
                ) : (
                  <p>{t("projectUsage.noCanvas")}</p>
                )}
                <h3>
                  {t("projectUsage.generations")} · {count(data.media.total)}
                </h3>
                <dl className="usage-metrics">
                  {Object.entries(data.media.byStatus).map(
                    ([status, value]) => (
                      <div key={status}>
                        <dt>
                          {t(`projectUsage.status_${status}`, {
                            defaultValue: status,
                          })}
                        </dt>
                        <dd>{count(value)}</dd>
                      </div>
                    ),
                  )}
                </dl>
                <dl className="usage-metrics">
                  {Object.entries(data.media.byTool).map(([tool, value]) => (
                    <div key={tool}>
                      <dt>{tool}</dt>
                      <dd>{count(value)}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : null}
            {current.usage.requests === 0 && tab !== "canvas" && (
              <p>{t("projectUsage.empty")}</p>
            )}
            <footer>
              <span>
                {t("projectUsage.updated")}{" "}
                {new Date(data.generatedAt).toLocaleString(language)}
              </span>
              <button
                type="button"
                onClick={() => downloadStatistics(data, "json")}
              >
                {t("projectUsage.exportJson")}
              </button>
              <button
                type="button"
                onClick={() => downloadStatistics(data, "csv")}
              >
                {t("projectUsage.exportCsv")}
              </button>
            </footer>
            <p className="usage-note">{t("projectUsage.exportNote")}</p>
          </>
        ) : null}
      </div>
    </ProjectSettingsDialogFrame>,
    document.body,
  );
}
