import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Handle,
  MarkerType,
  Position,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import type { AssetCanvasEdge } from "../shared/contracts.js";
import {
  TOPIC_COLORS,
  TOPIC_SHAPES,
  exportDiagram,
  type TopicNode,
} from "../shared/canvas-diagram.js";
import { ProjectSettingsDialogFrame } from "./project-settings-dialog.js";
import { Plus, MoreHorizontal, Pencil, ExternalLink } from "./icons.js";
import { t } from "./i18n.js";
import "./canvas-diagram.css";

export interface TopicRuntime {
  change(text: string): void;
  add(sibling: boolean): void;
  tools(): void;
  busy: boolean;
  board?: { linked: boolean; foreign: boolean; name?: string; edit(): void; open(): void };
}
type TopicData = {
  text?: string;
  topicColor?: TopicNode["data"]["color"];
  topicShape?: TopicNode["data"]["shape"];
  topicRuntime?: TopicRuntime;
};
export function CanvasTopicNode({
  data,
  selected,
}: Pick<NodeProps<Node<TopicData>>, "data" | "selected">) {
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(data.text ?? "");
  const field = useRef<HTMLTextAreaElement>(null),
    cancelled = useRef(false),
    originalText = useRef("");
  const runtime = data.topicRuntime;
  useEffect(() => {
    if (editing) {
      field.current?.focus();
      field.current?.select();
    }
  }, [editing]);
  useEffect(() => {
    if (!editing) setDraft(data.text ?? "");
  }, [data.text, editing]);
  function edit() {
    if (runtime?.busy) return;
    cancelled.current = false;
    originalText.current = data.text ?? "";
    setDraft(data.text ?? "");
    setEditing(true);
  }
  function commit() {
    if (!cancelled.current && draft !== (data.text ?? ""))
      runtime?.change(draft);
    setEditing(false);
  }
  return (
    <div
      className={`canvas-topic canvas-topic-${data.topicColor ?? "blue"} canvas-topic-${data.topicShape ?? "rounded"}${selected ? " is-selected" : ""}${runtime?.board?.linked ? " has-board-link" : ""}`}
      tabIndex={0}
      aria-label={data.text || t("canvasDiagram.topic")}
      onDoubleClick={edit}
      onKeyDown={(event) => {
        if (
          event.nativeEvent.isComposing ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          runtime?.busy ||
          editing ||
          event.target !== event.currentTarget
        )
          return;
        if (event.key === "F2" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          edit();
        }
        if (
          selected &&
          ((event.key === "Tab" && !event.shiftKey) || event.key === "Enter")
        ) {
          event.preventDefault();
          event.stopPropagation();
          runtime?.add(event.key === "Enter");
        }
      }}
    >
      <Handle type="target" position={Position.Left} />
      {editing ? (
        <textarea
          ref={field}
          disabled={runtime?.busy}
          className="nodrag nowheel nokey"
          aria-label={t("canvasDiagram.topicText")}
          maxLength={2000}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            runtime?.change(event.target.value);
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            if (event.key === "Escape") {
              event.preventDefault();
              cancelled.current = true;
              runtime?.change(originalText.current);
              setEditing(false);
            } else if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              commit();
            }
          }}
        />
      ) : (
        <div className="canvas-topic-text">
          {data.text || t("canvasDiagram.topic")}
        </div>
      )}
      {runtime?.board?.linked && <button type="button" className="canvas-topic-board nodrag nokey"
        title={runtime.board.name ? t("canvasBoardLinks.open", { name: runtime.board.name }) : runtime.board.foreign ? t("canvasBoardLinks.foreign") : t("canvasBoardLinks.missing")}
        disabled={runtime.busy} onDoubleClick={event => event.stopPropagation()}
        onClick={event => { event.stopPropagation(); if (runtime.board?.name) runtime.board.open(); else runtime.board?.edit(); }}>
        <ExternalLink size={12} /><span>{runtime.board.name ?? (runtime.board.foreign ? t("canvasBoardLinks.foreignShort") : t("canvasBoardLinks.missing"))}</span>
      </button>}
      {selected && (
        <div
          className="canvas-topic-actions nodrag nokey"
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={edit}
            disabled={runtime?.busy}
            aria-label={t("canvasDiagram.edit")}
            title={t("canvasDiagram.edit")}
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            onClick={() => runtime?.add(false)}
            disabled={runtime?.busy}
            title={t("canvasDiagram.childHint")}
          >
            <Plus size={13} />
            {t("canvasDiagram.child")}
          </button>
          <button
            type="button"
            onClick={() => runtime?.add(true)}
            disabled={runtime?.busy}
            title={t("canvasDiagram.siblingHint")}
          >
            {t("canvasDiagram.sibling")}
          </button>
          {runtime?.board && <button type="button" onClick={() => runtime.board?.edit()} disabled={runtime.busy} aria-label={t("canvasBoardLinks.title")} title={t("canvasBoardLinks.title")}><ExternalLink size={13} /></button>}
          <button
            type="button"
            onClick={() => runtime?.tools()}
            disabled={runtime?.busy}
            aria-label={t("canvasDiagram.tools")}
            title={t("canvasDiagram.tools")}
          >
            <MoreHorizontal size={15} />
          </button>
        </div>
      )}
      <Handle id="out" type="source" position={Position.Right} />
    </div>
  );
}

export function diagramFlowEdges(edges: readonly AssetCanvasEdge[]): Edge[] {
  return edges.map((edge) =>
    edge.kind === "diagram"
      ? {
          ...edge,
          data: { diagram: true, directed: edge.directed !== false },
          label: edge.label,
          markerEnd:
            edge.directed === false
              ? ""
              : {
                  type: MarkerType.ArrowClosed,
                  color: "var(--story-edge-color)",
                },
          labelStyle: { fill: "var(--text)", fontSize: 12 },
          labelBgStyle: { fill: "var(--surface)" },
          interactionWidth: 24,
        }
      : edge,
  );
}
/** Reciprocal relationships share a midpoint; separate their labels without changing stored content. */
export function separateDiagramLabels(edges: readonly Edge[]): Edge[] {
  const pairs = new Set(
    edges
      .filter((edge) => edge.data?.diagram)
      .map((edge) => JSON.stringify([edge.source, edge.target])),
  );
  return edges.map((edge) => {
    if (
      !edge.data?.diagram ||
      !edge.label ||
      !pairs.has(JSON.stringify([edge.target, edge.source]))
    )
      return edge;
    const transform = `translateY(${edge.source.localeCompare(edge.target) < 0 ? -14 : 14}px)`;
    return {
      ...edge,
      labelStyle: { ...edge.labelStyle, transform },
      labelBgStyle: { ...edge.labelBgStyle, transform },
    };
  });
}

export function persistCanvasEdge(edge: Edge): AssetCanvasEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
    ...(edge.data?.diagram
      ? {
          kind: "diagram",
          label: typeof edge.label === "string" ? edge.label : "",
          directed: edge.data.directed !== false,
        }
      : {}),
  };
}

export function CanvasDiagramDialog({
  nodes,
  edges,
  selectedId,
  initialEdgeId,
  busy,
  onChangeTopic,
  onChangeEdge,
  onAdd,
  onLayout,
  onClose,
}: {
  nodes: TopicNode[];
  edges: AssetCanvasEdge[];
  selectedId: string;
  initialEdgeId?: string;
  busy: boolean;
  onChangeTopic(id: string, data: TopicNode["data"]): void;
  onChangeEdge(id: string, patch: { label?: string; directed?: boolean }): void;
  onAdd(): void;
  onLayout(mode: "tree" | "layers"): void;
  onClose(): void;
}) {
  const [format, setFormat] = useState<"mermaid" | "markdown">("mermaid"),
    [error, setError] = useState("");
  const [edgeId, setEdgeId] = useState(initialEdgeId ?? edges[0]?.id ?? "");
  const topic = nodes.find((n) => n.id === selectedId),
    edge = edges.find((e) => e.id === edgeId);
  const output = exportDiagram(nodes, edges, format);
  const name = (id: string) =>
    nodes.find((n) => n.id === id)?.data.text.slice(0, 32) ||
    t("canvasDiagram.topic");
  function download() {
    const url = URL.createObjectURL(
      new Blob([output], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `diagram.${format === "mermaid" ? "mmd" : "md"}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return createPortal(
    <ProjectSettingsDialogFrame
      title={t("canvasDiagram.tools")}
      onClose={onClose}
    >
      <div className="canvas-diagram-dialog">
        <p>{t("canvasDiagram.help")}</p>
        <div className="canvas-diagram-commands">
          <button disabled={busy} onClick={() => onLayout("tree")}>
            {t("canvasDiagram.tree")}
          </button>
          <button disabled={busy} onClick={() => onLayout("layers")}>
            {t("canvasDiagram.layers")}
          </button>
          <button disabled={busy} onClick={onAdd}>
            {t("canvasDiagram.independent")}
          </button>
        </div>
        {topic && (
          <fieldset disabled={busy}>
            <legend>{t("canvasDiagram.appearance")}</legend>
            <label>
              {t("canvasDiagram.color")}
              <select
                aria-label={t("canvasDiagram.color")}
                value={topic.data.color ?? "blue"}
                onChange={(event) =>
                  onChangeTopic(topic.id, {
                    ...topic.data,
                    color: event.target.value as TopicNode["data"]["color"],
                  })
                }
              >
                {TOPIC_COLORS.map((color) => (
                  <option key={color} value={color}>
                    {t(`canvasDiagram.${color}`)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("canvasDiagram.shape")}
              <select
                aria-label={t("canvasDiagram.shape")}
                value={topic.data.shape ?? "rounded"}
                onChange={(event) =>
                  onChangeTopic(topic.id, {
                    ...topic.data,
                    shape: event.target.value as TopicNode["data"]["shape"],
                  })
                }
              >
                {TOPIC_SHAPES.map((shape) => (
                  <option key={shape} value={shape}>
                    {t(`canvasDiagram.${shape}`)}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
        )}
        {edges.length > 0 && (
          <fieldset disabled={busy}>
            <legend>{t("canvasDiagram.relationships")}</legend>
            <label>
              {t("canvasDiagram.connection")}
              <select
                aria-label={t("canvasDiagram.connection")}
                value={edge ? edgeId : ""}
                onChange={(event) => setEdgeId(event.target.value)}
              >
                <option value="">{t("canvasDiagram.chooseConnection")}</option>
                {edges.map((e) => (
                  <option key={e.id} value={e.id}>
                    {name(e.source)} → {name(e.target)}
                  </option>
                ))}
              </select>
            </label>
            {edge && (
              <>
                <label>
                  {t("canvasDiagram.relationshipLabel")}
                  <input
                    maxLength={200}
                    value={edge.label ?? ""}
                    onChange={(event) =>
                      onChangeEdge(edge.id, { label: event.target.value })
                    }
                  />
                </label>
                <label className="canvas-diagram-check">
                  <input
                    type="checkbox"
                    checked={edge.directed !== false}
                    onChange={(event) =>
                      onChangeEdge(edge.id, { directed: event.target.checked })
                    }
                  />
                  {t("canvasDiagram.directed")}
                </label>
              </>
            )}
          </fieldset>
        )}
        <label>
          {t("canvasDiagram.export")}
          <select
            aria-label={t("canvasDiagram.export")}
            value={format}
            onChange={(event) => setFormat(event.target.value as typeof format)}
          >
            <option value="mermaid">Mermaid</option>
            <option value="markdown">Markdown</option>
          </select>
        </label>
        <textarea
          readOnly
          aria-label={t("canvasDiagram.exportPreview")}
          value={output}
        />
        {error && (
          <p role="alert" className="project-settings-error">
            {error}
          </p>
        )}
        <footer>
          <button onClick={download}>{t("canvasDiagram.download")}</button>
          <button
            onClick={() => {
              void navigator.clipboard
                .writeText(output)
                .catch((cause) => setError(String(cause)));
            }}
          >
            {t("common.copy")}
          </button>
          <button onClick={onClose}>{t("common.close")}</button>
        </footer>
      </div>
    </ProjectSettingsDialogFrame>,
    document.body,
  );
}
