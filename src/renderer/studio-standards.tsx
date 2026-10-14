import { loadLibraryAssets, type LibraryAsset } from "./library-assets.js";
import {
  readStudioDraft,
  writeStudioDraft,
  clearStudioDraft,
} from "./studio-drafts.js";
import { useEffect, useState } from "react";
import {
  getProjectProduction,
  saveProjectProduction,
  getStudioLibrary,
  saveStudioLibrary,
  insertStudioTemplate,
} from "./api.js";
import { getCanvasWorkspace, getCanvasBoard } from "./canvas-api.js";
import {
  STANDARD_SECTIONS,
  emptyStandard,
  renderPrompt,
  type StandardSection,
  type ProjectProduction,
  type StudioEnvelope,
  type StudioLibrary,
  type WorkflowTemplate,
} from "../shared/studio.js";
import { BUILTIN_WORKFLOWS } from "../shared/studio-templates.js";
import { t } from "./i18n.js";
import "./studio.css";

export function StudioStandards({ projectId }: { projectId: string }) {
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [data, setData] = useState<StudioEnvelope<ProjectProduction>>();
  const [selected, setSelected] = useState("");
  const [section, setSection] = useState<StandardSection | "templates">("art");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    try {
      const d = await getProjectProduction(projectId);
      const recovery = readStudioDraft<StudioEnvelope<ProjectProduction>>(
        `studio-production:${projectId}`,
      );
      setData(recovery ?? d);
      const loaded = recovery ?? d;
      setSelected((id) =>
        loaded.value.standards.some((s) => s.id === id)
          ? id
          : (loaded.value.defaultStandardId ??
            loaded.value.standards[0]?.id ??
            ""),
      );
      setDirty(!!recovery);
      setError(recovery ? t("productionStudio.recovered") : "");
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => {
    void load();
    void loadLibraryAssets()
      .then(setAssets)
      .catch((e) => setError(String(e)));
  }, [projectId]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (dirty && data) writeStudioDraft(`studio-production:${projectId}`, data);
  }, [dirty, data, projectId]);
  const standard = data?.value.standards.find((s) => s.id === selected);
  function edit(fn: (p: ProjectProduction) => void) {
    if (!data || busy) return;
    const value = structuredClone(data.value);
    fn(value);
    setData({ ...data, value });
    setDirty(true);
  }
  async function save(activate = false) {
    if (!data || busy) return;
    setBusy(true);
    try {
      const value = structuredClone(data.value);
      const s = value.standards.find((s) => s.id === selected);
      if (activate && s) {
        const revision = Math.max(0, ...s.revisions.map((r) => r.revision)) + 1;
        s.revisions.push({
          revision,
          createdAt: new Date().toISOString(),
          content: structuredClone(s.draft),
        });
        s.activeRevision = revision;
        value.defaultStandardId ??= s.id;
      }
      setData(await saveProjectProduction(projectId, { ...data, value }));
      setDirty(false);
      clearStudioDraft(`studio-production:${projectId}`);
      setError("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="studio-page">
      <aside className="studio-rail">
        <strong>{t("productionStudio.title")}</strong>
        <h3>{t("productionStudio.standards")}</h3>
        {data?.value.standards.map((s) => (
          <button
            className={selected === s.id ? "is-active" : ""}
            key={s.id}
            onClick={() => setSelected(s.id)}
          >
            {s.name}
            {data.value.defaultStandardId === s.id
              ? ` · ${t("productionStudio.default")}`
              : ""}
          </button>
        ))}
        <button
          disabled={!data}
          onClick={() => {
            const id = crypto.randomUUID();
            edit((p) =>
              p.standards.push({
                id,
                name: t("productionStudio.newStandard"),
                draft: emptyStandard(),
                revisions: [],
              }),
            );
            setSelected(id);
          }}
        >
          {t("productionStudio.newStandard")}
        </button>
        <button onClick={() => setSection("templates")}>
          {t("productionStudio.templates")}
        </button>
      </aside>
      <main className="studio-main">
        <div className="studio-header">
          <h2>{t("productionStudio.title")}</h2>
          <button disabled={!dirty || busy} onClick={() => void save()}>
            {t("productionStudio.save")}
          </button>
          <button
            disabled={busy}
            onClick={() => {
              if (!dirty || window.confirm(t("productionStudio.unsaved"))) {
                clearStudioDraft(`studio-production:${projectId}`);
                void load();
              }
            }}
          >
            {t("productionStudio.reload")}
          </button>
        </div>
        <div className="studio-tabs">
          {[...STANDARD_SECTIONS, "templates" as const].map((s) => (
            <button
              key={s}
              aria-pressed={section === s}
              onClick={() => setSection(s)}
            >
              {t(`productionStudio.section.${s}`)}
            </button>
          ))}
        </div>
        {error && (
          <p className="studio-error" role="alert">
            {error}
          </p>
        )}
        {dirty && (
          <p className="studio-note">{t("productionStudio.unsaved")}</p>
        )}
        <div hidden={section !== "templates"}>
          <StudioTemplates projectId={projectId} />
        </div>
        {section !== "templates" &&
          (standard ? (
            <div className="studio-fields">
              <div className="studio-toolbar">
                <input
                  aria-label={t("productionStudio.name")}
                  value={standard.name}
                  onChange={(e) =>
                    edit((p) => {
                      p.standards.find((s) => s.id === selected)!.name =
                        e.target.value;
                    })
                  }
                />
                <span className="studio-badge">
                  {standard.activeRevision
                    ? t("productionStudio.active", {
                        revision: standard.activeRevision,
                      })
                    : t("productionStudio.draft")}
                </span>
                <button disabled={busy} onClick={() => void save(true)}>
                  {t("productionStudio.activate")}
                </button>
                <button
                  disabled={!standard.activeRevision}
                  onClick={() =>
                    edit((p) => {
                      p.defaultStandardId = selected;
                    })
                  }
                >
                  {t("productionStudio.setDefault")}
                </button>
              </div>
              <p className="studio-note">
                {t("productionStudio.standardsHint")}
              </p>
              <label>
                {t(`productionStudio.section.${section}`)} ·{" "}
                {t("productionStudio.draft")}
                <textarea
                  rows={15}
                  value={standard.draft[section]}
                  onChange={(e) =>
                    edit((p) => {
                      p.standards.find((s) => s.id === selected)!.draft[
                        section
                      ] = e.target.value;
                    })
                  }
                />
              </label>
              {section === "art" && (
                <>
                  <h3>{t("productionStudio.referenceImages")}</h3>
                  <div className="studio-checks">
                    {assets
                      .filter((a) => a.mediaType === "image")
                      .map((a) => (
                        <label key={a.id}>
                          <input
                            type="checkbox"
                            checked={standard.draft.referenceIds.includes(a.id)}
                            onChange={(e) =>
                              edit((p) => {
                                const s = p.standards.find(
                                  (s) => s.id === selected,
                                )!;
                                s.draft.referenceIds = e.target.checked
                                  ? [...s.draft.referenceIds, a.id]
                                  : s.draft.referenceIds.filter(
                                      (id) => id !== a.id,
                                    );
                              })
                            }
                          />
                          {a.name}
                        </label>
                      ))}
                  </div>
                </>
              )}
              {standard.revisions.length > 0 && (
                <details>
                  <summary>{t("productionStudio.receipt")}</summary>
                  {standard.revisions
                    .slice()
                    .reverse()
                    .map((r) => (
                      <details key={r.revision}>
                        <summary>
                          {t("productionStudio.active", {
                            revision: r.revision,
                          })}{" "}
                          · {r.createdAt}
                        </summary>
                        <pre className="studio-receipt">
                          {JSON.stringify(r.content, null, 2)}
                        </pre>
                      </details>
                    ))}
                </details>
              )}
            </div>
          ) : (
            <p className="studio-note">{t("productionStudio.noStandard")}</p>
          ))}
      </main>
    </div>
  );
}

export function StudioTemplates({ projectId }: { projectId: string }) {
  const [library, setLibrary] = useState<StudioEnvelope<StudioLibrary>>();
  const [recovery] = useState(() =>
    readStudioDraft<{
      template: WorkflowTemplate;
      library: StudioEnvelope<StudioLibrary>;
    }>("studio-template-draft-v2"),
  );
  const [selected, setSelected] = useState(
    recovery?.template.id ?? "object-views",
  );
  const [draft, setDraft] = useState<WorkflowTemplate | undefined>(
    recovery?.template,
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [bindings, setBindings] = useState<Record<string, string>>({});
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [boards, setBoards] = useState<{ id: string; name: string }[]>([]);
  const [boardId, setBoardId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void Promise.all([
      getStudioLibrary(),
      getCanvasWorkspace(projectId),
      loadLibraryAssets(),
    ])
      .then(([d, w, a]) => {
        if (!active) return;
        setLibrary(recovery?.library ?? d);
        setAssets(a);
        setBoards(w.boards);
        setBoardId(w.boards[0]?.id ?? "");
      })
      .catch((e) => setMessage(String(e)));
    return () => {
      active = false;
    };
  }, [projectId]);
  useEffect(() => {
    if (draft && library)
      writeStudioDraft("studio-template-draft-v2", {
        template: draft,
        library,
      });
  }, [draft, library]);
  const templates = [...BUILTIN_WORKFLOWS, ...(library?.value.templates ?? [])];
  const current = draft ?? templates.find((t) => t.id === selected);
  function select(id: string) {
    setSelected(id);
    clearStudioDraft("studio-template-draft-v2");
    setDraft(undefined);
    setValues({});
    setBindings({});
    setMessage("");
  }
  async function save() {
    if (!draft || !library) return;
    setBusy(true);
    try {
      const value = structuredClone(library.value);
      const old = value.templates.find((t) => t.id === draft.id);
      const next = { ...draft, revision: old ? old.revision + 1 : 1 };
      value.templates = [
        ...value.templates.filter((t) => t.id !== next.id),
        next,
      ];
      setLibrary(await saveStudioLibrary({ ...library, value }));
      setDraft(undefined);
      clearStudioDraft("studio-template-draft-v2");
      setSelected(next.id);
      setMessage(t("productionStudio.saved"));
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function use() {
    if (!current || draft) return;
    setBusy(true);
    try {
      if (current.kind === "prompt") {
        await navigator.clipboard.writeText(renderPrompt(current, values));
        setMessage(t("common.copied"));
      } else {
        const d = await getCanvasBoard(projectId, boardId);
        await insertStudioTemplate(
          projectId,
          boardId,
          current.id,
          values,
          bindings,
          d.revision,
        );
        setMessage(t("productionStudio.inserted"));
      }
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="studio-fields">
      <p className="studio-note">
        {t("productionStudio.templateHint", { variable: "{{variable}}" })}
      </p>
      <div className="studio-toolbar">
        <select
          aria-label={t("productionStudio.templates")}
          value={selected}
          disabled={!!draft || busy}
          onChange={(e) => select(e.target.value)}
        >
          {draft && !templates.some((t) => t.id === draft.id) && (
            <option value={draft.id}>{draft.name}</option>
          )}
          {templates.map((t0) => (
            <option key={t0.id} value={t0.id}>
              {BUILTIN_WORKFLOWS.some((b) => b.id === t0.id)
                ? t(
                    `productionStudio.builtins.${t0.id}` as "productionStudio.builtins.object-views",
                  )
                : t0.name}{" "}
              · v{t0.revision}
            </option>
          ))}
        </select>
        <button
          disabled={!!draft || busy}
          onClick={() => {
            const id = crypto.randomUUID();
            setSelected(id);
            setDraft({
              id,
              name: t("productionStudio.newPrompt"),
              kind: "prompt",
              revision: 1,
              prompt: "",
              variables: [],
              inputs: [],
              documents: [],
              tables: [],
            });
          }}
        >
          {t("productionStudio.newPrompt")}
        </button>
        {draft && (
          <button
            disabled={busy}
            onClick={() =>
              select(
                templates.some((t) => t.id === draft.id)
                  ? draft.id
                  : "object-views",
              )
            }
          >
            {t("productionStudio.discardDraft")}
          </button>
        )}
        {current &&
          !draft &&
          !BUILTIN_WORKFLOWS.some((t) => t.id === current.id) && (
            <button onClick={() => setDraft(structuredClone(current))}>
              {t("common.edit")}
            </button>
          )}
      </div>
      {current && (
        <>
          <label>
            {t("productionStudio.templateName")}
            <input
              disabled={!draft}
              value={current.name}
              onChange={(e) =>
                draft && setDraft({ ...draft, name: e.target.value })
              }
            />
          </label>
          {current.kind === "prompt" && (
            <label>
              {t("productionStudio.prompt")}
              <textarea
                disabled={!draft}
                value={current.prompt}
                onChange={(e) =>
                  draft && setDraft({ ...draft, prompt: e.target.value })
                }
              />
            </label>
          )}
          <h3>{t("productionStudio.variables")}</h3>
          {current.variables.map((v, i) =>
            draft ? (
              <div className="studio-variable" key={i}>
                <label>
                  {t("productionStudio.variableName")}
                  <input
                    value={v.name}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        variables: draft.variables.map((v, j) =>
                          j === i ? { ...v, name: e.target.value } : v,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  {t("productionStudio.description")}
                  <input
                    value={v.description}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        variables: draft.variables.map((v, j) =>
                          j === i ? { ...v, description: e.target.value } : v,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  {t("productionStudio.defaultValue")}
                  <input
                    value={v.defaultValue}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        variables: draft.variables.map((v, j) =>
                          j === i ? { ...v, defaultValue: e.target.value } : v,
                        ),
                      })
                    }
                  />
                </label>
                <label className="studio-checks">
                  <input
                    type="checkbox"
                    checked={v.required}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        variables: draft.variables.map((v, j) =>
                          j === i ? { ...v, required: e.target.checked } : v,
                        ),
                      })
                    }
                  />
                  {t("productionStudio.required")}
                </label>
                <button
                  onClick={() =>
                    setDraft({
                      ...draft,
                      variables: draft.variables.filter((_, j) => j !== i),
                    })
                  }
                >
                  {t("productionStudio.remove")}
                </button>
              </div>
            ) : (
              <label key={v.name}>
                {v.name}
                {v.required ? " *" : ""} · {v.description}
                <input
                  value={values[v.name] ?? v.defaultValue}
                  onChange={(e) =>
                    setValues({ ...values, [v.name]: e.target.value })
                  }
                />
              </label>
            ),
          )}
          {draft ? (
            <>
              <button
                onClick={() =>
                  setDraft({
                    ...draft,
                    variables: [
                      ...draft.variables,
                      {
                        name: `variable${draft.variables.length + 1}`,
                        description: "",
                        defaultValue: "",
                        required: true,
                      },
                    ],
                  })
                }
              >
                {t("productionStudio.addVariable")}
              </button>
              <button disabled={busy} onClick={() => void save()}>
                {t("productionStudio.saveTemplate")}
              </button>
            </>
          ) : (
            <>
              {current.kind === "workflow" && (
                <>
                  <label>
                    {t("productionStudio.board")}
                    <select
                      value={boardId}
                      onChange={(e) => setBoardId(e.target.value)}
                    >
                      {boards.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {current.inputs.length > 0 && (
                    <>
                      <h3>{t("productionStudio.bindings")}</h3>
                      <p className="studio-note">
                        {t("productionStudio.bindingHint")}
                      </p>
                      {current.inputs.map((i) => (
                        <label key={i.name}>
                          {i.name} · {i.mediaType}
                          {i.mediaType === "text" ? (
                            <textarea
                              value={bindings[i.name] ?? ""}
                              onChange={(e) =>
                                setBindings({
                                  ...bindings,
                                  [i.name]: e.target.value,
                                })
                              }
                            />
                          ) : (
                            <select
                              value={bindings[i.name] ?? ""}
                              onChange={(e) =>
                                setBindings({
                                  ...bindings,
                                  [i.name]: e.target.value,
                                })
                              }
                            >
                              <option value="">
                                {t("productionStudio.referenceInput")}
                              </option>
                              {assets
                                .filter((a) => a.mediaType === i.mediaType)
                                .map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {a.name}
                                  </option>
                                ))}
                            </select>
                          )}
                        </label>
                      ))}
                    </>
                  )}
                  <details>
                    <summary>
                      {t("productionStudio.workflow")} ·{" "}
                      {current.board?.nodes.length} / {current.documents.length}{" "}
                      / {current.tables.length}
                    </summary>
                    <pre className="studio-receipt">
                      {JSON.stringify(
                        {
                          inputs: current.inputs,
                          documents: current.documents.map((d) => d.title),
                          tables: current.tables.map((t) => t.title),
                          media: current.board?.nodes
                            .filter((n) => n.type === "asset")
                            .map((n) => n.data),
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                </>
              )}
              <button
                disabled={busy || (current.kind === "workflow" && !boardId)}
                onClick={() => void use()}
              >
                {current.kind === "prompt"
                  ? t("productionStudio.copyPrompt")
                  : t("productionStudio.useTemplate")}
              </button>
              {current.kind === "prompt" && (
                <>
                  <label>
                    {t("productionStudio.board")}
                    <select
                      value={boardId}
                      onChange={(e) => setBoardId(e.target.value)}
                    >
                      {boards.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    disabled={busy || !boardId}
                    onClick={() => {
                      void (async () => {
                        setBusy(true);
                        try {
                          renderPrompt(current, values);
                          const d = await getCanvasBoard(projectId, boardId);
                          await insertStudioTemplate(
                            projectId,
                            boardId,
                            current.id,
                            values,
                            {},
                            d.revision,
                          );
                          setMessage(t("productionStudio.inserted"));
                        } catch (e) {
                          setMessage(String(e));
                        } finally {
                          setBusy(false);
                        }
                      })();
                    }}
                  >
                    {t("productionStudio.useTemplate")}
                  </button>
                </>
              )}
            </>
          )}
        </>
      )}
      {message && (
        <p role="status" className="studio-note">
          {message}
        </p>
      )}
    </div>
  );
}
