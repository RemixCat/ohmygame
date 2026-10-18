import {
  StudioNameDialog,
  type StudioNameRequest,
} from "./studio-name-dialog.js";
import {
  readStudioDraft,
  writeStudioDraft,
  clearStudioDraft,
} from "./studio-drafts.js";
import { useEffect, useState, type ReactNode } from "react";
import {
  getStudioLibrary,
  saveStudioLibrary,
  getProjectProduction,
  saveProjectProduction,
  listProjects,
  deleteLibraryAsset,
  renameLibraryAsset,
  uploadLibraryAsset,
} from "./api.js";
import { loadLibraryAssets, type LibraryAsset } from "./library-assets.js";
import { WorkspaceAssetCard, WorkspaceAssetDialog } from "./asset-browser.js";
import { useWorkspaceAssetUrl } from "./use-workspace-asset-url.js";
import {
  ASSET_ROLES,
  REVIEW_STATES,
  emptyAssetOrganization,
  emptyReview,
  matchesStudioFilter,
  removeFolder,
  type StudioLibrary,
  type ProjectProduction,
  type StudioEnvelope,
  type StudioFilter,
  type AssetOrganization,
  type AssetReview,
} from "../shared/studio.js";
import type { ProjectState } from "../shared/contracts.js";
import { t } from "./i18n.js";
import "./studio.css";
import { SpriteWorkbench } from "./sprite-workbench.js";

export function StudioLibraryView({
  initialProjectId,
}: {
  initialProjectId?: string;
}) {
  const draftKey = `studio-library-draft:${initialProjectId ?? "global"}`;
  const [data, setData] = useState<StudioEnvelope<StudioLibrary>>();
  const [production, setProduction] =
    useState<StudioEnvelope<ProjectProduction>>();
  const [projectId, setProjectId] = useState(initialProjectId ?? "");
  const [projects, setProjects] = useState<ProjectState[]>([]);
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [filter, setFilter] = useState<StudioFilter>({
    includeReferences: true,
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [focused, setFocused] = useState<string>();
  const [preview, setPreview] = useState<LibraryAsset>();
  const [compare, setCompare] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [nameRequest, setNameRequest] = useState<StudioNameRequest>();
  const [unfiled, setUnfiled] = useState(false);
  const [spriteWorkbench, setSpriteWorkbench] = useState(false);
  async function load() {
    try {
      const [d, a, p] = await Promise.all([
        getStudioLibrary(),
        loadLibraryAssets(),
        listProjects(),
      ]);
      const recovery = readStudioDraft<{
        data: StudioEnvelope<StudioLibrary>;
        production?: StudioEnvelope<ProjectProduction>;
        projectId: string;
      }>(draftKey);
      setData(recovery?.data ?? d);
      if (recovery) {
        setProjectId(recovery.projectId);
        setProduction(recovery.production);
      }
      if (!recovery && projectId)
        setProduction(await getProjectProduction(projectId));
      setAssets(a);
      setProjects(p);
      setDirty(!!recovery);
      setError(recovery ? t("productionStudio.recovered") : "");
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    let active = true;
    setProduction(undefined);
    if (projectId)
      void getProjectProduction(projectId)
        .then((p) => {
          if (active) {
            const recovery = readStudioDraft<{
              production?: StudioEnvelope<ProjectProduction>;
              projectId: string;
            }>(draftKey);
            setProduction(
              recovery?.projectId === projectId && recovery.production
                ? recovery.production
                : p,
            );
          }
        })
        .catch((e) => setError(String(e)));
    return () => {
      active = false;
    };
  }, [projectId]);
  useEffect(() => {
    if (dirty && data)
      writeStudioDraft(draftKey, { data, production, projectId });
  }, [dirty, data, production, projectId]);
  const library = data?.value;
  function edit(fn: (d: StudioLibrary) => void) {
    if (!data || busy) return;
    const value = structuredClone(data.value);
    fn(value);
    setData({ ...data, value });
    setDirty(true);
  }
  function review(fn: (r: AssetReview) => void, ids = selected) {
    if (!production || busy) return;
    const value = structuredClone(production.value);
    for (const id of ids) fn((value.reviews[id] ??= emptyReview()));
    setProduction({ ...production, value });
    setDirty(true);
  }
  function bulk(fn: (a: AssetOrganization) => void, ids = selected) {
    edit((d) => {
      for (const id of ids) fn((d.assets[id] ??= emptyAssetOrganization()));
    });
  }
  async function save() {
    if (!data || busy) return;
    setBusy(true);
    setError("");
    try {
      const saved = await saveStudioLibrary(data);
      setData(saved);
      if (projectId && production)
        setProduction(await saveProjectProduction(projectId, production));
      setDirty(false);
      clearStudioDraft(draftKey);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  function named(label: string, action: (name: string) => void) {
    setNameRequest({ label, action });
  }
  const ids = selected.length ? selected : focused ? [focused] : [];
  const asset = assets.find((a) => a.id === focused),
    metadata = focused
      ? (library?.assets[focused] ?? emptyAssetOrganization())
      : undefined;
  const r = focused
    ? (production?.value.reviews[focused] ?? emptyReview())
    : undefined;
  const visible = library
    ? assets.filter(
        (a) =>
          matchesStudioFilter(a, library, filter, production?.value) &&
          (!unfiled || !library.assets[a.id]?.folders.length),
      )
    : [];
  const chooseFilter = (next: StudioFilter) => {
    setFilter(next);
    setUnfiled(false);
  };
  return (
    <div className="studio-page studio-library">
      <div className="studio-mobile-toolbar">
        <button onClick={() => setRailOpen(!railOpen)}>
          {t("productionStudio.folders")} / {t("productionStudio.tags")}
        </button>
        <button onClick={() => setDetailsOpen(!detailsOpen)}>
          {t("productionStudio.details")}
        </button>
      </div>
      <aside className={`studio-rail${railOpen ? " is-open" : ""}`}>
        <button
          className="studio-mobile-close"
          onClick={() => setRailOpen(false)}
        >
          {t("productionStudio.close")}
        </button>
        <strong>{t("productionStudio.library")}</strong>
        <button onClick={() => chooseFilter({})}>
          {t("productionStudio.all")}
        </button>
        <button onClick={() => chooseFilter({ favorite: true })}>
          ☆ {t("productionStudio.favorite")}
        </button>
        <button
          onClick={() => {
            chooseFilter({});
            setUnfiled(true);
          }}
        >
          {t("productionStudio.unfiled")}
        </button>
        <h3>{t("productionStudio.folders")}</h3>
        {library?.folders.map((f) => {
          let depth = 0,
            parent = f.parentId;
          const seen = new Set<string>();
          while (parent && !seen.has(parent)) {
            seen.add(parent);
            depth++;
            parent = library.folders.find((p) => p.id === parent)?.parentId;
          }
          return (
            <div key={f.id} style={{ paddingLeft: depth * 10 }}>
              <button
                className={filter.folderId === f.id ? "is-active" : ""}
                onClick={() => chooseFilter({ ...filter, folderId: f.id })}
              >
                {f.name}
              </button>
              {filter.folderId === f.id && (
                <>
                  <button
                    title={t("productionStudio.rename")}
                    onClick={() =>
                      named(t("productionStudio.rename"), (name) =>
                        edit((d) => {
                          d.folders.find((x) => x.id === f.id)!.name = name;
                        }),
                      )
                    }
                  >
                    ✎
                  </button>
                  <button
                    title={t("productionStudio.deleteFolder")}
                    onClick={() => {
                      edit((d) => removeFolder(d, f.id));
                      setFilter({});
                    }}
                  >
                    ×
                  </button>
                </>
              )}
            </div>
          );
        })}
        <button
          onClick={() =>
            named(t("productionStudio.newFolder"), (name) =>
              edit((d) =>
                d.folders.push({
                  id: crypto.randomUUID(),
                  name,
                  ...(filter.folderId ? { parentId: filter.folderId } : {}),
                }),
              ),
            )
          }
        >
          ＋ {t("productionStudio.newFolder")}
        </button>
        <h3>{t("productionStudio.tags")}</h3>
        <div className="studio-checks">
          {library?.tags.map((tag) => (
            <label key={tag.id}>
              <input
                type="checkbox"
                checked={filter.tags?.includes(tag.id) ?? false}
                onChange={(e) =>
                  setFilter({
                    ...filter,
                    tags: e.target.checked
                      ? [...(filter.tags ?? []), tag.id]
                      : filter.tags?.filter((id) => id !== tag.id),
                  })
                }
              />
              {tag.name}
            </label>
          ))}
        </div>
        {library?.tags.map((tag) => (
          <div key={`manage:${tag.id}`}>
            <button
              title={t("productionStudio.rename")}
              onClick={() =>
                named(t("productionStudio.rename"), (name) =>
                  edit((d) => {
                    d.tags.find((t) => t.id === tag.id)!.name = name;
                  }),
                )
              }
            >
              ✎ {tag.name}
            </button>
            <button
              title={t("productionStudio.removeTag")}
              onClick={() => {
                edit((d) => {
                  d.tags = d.tags.filter((t) => t.id !== tag.id);
                  for (const a of Object.values(d.assets))
                    a.tags = a.tags.filter((id) => id !== tag.id);
                  for (const s of d.smart)
                    s.filter.tags = s.filter.tags?.filter(
                      (id) => id !== tag.id,
                    );
                });
                setFilter({
                  ...filter,
                  tags: filter.tags?.filter((id) => id !== tag.id),
                });
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button
          onClick={() =>
            named(t("productionStudio.newTag"), (name) =>
              edit((d) => d.tags.push({ id: crypto.randomUUID(), name })),
            )
          }
        >
          ＋ {t("productionStudio.newTag")}
        </button>
        <h3>{t("productionStudio.smart")}</h3>
        {library?.smart.map((s) => (
          <div key={s.id}>
            <button
              disabled={dirty && (s.reviewProjectId ?? "") !== projectId}
              onClick={() => {
                chooseFilter(s.filter);
                setProjectId(s.reviewProjectId ?? "");
              }}
            >
              {s.name}
            </button>
            <button
              title={t("productionStudio.remove")}
              onClick={() =>
                edit((d) => {
                  d.smart = d.smart.filter((x) => x.id !== s.id);
                })
              }
            >
              ×
            </button>
          </div>
        ))}
        <button
          onClick={() =>
            named(t("productionStudio.saveFilter"), (name) =>
              edit((d) =>
                d.smart.push({
                  id: crypto.randomUUID(),
                  name,
                  filter: { ...filter },
                  ...(projectId ? { reviewProjectId: projectId } : {}),
                }),
              ),
            )
          }
        >
          {t("productionStudio.saveFilter")}
        </button>
        <h3>{t("productionStudio.series")}</h3>
        {library?.series.map((s) => (
          <div key={s.id}>
            <button onClick={() => chooseFilter({ ...filter, seriesId: s.id })}>
              {s.name}
            </button>
            <button
              title={t("productionStudio.rename")}
              onClick={() =>
                named(t("productionStudio.rename"), (name) =>
                  edit((d) => {
                    d.series.find((v) => v.id === s.id)!.name = name;
                  }),
                )
              }
            >
              ✎
            </button>
          </div>
        ))}
        <button
          onClick={() =>
            named(t("productionStudio.newSeries"), (name) => {
              const id = crypto.randomUUID();
              edit((d) => {
                d.series.push({ id, name });
                for (const a of selected)
                  (d.assets[a] ??= emptyAssetOrganization()).seriesId = id;
              });
            })
          }
        >
          ＋ {t("productionStudio.newSeries")}
        </button>
      </aside>
      <main className="studio-main">
        <div className="studio-toolbar">
          <button onClick={() => setSpriteWorkbench(true)}>{t("sprite.open")}</button>
          <input
            aria-label={t("productionStudio.filters")}
            placeholder={t("library.title")}
            value={filter.query ?? ""}
            onChange={(e) => setFilter({ ...filter, query: e.target.value })}
          />
          <button disabled={!dirty || busy} onClick={() => void save()}>
            {busy ? t("common.saving") : t("productionStudio.save")}
          </button>
          <button
            disabled={busy}
            onClick={() => {
              if (!dirty || window.confirm(t("productionStudio.unsaved"))) {
                clearStudioDraft(draftKey);
                void load();
              }
            }}
          >
            {t("productionStudio.reload")}
          </button>
          <label className="studio-import">
            {t("productionStudio.import")}
            <input
              type="file"
              multiple
              accept="image/*,video/*,audio/*"
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                void (async () => {
                  try {
                    for (const file of files)
                      await uploadLibraryAsset(
                        file,
                        file.type as import("../shared/contracts.js").LibraryUploadMediaType,
                      );
                    setAssets(await loadLibraryAssets());
                  } catch (e) {
                    setError(String(e));
                  }
                })();
              }}
            />
          </label>
        </div>
        <div className="studio-filter-list">
          <label>
            {t("productionStudio.projectReferences")}
            <select
              value={filter.projectId ?? ""}
              onChange={(e) =>
                setFilter({ ...filter, projectId: e.target.value || undefined })
              }
            >
              <option value="">{t("common.all")}</option>
              <option value="unassigned">
                {t("productionStudio.unfiled")}
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("productionStudio.project")}
            <select
              value={projectId}
              disabled={dirty || busy}
              onChange={(e) => {
                setProjectId(e.target.value);
                setFilter({ ...filter, projectId: undefined });
              }}
            >
              <option value="">{t("productionStudio.global")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("productionStudio.filters")}
            <select
              value={filter.media ?? "all"}
              onChange={(e) => setFilter({ ...filter, media: e.target.value })}
            >
              {["all", "image", "video", "audio", "model"].map((v) => (
                <option key={v} value={v}>
                  {t(`assets.filter.${v}` as "assets.filter.all")}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("productionStudio.origin")}
            <select
              value={filter.origin ?? "all"}
              onChange={(e) => setFilter({ ...filter, origin: e.target.value })}
            >
              {[
                "all",
                "saved",
                "generated",
                "uploaded",
                "workspace",
                "builtin",
                "unknown",
              ].map((v) => (
                <option key={v} value={v}>
                  {t(
                    `productionStudio.origins.${v}` as "productionStudio.origins.all",
                  )}
                </option>
              ))}
            </select>
          </label>
          <select
            aria-label={t("productionStudio.tags")}
            value={filter.tagMode ?? "all"}
            onChange={(e) =>
              setFilter({ ...filter, tagMode: e.target.value as "all" | "any" })
            }
          >
            <option value="all">{t("productionStudio.allTags")}</option>
            <option value="any">{t("productionStudio.anyTags")}</option>
          </select>
          {projectId && (
            <>
              <select
                aria-label={t("productionStudio.role")}
                value={filter.role ?? ""}
                onChange={(e) =>
                  setFilter({ ...filter, role: e.target.value || undefined })
                }
              >
                <option value="">{t("productionStudio.role")}</option>
                {ASSET_ROLES.map((v) => (
                  <option key={v} value={v}>
                    {t(`productionStudio.roles.${v}`)}
                  </option>
                ))}
              </select>
              <select
                aria-label={t("productionStudio.review")}
                value={filter.status ?? ""}
                onChange={(e) =>
                  setFilter({ ...filter, status: e.target.value || undefined })
                }
              >
                <option value="">{t("productionStudio.review")}</option>
                {REVIEW_STATES.map((v) => (
                  <option key={v} value={v}>
                    {t(`productionStudio.reviews.${v}`)}
                  </option>
                ))}
              </select>
            </>
          )}
          <label className="studio-checks">
            <input
              type="checkbox"
              checked={filter.includeReferences !== false}
              onChange={(e) =>
                setFilter({ ...filter, includeReferences: e.target.checked })
              }
            />
            {t("productionStudio.includeReferences")}
          </label>
          <button onClick={() => chooseFilter({})}>
            {t("productionStudio.resetFilters")}
          </button>
        </div>
        {dirty && (
          <p className="studio-note">
            {t("productionStudio.unsaved")} · {t("productionStudio.saveBefore")}
          </p>
        )}
        {error && (
          <p role="alert" className="studio-error">
            {error}
          </p>
        )}
        {ids.length > 0 && (
          <div className="studio-toolbar">
            <span>{t("productionStudio.selected", { count: ids.length })}</span>
            <button
              onClick={() => {
                setSelected([]);
                setFocused(undefined);
              }}
            >
              {t("productionStudio.clear")}
            </button>
            <ActionSelect
              label={t("productionStudio.addTags")}
              items={library?.tags ?? []}
              onSelect={(id) =>
                bulk((a) => {
                  if (!a.tags.includes(id)) a.tags.push(id);
                }, ids)
              }
            />
            <ActionSelect
              label={t("productionStudio.removeTags")}
              items={library?.tags ?? []}
              onSelect={(id) =>
                bulk((a) => {
                  a.tags = a.tags.filter((v) => v !== id);
                }, ids)
              }
            />
            <ActionSelect
              label={t("productionStudio.addFolder")}
              items={library?.folders ?? []}
              onSelect={(id) =>
                bulk((a) => {
                  if (!a.folders.includes(id)) a.folders.push(id);
                }, ids)
              }
            />
            <ActionSelect
              label={t("productionStudio.removeFolder")}
              items={library?.folders ?? []}
              onSelect={(id) =>
                bulk((a) => {
                  a.folders = a.folders.filter((v) => v !== id);
                }, ids)
              }
            />
            <ActionSelect
              label={t("productionStudio.joinSeries")}
              items={library?.series ?? []}
              onSelect={(id) =>
                bulk((a) => {
                  a.seriesId = id;
                }, ids)
              }
            />
            {projectId && (
              <>
                <ActionSelect
                  label={t("productionStudio.addRole")}
                  items={ASSET_ROLES.map((id) => ({
                    id,
                    name: t(`productionStudio.roles.${id}`),
                  }))}
                  onSelect={(id) =>
                    review((r) => {
                      if (!r.roles.includes(id as AssetReview["roles"][number]))
                        r.roles.push(id as AssetReview["roles"][number]);
                    }, ids)
                  }
                />
                <ActionSelect
                  label={t("productionStudio.removeRole")}
                  items={ASSET_ROLES.map((id) => ({
                    id,
                    name: t(`productionStudio.roles.${id}`),
                  }))}
                  onSelect={(id) =>
                    review((r) => {
                      r.roles = r.roles.filter((role) => role !== id);
                    }, ids)
                  }
                />
              </>
            )}
            {projectId && (
              <ActionSelect
                label={t("productionStudio.review")}
                items={REVIEW_STATES.map((id) => ({
                  id,
                  name: t(`productionStudio.reviews.${id}`),
                }))}
                onSelect={(id) =>
                  review((r) => {
                    r.status = id as AssetReview["status"];
                  }, ids)
                }
              />
            )}
            <button
              disabled={
                selected.length !== 2 ||
                selected.some(
                  (id) =>
                    assets.find((a) => a.id === id)?.mediaType !== "image",
                )
              }
              onClick={() => setCompare(true)}
            >
              {t("productionStudio.compare")}
            </button>
          </div>
        )}
        <div className="studio-grid">
          {visible.map((a) => {
            const m = library?.assets[a.id],
              r = production?.value.reviews[a.id] ?? emptyReview();
            return (
              <article
                key={a.id}
                className={`studio-card${selected.includes(a.id) || focused === a.id ? " is-selected" : ""}`}
                onClick={() => {
                  setFocused(a.id);
                  setDetailsOpen(true);
                }}
              >
                <input
                  className="studio-select"
                  type="checkbox"
                  aria-label={t("productionStudio.select", { name: a.name })}
                  checked={selected.includes(a.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, a.id]
                        : selected.filter((v) => v !== a.id),
                    )
                  }
                />
                <WorkspaceAssetCard
                  asset={a}
                  title={a.name}
                  onOpen={() => {
                    setFocused(a.id);
                    setDetailsOpen(true);
                  }}
                />
                <div className="studio-badges">
                  {m?.favorite && <span>★</span>}
                  {m?.tags.map((id) => (
                    <span className="studio-badge" key={id}>
                      {library?.tags.find((t) => t.id === id)?.name}
                    </span>
                  ))}
                  {projectId && (
                    <>
                      <span className="studio-badge">
                        {t(`productionStudio.reviews.${r.status}`)}
                      </span>
                      {r.roles.map((v) => (
                        <span key={v} className="studio-badge">
                          {t(`productionStudio.roles.${v}`)}
                        </span>
                      ))}
                      {m?.seriesId &&
                        production?.value.selectedVersions[m.seriesId] ===
                          a.id && (
                          <span className="studio-badge is-current">
                            {t("productionStudio.current")}
                          </span>
                        )}
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        {data && !visible.length && (
          <p className="studio-note">{t("productionStudio.noMatch")}</p>
        )}
      </main>
      <aside className={`studio-details${detailsOpen ? " is-open" : ""}`}>
        <button
          className="studio-mobile-close"
          onClick={() => setDetailsOpen(false)}
        >
          {t("productionStudio.close")}
        </button>
        {asset && metadata && focused ? (
          <>
            <h2>{asset.name}</h2>
            <p className="studio-note">
              {asset.contentType} ·{" "}
              {asset.width && asset.height
                ? `${asset.width} × ${asset.height}`
                : ""}{" "}
              · {Math.round(asset.size / 1024)} KB
            </p>
            <button onClick={() => setPreview(asset)}>
              {t("productionStudio.preview")}
            </button>
            <button
              onClick={() =>
                named(t("productionStudio.rename"), (name) => {
                  void renameLibraryAsset(asset.id, name)
                    .then(async () => setAssets(await loadLibraryAssets()))
                    .catch((e) => setError(String(e)));
                })
              }
            >
              {t("productionStudio.rename")}
            </button>
            <label className="studio-checks">
              <input
                type="checkbox"
                checked={metadata.favorite}
                onChange={(e) =>
                  bulk(
                    (a) => {
                      a.favorite = e.target.checked;
                    },
                    [focused],
                  )
                }
              />
              {t("productionStudio.favorite")}
            </label>
            <label>
              {t("productionStudio.description")}
              <textarea
                value={metadata.description}
                onChange={(e) =>
                  bulk(
                    (a) => {
                      a.description = e.target.value;
                    },
                    [focused],
                  )
                }
              />
            </label>
            <label>
              {t("productionStudio.source")}
              <input
                value={metadata.sourceUrl}
                onChange={(e) =>
                  bulk(
                    (a) => {
                      a.sourceUrl = e.target.value;
                    },
                    [focused],
                  )
                }
              />
            </label>
            <p className="studio-note">
              {asset.projects?.map((p) => p.name).join(" · ")}
              <br />
              {t("productionStudio.usageHint")}
            </p>
            {metadata.seriesId && (
              <>
                <strong>
                  {
                    library?.series.find((s) => s.id === metadata.seriesId)
                      ?.name
                  }
                </strong>
                <button
                  onClick={() =>
                    bulk(
                      (a) => {
                        delete a.seriesId;
                      },
                      [focused],
                    )
                  }
                >
                  {t("productionStudio.leaveSeries")}
                </button>
                {production && (
                  <button
                    onClick={() => {
                      const value = structuredClone(production.value);
                      value.selectedVersions[metadata.seriesId!] = focused;
                      setProduction({ ...production, value });
                      setDirty(true);
                    }}
                  >
                    {t("productionStudio.chooseVersion")}
                  </button>
                )}
              </>
            )}
            {production && r ? (
              <>
                <h3>{t("productionStudio.specCheck")}</h3>
                <select
                  aria-label={t("productionStudio.specCheck")}
                  value={r.specificationStatus ?? "pending"}
                  onChange={(e) =>
                    review(
                      (r) => {
                        r.specificationStatus = e.target.value as
                          "pending" | "pass" | "fail";
                      },
                      [focused],
                    )
                  }
                >
                  {["pending", "pass", "fail"].map((s) => (
                    <option key={s} value={s}>
                      {t(
                        `productionStudio.specStates.${s}` as "productionStudio.specStates.pending",
                      )}
                    </option>
                  ))}
                </select>
                <textarea
                  aria-label={t("productionStudio.specCheck")}
                  value={r.specificationNotes ?? ""}
                  onChange={(e) =>
                    review(
                      (r) => {
                        r.specificationNotes = e.target.value;
                      },
                      [focused],
                    )
                  }
                />
                <h3>{t("productionStudio.visualReview")}</h3>
                <h3>{t("productionStudio.role")}</h3>
                <div className="studio-checks">
                  {ASSET_ROLES.map((role) => (
                    <label key={role}>
                      <input
                        type="checkbox"
                        checked={r.roles.includes(role)}
                        onChange={(e) =>
                          review((r) => {
                            r.roles = e.target.checked
                              ? [...r.roles, role]
                              : r.roles.filter((v) => v !== role);
                          }, ids)
                        }
                      />
                      {t(`productionStudio.roles.${role}`)}
                    </label>
                  ))}
                </div>
                <label>
                  {t("productionStudio.review")}
                  <select
                    value={r.status}
                    onChange={(e) =>
                      review(
                        (r) => {
                          r.status = e.target.value as AssetReview["status"];
                        },
                        [focused],
                      )
                    }
                  >
                    {REVIEW_STATES.map((v) => (
                      <option key={v} value={v}>
                        {t(`productionStudio.reviews.${v}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("productionStudio.notes")}
                  <textarea
                    value={r.notes}
                    onChange={(e) =>
                      review(
                        (r) => {
                          r.notes = e.target.value;
                        },
                        [focused],
                      )
                    }
                  />
                </label>
                <label>
                  {t("productionStudio.integration")}
                  <select
                    value={r.integration}
                    onChange={(e) =>
                      review(
                        (r) => {
                          r.integration = e.target
                            .value as AssetReview["integration"];
                        },
                        [focused],
                      )
                    }
                  >
                    {["none", "integrated", "verified"].map((v) => (
                      <option key={v} value={v}>
                        {t(
                          `productionStudio.integrations.${v}` as "productionStudio.integrations.none",
                        )}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("productionStudio.evidence")}
                  <textarea
                    value={r.evidence}
                    onChange={(e) =>
                      review(
                        (r) => {
                          r.evidence = e.target.value;
                        },
                        [focused],
                      )
                    }
                  />
                </label>
              </>
            ) : (
              <p className="studio-note">{t("productionStudio.projectHint")}</p>
            )}
            <h3>{t("productionStudio.receipt")}</h3>
            <pre className="studio-receipt">
              {metadata.receipt
                ? JSON.stringify(metadata.receipt, null, 2)
                : t("productionStudio.noReceipt")}
            </pre>
            <button
              onClick={() => {
                if (window.confirm(t("productionStudio.confirmDelete")))
                  void deleteLibraryAsset(asset.id)
                    .then(async () => {
                      setAssets(await loadLibraryAssets());
                      setFocused(undefined);
                      setSelected(selected.filter((v) => v !== asset.id));
                    })
                    .catch((e) => setError(String(e)));
              }}
            >
              {t("productionStudio.delete")}
            </button>
          </>
        ) : (
          <p className="studio-note">{t("productionStudio.noSelection")}</p>
        )}
      </aside>
      {nameRequest && (
        <StudioNameDialog
          request={nameRequest}
          onClose={() => setNameRequest(undefined)}
        />
      )}
      {preview && (
        <WorkspaceAssetDialog
          asset={preview}
          onClose={() => setPreview(undefined)}
        />
      )}
      {spriteWorkbench && <SpriteWorkbench initialAssetId={assets.find(a => a.id === focused && a.mediaType === "image")?.id} onClose={() => setSpriteWorkbench(false)} onAssets={async () => setAssets(await loadLibraryAssets())} />}
      {compare && selected.length === 2 && (
        <Comparison
          assets={selected.map((id) => assets.find((a) => a.id === id)!)}
          library={library!}
          onClose={() => setCompare(false)}
        />
      )}
    </div>
  );
}
export function ActionSelect({
  label,
  items,
  onSelect,
}: {
  label: string;
  items: { id: string; name: string }[];
  onSelect(id: string): void;
}) {
  return (
    <select
      aria-label={label}
      value=""
      onChange={(e) => {
        if (e.target.value) onSelect(e.target.value);
      }}
    >
      <option value="">{label}</option>
      {items.map((i) => (
        <option key={i.id} value={i.id}>
          {i.name}
        </option>
      ))}
    </select>
  );
}
function Comparison({
  assets,
  library,
  onClose,
}: {
  assets: LibraryAsset[];
  library: StudioLibrary;
  onClose(): void;
}) {
  const [zoom, setZoom] = useState(1);
  return (
    <div
      className="studio-modal"
      role="dialog"
      aria-modal="true"
      aria-label={t("productionStudio.compare")}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="studio-comparison">
        <div className="studio-toolbar">
          <strong>{t("productionStudio.compare")}</strong>
          <label>
            {t("productionStudio.zoom")}
            <input
              type="range"
              min="0.25"
              max="3"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
            />
          </label>
          <button autoFocus onClick={onClose}>
            {t("productionStudio.close")}
          </button>
        </div>
        <div className="studio-compare-pair">
          {assets.map((a) => (
            <div key={a.id}>
              <h3>{a.name}</h3>
              <CompareImage asset={a} zoom={zoom} />
              <pre className="studio-receipt">
                {JSON.stringify(
                  library.assets[a.id]?.receipt ?? { prompt: a.prompt },
                  null,
                  2,
                )}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
function CompareImage({ asset, zoom }: { asset: LibraryAsset; zoom: number }) {
  const { url } = useWorkspaceAssetUrl(undefined, asset.path, 0, asset.id);
  return (
    <div className="studio-compare-image">
      {url && (
        <img alt={asset.name} src={url} style={{ width: `${zoom * 100}%` }} />
      )}
    </div>
  );
}
