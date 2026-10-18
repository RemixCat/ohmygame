import {
  StudioNameDialog,
  type StudioNameRequest,
} from "./studio-name-dialog.js";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import type { AssetCanvasDocument } from "../shared/contracts.js";
import {
  collapsedAncestor,
  createGroup,
  groupDescendants,
  ungroup,
  validateCanvasGroups,
} from "../shared/canvas-groups.js";
import {
  duplicateBoardFragment,
  groupFragment,
  remapNode,
} from "../shared/studio-templates.js";
import {
  STANDARD_SECTIONS,
  activeStandard,
  emptyAssetOrganization,
  inheritedStandardId,
  type ProjectProduction,
  type StudioEnvelope,
  type CanvasGroup,
  type WorkflowTemplate,
  type StudioLibrary,
} from "../shared/studio.js";
import {
  getProjectProduction,
  getStudioLibrary,
  saveStudioLibrary,
  captureStudioTemplate,
  previewStudioGeneration,
} from "./api.js";
import { exportCanvasAsset } from "./canvas-api.js";
import { t } from "./i18n.js";
import "./studio.css";

export const GROUP_PREFIX = "studio-group:";
export function StudioGroupFrame({
  data,
}: NodeProps<
  Node<{ name: string; color: string; collapsed: boolean; toggle(): void }>
>) {
  return (
    <div
      className="studio-group-frame"
      style={{ "--group-color": data.color } as CSSProperties}
    >
      <header className="studio-group-drag">
        <button className="nodrag" onClick={data.toggle}>
          {data.collapsed ? "▸" : "▾"}
        </button>
        {data.name}
      </header>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}
export function groupCanvasNodes(
  board: AssetCanvasDocument,
  toggle: (id: string) => void,
): Node[] {
  const groups = board.groups ?? [];
  return groups
    .filter((g) => !collapsedAncestor(board, { groupId: g.parentId } as any))
    .map((g) => {
      const descendants = groupDescendants(groups, g.id),
        members = board.nodes.filter(
          (n) => n.groupId && descendants.has(n.groupId),
        );
      const p = board.editorLayout.groups?.[g.id] ?? {
        x: Math.min(96, ...members.map((n) => n.position.x)) - 32,
        y: Math.min(96, ...members.map((n) => n.position.y)) - 64,
      };
      const x = members.length
          ? Math.min(...members.map((n) => n.position.x - 32))
          : p.x,
        y = members.length
          ? Math.min(...members.map((n) => n.position.y - 64))
          : p.y;
      const collapsed = p.collapsed ?? false;
      return {
        id: GROUP_PREFIX + g.id,
        type: "studio-group",
        position: { x, y },
        data: {
          name: g.name,
          color: g.color,
          collapsed,
          toggle: () => toggle(g.id),
        },
        width: collapsed
          ? 280
          : Math.max(
              300,
              ...members.map((n) => n.position.x + (n.width ?? 500) + 32 - x),
            ),
        height: collapsed
          ? 70
          : Math.max(
              150,
              ...members.map((n) => n.position.y + (n.height ?? 440) + 32 - y),
            ),
        dragHandle: ".studio-group-drag",
        selectable: false,
        deletable: false,
        connectable: false,
        zIndex: -1,
      };
    });
}
export function groupCanvasEdges(
  board: AssetCanvasDocument,
  edges: Edge[],
): Edge[] {
  const hidden = new Map(
    board.nodes.map((n) => [n.id, collapsedAncestor(board, n)]),
  );
  return edges.flatMap((e) => {
    const source = hidden.get(e.source),
      target = hidden.get(e.target);
    if (source && source === target) return [];
    return [
      {
        ...e,
        ...(source
          ? { source: GROUP_PREFIX + source, sourceHandle: undefined }
          : {}),
        ...(target
          ? { target: GROUP_PREFIX + target, targetHandle: undefined }
          : {}),
        ...(source || target ? { selectable: false, deletable: false } : {}),
      },
    ];
  });
}
export function StudioGroupsPanel({
  projectId,
  boardId,
  board,
  selected,
  onChange,
  flush,
  onEditStandards,
  actions,
  leading,
}: {
  projectId: string;
  boardId: string;
  board: AssetCanvasDocument;
  selected: string[];
  onChange(board: AssetCanvasDocument): void;
  flush(): Promise<void>;
  onEditStandards?(): void;
  actions?: ReactNode;
  leading?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [production, setProduction] = useState<ProjectProduction>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [nameRequest, setNameRequest] = useState<StudioNameRequest>();
  const [captured, setCaptured] = useState<WorkflowTemplate>();
  const [folderTarget, setFolderTarget] = useState<{
    groupId: string;
    data: StudioEnvelope<StudioLibrary>;
  }>();
  const [folderChoice, setFolderChoice] = useState("");
  const [preview, setPreview] = useState<unknown>();
  useEffect(() => {
    if (open)
      void getProjectProduction(projectId)
        .then((d) => setProduction(d.value))
        .catch((e) => setMessage(String(e)));
  }, [open, projectId]);
  function edit(action: (b: AssetCanvasDocument) => void) {
    try {
      const next = structuredClone(board);
      next.version = 2;
      action(next);
      validateCanvasGroups(next);
      onChange(next);
      setMessage("");
    } catch (e) {
      setMessage(String(e));
    }
  }
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      setMessage(t("productionStudio.saved"));
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  const node =
    selected.length === 1
      ? board.nodes.find((n) => n.id === selected[0])
      : undefined;
  const standard =
    production && node
      ? activeStandard(production, inheritedStandardId(production, board, node))
      : undefined;
  const standards = (
    <>
      <option value="">{t("productionStudio.inherit")}</option>
      {production?.standards
        .filter((s) => s.activeRevision && !s.archived)
        .map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} · v{s.activeRevision}
          </option>
        ))}
    </>
  );
  return (
    <div className="studio-canvas-tools nodrag nowheel nokey">
      <div
        className="studio-canvas-actions"
        role="toolbar"
        aria-label={t("productionStudio.canvasTools")}
      >
        {leading && <div className="studio-canvas-leading">{leading}</div>}
        {actions}
        <button
          className="studio-panel-toggle"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          {t("productionStudio.togglePanel")}
        </button>
      </div>
      {open && (
        <aside
          className="studio-panel nodrag nowheel nokey"
          aria-label={t("productionStudio.groups")}
        >
          <h3>{t("productionStudio.groups")}</h3>
          {onEditStandards && (
            <button onClick={onEditStandards}>
              {t("productionStudio.editStandards")}
            </button>
          )}
          <button
            disabled={!selected.length || busy}
            onClick={() => {
              setNameRequest({
                label: t("productionStudio.newGroup"),
                action: (name) =>
                  edit((b) => {
                    const parent = b.nodes.find(
                      (n) => n.id === selected[0],
                    )?.groupId;
                    createGroup(b, selected, name, parent);
                  }),
              });
            }}
          >
            {t("productionStudio.newGroup")}
          </button>
          {node && (
            <>
              <label>
                {t("productionStudio.nodeStandard")}
                <select
                  value={node.standardId ?? ""}
                  onChange={(e) =>
                    edit((b) => {
                      const n = b.nodes.find((n) => n.id === node.id)!;
                      if (e.target.value) n.standardId = e.target.value;
                      else delete n.standardId;
                    })
                  }
                >
                  {standards}
                </select>
              </label>
              <details>
                <summary>{t("productionStudio.overrides")}</summary>
                {STANDARD_SECTIONS.map((s) => (
                  <label key={s}>
                    {t(`productionStudio.section.${s}`)}
                    <textarea
                      value={node.standardOverrides?.[s] ?? ""}
                      onChange={(e) =>
                        edit((b) => {
                          const n = b.nodes.find((n) => n.id === node.id)!;
                          if (e.target.value)
                            (n.standardOverrides ??= {})[s] = e.target.value;
                          else if (n.standardOverrides)
                            delete n.standardOverrides[s];
                        })
                      }
                    />
                  </label>
                ))}
              </details>
              <p className="studio-note">
                {standard
                  ? `${standard.name} · v${standard.revision}`
                  : t("productionStudio.inherit")}
              </p>
              <button
                onClick={() =>
                  void run(async () => {
                    await flush();
                    setPreview(
                      (
                        await previewStudioGeneration(
                          projectId,
                          boardId,
                          node.id,
                        )
                      ).production,
                    );
                  })
                }
              >
                {t("productionStudio.inspectGeneration")}
              </button>
            </>
          )}
          {(board.groups ?? []).map((group) => {
            const children = groupDescendants(board.groups ?? [], group.id);
            const direction = production
              ? activeStandard(
                  production,
                  inheritedStandardId(production, board, {
                    groupId: group.id,
                  } as AssetCanvasDocument["nodes"][number]),
                )
              : undefined;
            return (
              <section
                key={group.id}
                className="studio-group-row"
                style={{ "--group-color": group.color } as CSSProperties}
              >
                <input
                  aria-label={t("productionStudio.name")}
                  value={group.name}
                  onChange={(e) =>
                    edit((b) => {
                      b.groups!.find((g) => g.id === group.id)!.name =
                        e.target.value;
                    })
                  }
                />
                <p className="studio-note">
                  {t("productionStudio.standard")} ·{" "}
                  {direction
                    ? `${direction.name} · v${direction.revision}`
                    : t("productionStudio.inherit")}
                </p>
                <input
                  aria-label={t("productionStudio.groupColor")}
                  type="color"
                  value={group.color}
                  onChange={(e) =>
                    edit((b) => {
                      b.groups!.find((g) => g.id === group.id)!.color =
                        e.target.value;
                    })
                  }
                />
                <label>
                  {t("productionStudio.parent")}
                  <select
                    value={group.parentId ?? ""}
                    onChange={(e) =>
                      edit((b) => {
                        const g = b.groups!.find((g) => g.id === group.id)!;
                        if (e.target.value) g.parentId = e.target.value;
                        else delete g.parentId;
                      })
                    }
                  >
                    <option value="">{t("productionStudio.root")}</option>
                    {board.groups
                      ?.filter((g) => !children.has(g.id))
                      .map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  {t("productionStudio.standard")}
                  <select
                    value={group.standardId ?? ""}
                    onChange={(e) =>
                      edit((b) => {
                        const g = b.groups!.find((g) => g.id === group.id)!;
                        if (e.target.value) g.standardId = e.target.value;
                        else delete g.standardId;
                      })
                    }
                  >
                    {standards}
                  </select>
                </label>
                <details>
                  <summary>{t("productionStudio.overrides")}</summary>
                  {STANDARD_SECTIONS.map((s) => (
                    <label key={s}>
                      {t(`productionStudio.section.${s}`)}
                      <textarea
                        value={group.standardOverrides?.[s] ?? ""}
                        onChange={(e) =>
                          edit((b) => {
                            const g = b.groups!.find((g) => g.id === group.id)!;
                            if (e.target.value)
                              (g.standardOverrides ??= {})[s] = e.target.value;
                            else if (g.standardOverrides)
                              delete g.standardOverrides[s];
                          })
                        }
                      />
                    </label>
                  ))}
                </details>
                <button
                  onClick={() =>
                    edit((b) => {
                      const p = ((b.editorLayout.groups ??= {})[group.id] ??= {
                        x: 32,
                        y: 32,
                      });
                      p.collapsed = !p.collapsed;
                    })
                  }
                >
                  {t(
                    board.editorLayout.groups?.[group.id]?.collapsed
                      ? "productionStudio.expand"
                      : "productionStudio.collapse",
                  )}
                </button>
                <button
                  disabled={!selected.length}
                  onClick={() =>
                    edit((b) => {
                      for (const n of b.nodes)
                        if (selected.includes(n.id)) n.groupId = group.id;
                    })
                  }
                >
                  {t("productionStudio.moveInto")}
                </button>
                <button
                  disabled={!selected.length}
                  onClick={() =>
                    edit((b) => {
                      for (const n of b.nodes)
                        if (selected.includes(n.id) && n.groupId === group.id) {
                          if (group.parentId) n.groupId = group.parentId;
                          else delete n.groupId;
                        }
                    })
                  }
                >
                  {t("productionStudio.moveOut")}
                </button>
                <button
                  onClick={() =>
                    edit((b) => {
                      const fragment = duplicateBoardFragment(
                        groupFragment(b, group.id),
                      );
                      b.nodes.push(...fragment.nodes);
                      b.edges.push(...fragment.edges);
                      b.groups!.push(...fragment.groups!);
                      Object.assign(
                        b.editorLayout.nodes,
                        fragment.editorLayout.nodes,
                      );
                      Object.assign(
                        (b.editorLayout.groups ??= {}),
                        fragment.editorLayout.groups,
                      );
                    })
                  }
                >
                  {t("productionStudio.duplicateGroup")}
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    setNameRequest({
                      label: t("productionStudio.templateName"),
                      initial: group.name,
                      action: (name) =>
                        void run(async () => {
                          await flush();
                          setCaptured(
                            await captureStudioTemplate(
                              projectId,
                              boardId,
                              group.id,
                              name,
                            ),
                          );
                        }),
                    });
                  }}
                >
                  {t("productionStudio.captureTemplate")}
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await flush();
                      const data = await getStudioLibrary();
                      setFolderChoice(data.value.folders[0]?.id ?? "");
                      setFolderTarget({ groupId: group.id, data });
                    })
                  }
                >
                  {t("productionStudio.groupToFolder")}
                </button>
                <button onClick={() => edit((b) => ungroup(b, group.id))}>
                  {t("productionStudio.ungroup")}
                </button>
                <button
                  onClick={() => {
                    if (
                      window.confirm(t("productionStudio.confirmDeleteGroup"))
                    )
                      edit((b) => {
                        ungroup(b, group.id, true);
                        const ids = new Map(b.nodes.map((n) => [n.id, n.id]));
                        for (const n of b.nodes) remapNode(n, ids);
                      });
                  }}
                >
                  {t("productionStudio.deleteGroup")}
                </button>
              </section>
            );
          })}
          {message && (
            <p className="studio-error" role="status">
              {message}
            </p>
          )}
        </aside>
      )}
      {nameRequest && (
        <StudioNameDialog
          request={nameRequest}
          onClose={() => setNameRequest(undefined)}
        />
      )}
      {folderTarget && (
        <div className="studio-modal" role="dialog" aria-modal="true">
          <div className="studio-comparison">
            <h3>{t("productionStudio.groupToFolder")}</h3>
            <select
              aria-label={t("productionStudio.addFolder")}
              value={folderChoice}
              onChange={(e) => setFolderChoice(e.target.value)}
            >
              <option value="">{t("productionStudio.addFolder")}</option>
              {folderTarget.data.value.folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <button
              disabled={busy || !folderChoice}
              onClick={() =>
                void run(async () => {
                  const data = folderTarget.data;
                  const descendants = groupDescendants(
                    board.groups ?? [],
                    folderTarget.groupId,
                  );
                  for (const n of board.nodes.filter(
                    (n) => n.groupId && descendants.has(n.groupId),
                  )) {
                    if ("assetId" in n.data && n.data.assetId) {
                      const { assetId } = await exportCanvasAsset(
                        projectId,
                        n.data.assetId,
                      );
                      const a = (data.value.assets[assetId] ??=
                        emptyAssetOrganization());
                      if (!a.folders.includes(folderChoice))
                        a.folders.push(folderChoice);
                    }
                  }
                  await saveStudioLibrary(data);
                  setFolderTarget(undefined);
                })
              }
            >
              {t("common.save")}
            </button>
            <button onClick={() => setFolderTarget(undefined)}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}
      {captured && (
        <div className="studio-modal" role="dialog" aria-modal="true">
          <div className="studio-comparison">
            <h3>
              {t("productionStudio.dependencies")} · {captured.name}
            </h3>
            <pre className="studio-receipt">
              {JSON.stringify(
                {
                  documents: captured.documents.map((d) => d.title),
                  tables: captured.tables.map((t) => t.title),
                  media: captured.mediaDependencies,
                  inputs: captured.inputs,
                },
                null,
                2,
              )}
            </pre>
            <p className="studio-note">
              {t("productionStudio.templateHint", { variable: "{{variable}}" })}
            </p>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const data = await getStudioLibrary();
                  data.value.templates.push(captured);
                  await saveStudioLibrary(data);
                  setCaptured(undefined);
                })
              }
            >
              {t("productionStudio.saveTemplate")}
            </button>
            <button onClick={() => setCaptured(undefined)}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}
      {preview !== undefined && (
        <div className="studio-modal" role="dialog" aria-modal="true">
          <div className="studio-comparison">
            <h3>{t("productionStudio.effective")}</h3>
            <p className="studio-note">{t("productionStudio.effectiveHint")}</p>
            <pre className="studio-receipt">
              {JSON.stringify(preview, null, 2)}
            </pre>
            <button onClick={() => setPreview(undefined)}>
              {t("productionStudio.close")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
