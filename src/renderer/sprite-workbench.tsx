import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { LibraryAsset } from "../shared/contracts.js";
import {
  SPRITECOOK_OPERATIONS,
  SPRITE_UI_STATES,
  nineSlicePatches,
  spriteGrid,
  spriteFramesFromMetadata,
  validateSpriteRecipe,
  type SpriteCatalog,
  type SpriteField,
  type SpriteJob,
  type SpriteOperation,
  type SpriteRecipe,
  type SpriteRect,
} from "../shared/spritecook.js";
import { SPRITECOOK_SCHEMAS } from "../shared/spritecook-schema.js";
import { getLibraryAsset, uploadLibraryAsset } from "./api.js";
import { loadLibraryAssets, downloadAssetBlob } from "./library-assets.js";
import * as api from "./sprite-api.js";
import { t } from "./i18n.js";
import "./sprite-workbench.css";

const label = (name: string) =>
  t(`sprite.fields.${name}` as "sprite.fields.prompt", {
    defaultValue: name.replaceAll("_", " "),
  });
const opLabel = (name: SpriteOperation) => t(`sprite.operations.${name}`);
const text = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function SpriteWorkbench({
  initialAssetId,
  onClose,
  onAssets,
}: {
  initialAssetId?: string;
  onClose: () => void;
  onAssets?: (assets: LibraryAsset[]) => void;
}) {
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [source, setSource] = useState(initialAssetId ?? "");
  const [operation, setOperation] = useState<SpriteOperation>("animate");
  const [input, setInput] = useState<Record<string, unknown>>({});
  const [jobs, setJobs] = useState<SpriteJob[]>([]);
  const [catalog, setCatalog] = useState<SpriteCatalog>();
  const [remoteAssets, setRemoteAssets] = useState<Array<Record<string, any>>>(
    [],
  );
  const [connected, setConnected] = useState(false);
  const [tab, setTab] = useState<"local" | "provider">("local");
  const [recipe, setRecipe] = useState<SpriteRecipe>();
  const recipeRef = useRef(recipe);
  recipeRef.current = recipe;
  const [image, setImage] = useState<HTMLImageElement>();
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(0);
  const [grid, setGrid] = useState({ columns: 1, rows: 1, gap: 0, margin: 0 });
  const [history, setHistory] = useState<SpriteRecipe[]>([]);
  const [future, setFuture] = useState<SpriteRecipe[]>([]);
  const [previewSize, setPreviewSize] = useState({ width: 384, height: 192 });
  const [playing, setPlaying] = useState(false);
  const [frameIndex, setFrameIndex] = useState(0);
  const [onion, setOnion] = useState(false);
  const [pixelated, setPixelated] = useState(true);
  const [zoom, setZoom] = useState(4);
  const [attach, setAttach] = useState<Record<string, string>>({});
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const drag = useRef<
    | {
        kind: "rect" | "left" | "top" | "right" | "bottom";
        x: number;
        y: number;
      }
    | undefined
  >(undefined);
  const [pendingRect, setPendingRect] = useState<SpriteRect>();
  const [pendingCuts, setPendingCuts] = useState<{
    source: string;
    frames: SpriteRect[];
  }>();
  const dialog = useRef<HTMLElement>(null);
  const animationCanvas = useRef<HTMLCanvasElement>(null),
    nineCanvas = useRef<HTMLCanvasElement>(null);
  const active = recipe?.frames[Math.min(selected, recipe.frames.length - 1)];
  const borders = active?.borders ?? recipe?.borders;
  const change = (next: SpriteRecipe) => {
    if (recipe) setHistory((h) => [...h.slice(-49), recipe]);
    setFuture([]);
    setRecipe(next);
    setNotice("");
  };
  async function action(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(text(e));
    } finally {
      setBusy(false);
    }
  }
  async function reload() {
    const [a, j, s] = await Promise.all([
      loadLibraryAssets(),
      api.spriteJobs(),
      api.spriteSettings(),
    ]);
    setAssets(
      a.filter(
        (asset) =>
          asset.mediaType === "image" &&
          ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
            asset.contentType,
          ),
      ),
    );
    setJobs(j);
    setConnected(s.configured && s.enabled);
  }
  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      try {
        if (mounted) {
          await reload();
          if (mounted) setLoadError("");
        }
      } catch (e) {
        if (mounted) setLoadError(text(e));
      }
    };
    void poll();
    const interval = setInterval(poll, 4000);
    const priorFocus = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => {
      mounted = false;
      clearInterval(interval);
      priorFocus?.focus();
    };
  }, []);
  useEffect(() => {
    setRecipe(undefined);
    setNotice("");
    setError("");
    setImage(undefined);
    setSelected(0);
    setHistory([]);
    setFuture([]);
    setPlaying(false);
    if (!source) return;
    let disposed = false,
      url: string | undefined;
    void Promise.all([
      getLibraryAsset(source),
      api.getSpriteRecipe(source),
      api.spriteJobs(),
    ])
      .then(async ([blob, saved, records]) => {
        if (
          !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
            blob.type,
          )
        )
          throw new Error(t("sprite.bitmapOnly"));
        url = URL.createObjectURL(blob);
        const img = new Image();
        img.src = url;
        await img.decode();
        if (disposed) return;
        if (img.naturalWidth * img.naturalHeight > 16_777_216)
          throw new Error(t("sprite.tooLarge"));
        setImage(img);
        const record = records.find((j) =>
          j.assets.some((a) => a.id === source),
        );
        const rawMetadata = (
          record?.result?.local_assets as Record<string, any> | undefined
        )?.[source];
        const metadata = rawMetadata?.metadata ?? rawMetadata ?? {};
        const inferred = spriteFramesFromMetadata(
          img.naturalWidth,
          img.naturalHeight,
          metadata,
        );
        setRecipe(
          saved ?? {
            version: 1,
            assetId: source,
            width: img.naturalWidth,
            height: img.naturalHeight,
            frames: inferred ?? [
              {
                name: "frame_000",
                x: 0,
                y: 0,
                width: img.naturalWidth,
                height: img.naturalHeight,
              },
            ],
            fps: typeof metadata.fps === "number" ? metadata.fps : 12,
            loop: true,
            pivot: { x: 0.5, y: 1 },
            borders: { left: 0, top: 0, right: 0, bottom: 0 },
          },
        );
      })
      .catch((e) => {
        if (!disposed) setError(text(e));
      });
    return () => {
      disposed = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [source]);
  useEffect(() => {
    if (pendingCuts && recipe?.assetId === pendingCuts.source) {
      const next = {
        ...recipe,
        frames: pendingCuts.frames,
        borders: { left: 0, top: 0, right: 0, bottom: 0 },
      };
      try {
        validateSpriteRecipe(next);
        change(next);
        setSelected(0);
      } catch (e) {
        setError(text(e));
      }
      setPendingCuts(undefined);
    }
  }, [pendingCuts, recipe]);
  useEffect(() => {
    if (recipe) setSelected((i) => Math.min(i, recipe.frames.length - 1));
  }, [recipe?.frames.length]);
  useEffect(() => {
    setRequestId(crypto.randomUUID());
  }, [operation, input, source]);
  useEffect(() => {
    if (!playing || !recipe) return;
    const start = performance.now();
    const timer = setInterval(() => {
      const index = Math.floor(
        ((performance.now() - start) * recipe.fps) / 1000,
      );
      if (!recipe.loop && index >= recipe.frames.length) {
        setFrameIndex(recipe.frames.length - 1);
        setPlaying(false);
      } else setFrameIndex(index % recipe.frames.length);
    }, 16);
    return () => clearInterval(timer);
  }, [playing, recipe?.fps, recipe?.loop, recipe?.frames.length]);
  useEffect(() => {
    const canvas = animationCanvas.current;
    if (!canvas || !recipe || !image) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = !pixelated;
    const scale = Math.min(
      zoom,
      240 / Math.max(...recipe.frames.map((f) => f.width)),
      220 / Math.max(...recipe.frames.map((f) => f.height)),
    );
    const draw = (f: SpriteRect, alpha: number) => {
      ctx.globalAlpha = alpha;
      ctx.drawImage(
        image,
        f.x,
        f.y,
        f.width,
        f.height,
        128 - recipe.pivot.x * f.width * scale,
        240 - recipe.pivot.y * f.height * scale,
        f.width * scale,
        f.height * scale,
      );
    };
    const i = Math.min(
      playing ? frameIndex : selected,
      recipe.frames.length - 1,
    );
    if (onion && i > 0) draw(recipe.frames[i - 1]!, 0.25);
    draw(recipe.frames[i]!, 1);
  }, [recipe, image, frameIndex, playing, selected, onion, pixelated, zoom]);
  useEffect(() => {
    const canvas = nineCanvas.current;
    if (!canvas || !recipe || !image || !active) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = !pixelated;
    try {
      for (const p of nineSlicePatches(
        active.width,
        active.height,
        borders!,
        canvas.width,
        canvas.height,
      ))
        if (p.sw && p.sh && p.dw && p.dh)
          ctx.drawImage(
            image,
            active.x + p.sx,
            active.y + p.sy,
            p.sw,
            p.sh,
            p.dx,
            p.dy,
            p.dw,
            p.dh,
          );
    } catch {
      /* Invalid borders are explained by validation below. */
    }
  }, [recipe, image, selected, previewSize, pixelated]);
  async function save() {
    if (recipe) {
      validateSpriteRecipe(recipe);
      await api.saveSpriteRecipe(recipe);
      setNotice(t("sprite.saved"));
    }
  }
  const invalid = (() => {
    if (!recipe) return "";
    try {
      validateSpriteRecipe(recipe);
      return "";
    } catch (e) {
      return text(e);
    }
  })();
  const close = () => {
    if (invalid && !window.confirm(t("sprite.discardInvalid"))) return;
    if (!busy)
      void action(async () => {
        if (recipe && !invalid) await save();
        onClose();
      });
  };
  const useResults = async (outputs: LibraryAsset[]) => {
    await reload();
    onAssets?.(outputs);
    setNotice(t("sprite.added"));
  };
  const point = (e: React.PointerEvent<SVGSVGElement>) => {
    const matrix = e.currentTarget.getScreenCTM();
    const p = matrix
      ? new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse())
      : { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(recipe!.width, Math.round(p.x))),
      y: Math.max(0, Math.min(recipe!.height, Math.round(p.y))),
    };
  };
  let fieldOptions: Record<string, Array<{ value: string; name: string }>> = {};
  if (catalog) {
    fieldOptions.model = (
      Array.isArray(catalog.models.models) ? catalog.models.models : []
    ).map((m: any) => ({
      value: String(m.id ?? m.model ?? m.name),
      name: String(m.name ?? m.id ?? m.model),
    }));
    const remoteOptions = remoteAssets.map((m) => ({
      value: String(m.id),
      name: String(m.display_name ?? m.file_name ?? m.id),
    }));
    for (const key of [
      "asset_id",
      "reference_asset_id",
      "edit_asset_id",
      "style_asset_id",
    ])
      fieldOptions[key] = remoteOptions;
  }
  return createPortal(
    <div
      className="sprite-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        ref={dialog}
        tabIndex={-1}
        className="sprite-workbench"
        role="dialog"
        aria-modal="true"
        aria-label={t("sprite.title")}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            close();
          }
          if (e.key === "Tab") {
            const items = [
              ...e.currentTarget.querySelectorAll<HTMLElement>(
                "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, a[href]",
              ),
            ].filter(
              (n) =>
                !n.closest("[hidden]") &&
                (!n.closest("details:not([open])") || n.tagName === "SUMMARY"),
            );
            const first = items[0],
              last = items.at(-1);
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <header>
          <div>
            <h2>{t("sprite.title")}</h2>
            <p>{t("sprite.subtitle")}</p>
          </div>
          <button
            onClick={close}
            disabled={busy}
            aria-label={t("common.close")}
          >
            ×
          </button>
        </header>
        <div className="sprite-topbar">
          <button
            className={tab === "local" ? "active" : ""}
            onClick={() => setTab("local")}
          >
            {t("sprite.local")}
          </button>
          <button
            className={tab === "provider" ? "active" : ""}
            onClick={() => setTab("provider")}
          >
            {t("sprite.provider")}
          </button>
          <label>
            {t("sprite.source")}
            <select
              value={source}
              onChange={(e) => {
                const next = e.target.value;
                void action(async () => {
                  await save();
                  setSource(next);
                });
              }}
              disabled={busy}
            >
              <option value="">{t("sprite.noSource")}</option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="sprite-upload">
            {t("sprite.upload")}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f)
                  void action(async () => {
                    await save();
                    const asset = await uploadLibraryAsset(
                      f,
                      f.type as import("../shared/contracts.js").LibraryUploadMediaType,
                    );
                    await reload();
                    setSource(asset.id);
                  });
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {(error || loadError) && (
          <p className="sprite-error" role="alert">
            {error || loadError}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        {tab === "provider" ? (
          <div className="sprite-provider-layout">
            <form
              className="sprite-controls"
              onSubmit={(e) => {
                e.preventDefault();
                void action(async () => {
                  await start();
                });
              }}
            >
              {!connected && <p>{t("sprite.connectHint")}</p>}
              <label>
                {t("sprite.operation")}
                <select
                  value={operation}
                  onChange={(e) => {
                    setOperation(e.target.value as SpriteOperation);
                    setInput({});
                  }}
                >
                  {SPRITECOOK_OPERATIONS.map((op) => (
                    <option key={op} value={op}>
                      {opLabel(op)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={busy || !connected}
                onClick={() =>
                  void action(async () => {
                    const [c, a] = await Promise.all([
                      api.spriteCatalog(),
                      api.spriteRecent(),
                    ]);
                    setCatalog(c);
                    setRemoteAssets(Array.isArray(a.assets) ? a.assets : []);
                    setNotice(
                      c.credits
                        ? `${t("sprite.credits")}: ${Object.entries(c.credits)
                            .filter(([, v]) => typeof v !== "object")
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(" · ")}`
                        : (c.creditError ?? t("sprite.catalogLoaded")),
                    );
                  })
                }
              >
                {t("sprite.loadCatalog")}
              </button>
              <SpriteFields
                field={SPRITECOOK_SCHEMAS[operation]!}
                value={input}
                onChange={setInput}
                options={fieldOptions}
                hide={source ? ["asset_id"] : []}
              />
              {operation === "character-animations" && (
                <label>
                  {t("sprite.characterId")}
                  <input
                    required
                    value={String(input.asset_id ?? "")}
                    onChange={(e) =>
                      setInput({ ...input, asset_id: e.target.value })
                    }
                  />
                </label>
              )}
              <p className="sprite-hint">{t("sprite.paidHint")}</p>
              <button type="submit" disabled={busy || !connected}>
                {t("sprite.submit")}
              </button>
            </form>
            <div className="sprite-jobs">
              <h3>{t("sprite.history")}</h3>
              {jobs.length === 0 && <p>{t("sprite.noJobs")}</p>}
              {jobs.map((job) => (
                <article key={job.id}>
                  <strong>{opLabel(job.operation)}</strong>
                  <span>
                    {t(`sprite.statuses.${job.status}`)}{" "}
                    {job.progress !== undefined ? `${job.progress}%` : ""}
                  </span>
                  <small>{new Date(job.createdAt).toLocaleString()}</small>
                  {typeof job.input.prompt === "string" && (
                    <p>{job.input.prompt}</p>
                  )}
                  {job.remoteId && <code>{job.remoteId}</code>}
                  {job.error && <p className="sprite-error">{job.error}</p>}
                  <button
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        await save();
                        setOperation(job.operation);
                        setInput(structuredClone(job.input));
                        setSource(job.sourceAssetId ?? "");
                        setRequestId(crypto.randomUUID());
                        if (job.status === "partial")
                          setNotice(t("sprite.partialHint"));
                      })
                    }
                  >
                    {t("sprite.reuse")}
                  </button>
                  {job.remoteId && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          await api.refreshSpriteJob(job.id);
                          await reload();
                        })
                      }
                    >
                      {t("sprite.refresh")}
                    </button>
                  )}
                  {job.status === "running" && job.remoteKind !== "run" && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          await api.cancelSpriteJob(job.id);
                          await reload();
                        })
                      }
                    >
                      {t("sprite.cancel")}
                    </button>
                  )}
                  {job.status === "uncertain" && (
                    <div>
                      <p>{t("sprite.uncertainHint")}</p>
                      <input
                        aria-label={t("sprite.remoteId")}
                        value={attach[job.id] ?? ""}
                        onChange={(e) =>
                          setAttach({ ...attach, [job.id]: e.target.value })
                        }
                      />
                      <button
                        disabled={busy || !attach[job.id]}
                        onClick={() =>
                          void action(async () => {
                            await api.attachSpriteJob(job.id, attach[job.id]!);
                            await reload();
                          })
                        }
                      >
                        {t("sprite.attach")}
                      </button>
                    </div>
                  )}
                  {job.sourceAssetId &&
                    Array.isArray(
                      (job.result?.detection as any)?.rectangles,
                    ) && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void action(async () => {
                            await save();
                            const rectangles = (job.result!.detection as any)
                              .rectangles as SpriteRect[];
                            setPendingCuts({
                              source: job.sourceAssetId!,
                              frames: rectangles.map((r, i) => ({
                                ...r,
                                name: `slice_${String(i).padStart(3, "0")}`,
                              })),
                            });
                            setSource(job.sourceAssetId!);
                            setTab("local");
                          })
                        }
                      >
                        {t("sprite.reviewCuts")}
                      </button>
                    )}
                  {typeof job.result?.character_id === "string" && (
                    <>
                      <code>
                        {t("sprite.characterId")}: {job.result.character_id}
                      </code>
                      <button
                        onClick={() => {
                          setOperation("character-animations");
                          setInput({
                            asset_id: job.result!.character_id,
                            perspective: job.input.perspective ?? "platformer",
                          });
                        }}
                      >
                        {t("sprite.useCharacter")}
                      </button>
                    </>
                  )}
                  {job.assets.length > 0 && (
                    <>
                      <div className="sprite-result-list">
                        {job.assets.map((a) => (
                          <button
                            key={a.id}
                            disabled={busy}
                            onClick={() =>
                              void action(async () => {
                                await save();
                                setSource(a.id);
                                setTab("local");
                              })
                            }
                          >
                            {a.name}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() =>
                          void action(() => useResults(job.assets))
                        }
                        disabled={busy}
                      >
                        {onAssets
                          ? t("sprite.addCanvas")
                          : t("sprite.refreshLibrary")}
                      </button>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void action(async () => {
                            await save();
                            const details = job.result?.local_assets as
                              | Record<string, { download_role?: string }>
                              | undefined;
                            const sheet = job.assets.find(
                              (a) => details?.[a.id]?.download_role === "sheet",
                            );
                            setSource((sheet ?? job.assets[0])!.id);
                            setTab("local");
                          })
                        }
                      >
                        {t("sprite.editResults")}
                      </button>
                    </>
                  )}
                </article>
              ))}
            </div>
          </div>
        ) : !recipe || !image ? (
          <p className="sprite-empty">{t("sprite.chooseImage")}</p>
        ) : (
          <div className="sprite-local-layout">
            <div className="sprite-sheet">
              <p>{t("sprite.drawHint")}</p>
              <svg
                viewBox={`0 0 ${recipe.width} ${recipe.height}`}
                role="img"
                aria-label={t("sprite.sheet")}
                style={{ imageRendering: pixelated ? "pixelated" : "auto" }}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  if (!drag.current)
                    drag.current = { kind: "rect", ...point(e) };
                }}
                onPointerMove={(e) => {
                  const d = drag.current;
                  if (!d) return;
                  const p = point(e);
                  if (d.kind === "rect") {
                    const x = Math.max(0, Math.min(d.x, p.x)),
                      y = Math.max(0, Math.min(d.y, p.y));
                    setPendingRect({
                      name: `slice_${crypto.randomUUID().slice(0, 8)}`,
                      x,
                      y,
                      width: Math.min(recipe.width - x, Math.abs(p.x - d.x)),
                      height: Math.min(recipe.height - y, Math.abs(p.y - d.y)),
                    });
                  } else if (active) {
                    const border = d.kind;
                    const limit =
                      border === "left" || border === "right"
                        ? active.width
                        : active.height;
                    const other =
                      border === "left"
                        ? borders!.right
                        : border === "right"
                          ? borders!.left
                          : border === "top"
                            ? borders!.bottom
                            : borders!.top;
                    const value =
                      border === "left"
                        ? p.x - active.x
                        : border === "right"
                          ? active.x + active.width - p.x
                          : border === "top"
                            ? p.y - active.y
                            : active.y + active.height - p.y;
                    setRecipe({
                      ...recipe,
                      frames: recipe.frames.map((f, i) =>
                        i === selected
                          ? {
                              ...f,
                              borders: {
                                ...borders!,
                                [border]: Math.max(
                                  0,
                                  Math.min(limit - other - 1, value),
                                ),
                              },
                            }
                          : f,
                      ),
                    });
                  }
                }}
                onPointerUp={() => {
                  if (
                    pendingRect &&
                    pendingRect.width > 0 &&
                    pendingRect.height > 0 &&
                    recipe.frames.length < 256
                  ) {
                    change({
                      ...recipe,
                      frames: [...recipe.frames, pendingRect],
                    });
                    setSelected(recipe.frames.length);
                  }
                  drag.current = undefined;
                  setPendingRect(undefined);
                }}
                onPointerCancel={() => {
                  drag.current = undefined;
                  setPendingRect(undefined);
                }}
              >
                <image
                  href={image.src}
                  width={recipe.width}
                  height={recipe.height}
                />
                {recipe.frames.map((f, i) => (
                  <rect
                    key={i}
                    className={i === selected ? "selected" : ""}
                    x={f.x}
                    y={f.y}
                    width={f.width}
                    height={f.height}
                    onClick={() => setSelected(i)}
                  />
                ))}
                {pendingRect && <rect className="draft" {...pendingRect} />}
                {active &&
                  (["left", "right", "top", "bottom"] as const).map((side) => {
                    const vertical = side === "left" || side === "right",
                      at =
                        side === "left"
                          ? active.x + borders!.left
                          : side === "right"
                            ? active.x + active.width - borders!.right
                            : side === "top"
                              ? active.y + borders!.top
                              : active.y + active.height - borders!.bottom;
                    return (
                      <line
                        key={side}
                        className="sprite-guide"
                        x1={vertical ? at : active.x}
                        x2={vertical ? at : active.x + active.width}
                        y1={vertical ? active.y : at}
                        y2={vertical ? active.y + active.height : at}
                        onPointerDown={() => {
                          setHistory((h) => [...h.slice(-49), recipe]);
                          setFuture([]);
                          drag.current = { kind: side, x: 0, y: 0 };
                        }}
                      />
                    );
                  })}
              </svg>
              <div className="sprite-row">
                <button
                  disabled={!history.length}
                  onClick={() => {
                    const prior = history.at(-1)!;
                    setFuture((f) => [recipe, ...f]);
                    setHistory((h) => h.slice(0, -1));
                    setRecipe(prior);
                  }}
                >
                  {t("sprite.undo")}
                </button>
                <button
                  disabled={!future.length}
                  onClick={() => {
                    const next = future[0]!;
                    setHistory((h) => [...h, recipe]);
                    setFuture((f) => f.slice(1));
                    setRecipe(next);
                  }}
                >
                  {t("sprite.redo")}
                </button>
                <label>
                  <input
                    type="checkbox"
                    checked={pixelated}
                    onChange={(e) => setPixelated(e.target.checked)}
                  />
                  {t("sprite.pixelated")}
                </label>
              </div>
              <p className="sprite-hint">{t("sprite.bitmapHint")}</p>
            </div>
            <div className="sprite-controls">
              <h3>{t("sprite.grid")}</h3>
              <div className="sprite-number-grid">
                {(["columns", "rows", "gap", "margin"] as const).map((key) => (
                  <NumberField
                    key={key}
                    name={t(`sprite.${key}`)}
                    value={grid[key]}
                    onChange={(value) => setGrid({ ...grid, [key]: value })}
                  />
                ))}
              </div>
              <button
                onClick={() =>
                  void action(async () => {
                    const frames = spriteGrid(
                      recipe.width,
                      recipe.height,
                      grid.columns,
                      grid.rows,
                      grid.gap,
                      grid.margin,
                    );
                    change({
                      ...recipe,
                      frames,
                      borders: { left: 0, top: 0, right: 0, bottom: 0 },
                    });
                    setSelected(0);
                  })
                }
              >
                {t("sprite.applyGrid")}
              </button>
              <h3>{t("sprite.frames")}</h3>
              <div className="sprite-frame-list">
                {recipe.frames.map((f, i) => (
                  <button
                    className={i === selected ? "active" : ""}
                    key={i}
                    onClick={() => {
                      setSelected(i);
                      setFrameIndex(i);
                    }}
                  >
                    {i + 1} · {f.name}
                  </button>
                ))}
              </div>
              {active && (
                <>
                  <label>
                    {t("common.name")}
                    <input
                      value={active.name}
                      onChange={(e) => updateFrame({ name: e.target.value })}
                    />
                  </label>
                  <div className="sprite-number-grid">
                    {(["x", "y", "width", "height"] as const).map((key) => (
                      <NumberField
                        key={key}
                        name={
                          key === "width" || key === "height"
                            ? label(key)
                            : key.toUpperCase()
                        }
                        value={active[key]}
                        onChange={(value) => updateFrame({ [key]: value })}
                      />
                    ))}
                  </div>
                  <div className="sprite-row">
                    <button
                      disabled={selected < 1}
                      onClick={() => moveFrame(-1)}
                    >
                      {t("sprite.up")}
                    </button>
                    <button
                      disabled={selected >= recipe.frames.length - 1}
                      onClick={() => moveFrame(1)}
                    >
                      {t("sprite.down")}
                    </button>
                    <button
                      disabled={recipe.frames.length <= 1}
                      onClick={() => {
                        change({
                          ...recipe,
                          frames: recipe.frames.filter(
                            (_, i) => i !== selected,
                          ),
                        });
                        setSelected(0);
                      }}
                    >
                      {t("sprite.remove")}
                    </button>
                  </div>
                </>
              )}
              <label>
                {t("sprite.uiFamily")}
                <input
                  value={active?.family ?? ""}
                  onChange={(e) =>
                    updateFrame({ family: e.target.value || undefined })
                  }
                />
              </label>
              <label>
                {t("sprite.uiState")}
                <select
                  value={active?.state ?? "normal"}
                  onChange={(e) =>
                    updateFrame({
                      state: e.target.value as SpriteRect["state"],
                    })
                  }
                >
                  {SPRITE_UI_STATES.map((state) => (
                    <option key={state} value={state}>
                      {t(`sprite.uiStates.${state}`)}
                    </option>
                  ))}
                </select>
              </label>
              <h3>{t("sprite.nineSlice")}</h3>
              <p className="sprite-hint">{t("sprite.nineHint")}</p>
              <div className="sprite-number-grid">
                {(["left", "top", "right", "bottom"] as const).map((key) => (
                  <NumberField
                    key={key}
                    name={t(`sprite.${key}`)}
                    value={borders![key]}
                    onChange={(value) =>
                      updateFrame({ borders: { ...borders!, [key]: value } })
                    }
                  />
                ))}
              </div>
              <button
                onClick={() =>
                  change({
                    ...recipe,
                    borders: { ...borders! },
                    frames: recipe.frames.map(({ borders: _b, ...f }) => f),
                  })
                }
              >
                {t("sprite.applyBorders")}
              </button>
              <h3>{t("sprite.timing")}</h3>
              <NumberField
                name={t("sprite.fps")}
                value={recipe.fps}
                onChange={(fps) => change({ ...recipe, fps })}
              />
              <label>
                <input
                  type="checkbox"
                  checked={recipe.loop}
                  onChange={(e) =>
                    change({ ...recipe, loop: e.target.checked })
                  }
                />
                {t("sprite.loop")}
              </label>
              <div className="sprite-number-grid">
                <NumberField
                  name={t("sprite.pivotX")}
                  value={recipe.pivot.x}
                  step={0.05}
                  onChange={(x) =>
                    change({ ...recipe, pivot: { ...recipe.pivot, x } })
                  }
                />
                <NumberField
                  name={t("sprite.pivotY")}
                  value={recipe.pivot.y}
                  step={0.05}
                  onChange={(y) =>
                    change({ ...recipe, pivot: { ...recipe.pivot, y } })
                  }
                />
              </div>
              {invalid && (
                <p className="sprite-error" role="alert">
                  {invalid}
                </p>
              )}
              <button
                disabled={busy || !!invalid}
                onClick={() => void action(save)}
              >
                {t("sprite.save")}
              </button>
              <button
                disabled={busy || !!invalid}
                onClick={() =>
                  void action(async () => {
                    const a = await api.cutSpriteRecipe(recipe);
                    await useResults(a);
                  })
                }
              >
                {t("sprite.saveFrames")}
              </button>
              <button
                disabled={busy || !!invalid}
                onClick={() =>
                  void action(async () => {
                    await save();
                    const zip = await api.exportSpriteRecipe(recipe);
                    downloadAssetBlob(
                      new Blob(
                        [
                          Uint8Array.from(atob(zip.data), (c) =>
                            c.charCodeAt(0),
                          ),
                        ],
                        { type: "application/zip" },
                      ),
                      zip.fileName,
                    );
                    setNotice(t("sprite.exported"));
                  })
                }
              >
                {t("sprite.export")}
              </button>
            </div>
            <aside className="sprite-previews">
              <h3>{t("sprite.animationPreview")}</h3>
              <NumberField
                name={t("sprite.zoom")}
                value={zoom}
                onChange={(value) => setZoom(Math.max(1, Math.min(16, value)))}
              />
              <canvas ref={animationCanvas} width={256} height={256} />
              <div className="sprite-row">
                <button
                  onClick={() => {
                    setFrameIndex(0);
                    setPlaying(!playing);
                  }}
                >
                  {playing ? t("sprite.pause") : t("sprite.play")}
                </button>
                <label>
                  <input
                    type="checkbox"
                    checked={onion}
                    onChange={(e) => setOnion(e.target.checked)}
                  />
                  {t("sprite.onion")}
                </label>
              </div>
              <h3>{t("sprite.stretchPreview")}</h3>
              <div className="sprite-number-grid">
                <NumberField
                  name={label("width")}
                  value={previewSize.width}
                  onChange={(width) =>
                    setPreviewSize({
                      ...previewSize,
                      width: Math.max(1, Math.min(1024, width)),
                    })
                  }
                />
                <NumberField
                  name={label("height")}
                  value={previewSize.height}
                  onChange={(height) =>
                    setPreviewSize({
                      ...previewSize,
                      height: Math.max(1, Math.min(1024, height)),
                    })
                  }
                />
              </div>
              <div className="sprite-nine-preview">
                <canvas
                  ref={nineCanvas}
                  width={previewSize.width}
                  height={previewSize.height}
                />
              </div>
            </aside>
          </div>
        )}
      </section>
    </div>,
    document.body,
  );

  function updateFrame(update: Partial<SpriteRect>) {
    if (recipe)
      change({
        ...recipe,
        frames: recipe.frames.map((f, i) =>
          i === selected ? { ...f, ...update } : f,
        ),
      });
  }
  function moveFrame(direction: number) {
    if (!recipe) return;
    const frames = [...recipe.frames],
      next = selected + direction;
    [frames[selected], frames[next]] = [frames[next]!, frames[selected]!];
    change({ ...recipe, frames });
    setSelected(next);
  }
  async function start() {
    await api.startSpriteJob(operation, input, source || undefined, requestId);
    await reload();
    setNotice(t("sprite.submitted"));
  }
}

function NumberField({
  name,
  value,
  step = 1,
  onChange,
}: {
  name: string;
  value: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      {name}
      <input
        type="number"
        value={Number.isFinite(value) ? value : ""}
        step={step}
        onChange={(e) => onChange(e.target.valueAsNumber)}
      />
    </label>
  );
}
function SpriteFields({
  field,
  value,
  onChange,
  options,
  hide = [],
  name = "",
}: {
  field: SpriteField;
  value: any;
  onChange: (value: any) => void;
  options: Record<string, Array<{ value: string; name: string }>>;
  hide?: string[];
  name?: string;
}): ReactNode {
  if (field.type === "object") {
    const primary = new Set([
      "prompt",
      "model",
      "pixel",
      "perspective",
      "mode",
      "output_frames",
      "output_format",
      "colors",
      "theme",
      "style",
      "asset_id",
      "animation_ids",
      "custom_animations",
      "cutoff",
      "source_variant",
      "alpha_threshold",
      "min_area",
      "padding",
      "merge_distance",
      "piece_set",
      "tile_size",
      "width",
      "height",
      "resolution",
      "aspect_ratio",
    ]);
    const entries = Object.entries(field.properties ?? {}).filter(
      ([key]) => !hide.includes(key),
    );
    const render = ([key, schema]: [string, SpriteField]) => (
      <SpriteFields
        key={key}
        name={key}
        field={schema}
        value={value?.[key]}
        onChange={(v) => {
          const next = { ...value };
          if (v === undefined) delete next[key];
          else next[key] = v;
          onChange(next);
        }}
        options={options}
      />
    );
    const main = entries.filter(
        ([key]) => primary.has(key) || field.required?.includes(key),
      ),
      advanced = entries.filter(
        ([key]) => !primary.has(key) && !field.required?.includes(key),
      );
    return (
      <>
        {main.map(render)}
        {advanced.length > 0 && (
          <details>
            <summary>{t("sprite.advanced")}</summary>
            <div className="sprite-controls">{advanced.map(render)}</div>
          </details>
        )}
      </>
    );
  }
  if (field.type === "array" && field.items?.type === "object")
    return (
      <fieldset>
        <legend>{label(name)}</legend>
        {(value ?? []).map((item: any, i: number) => (
          <div key={i}>
            <SpriteFields
              field={field.items!}
              value={item}
              onChange={(v) =>
                onChange(value.map((x: any, j: number) => (i === j ? v : x)))
              }
              options={options}
            />
            <button
              type="button"
              onClick={() =>
                onChange(value.filter((_: any, j: number) => i !== j))
              }
            >
              {t("sprite.remove")}
            </button>
          </div>
        ))}
        <button type="button" onClick={() => onChange([...(value ?? []), {}])}>
          {t("sprite.add")}
        </button>
      </fieldset>
    );
  if (field.type === "array")
    return (
      <label>
        {label(name)}
        <textarea
          rows={2}
          value={(value ?? []).join("\n")}
          placeholder={t("sprite.arrayHint")}
          onChange={(e) =>
            onChange(
              e.target.value.trim()
                ? e.target.value
                    .split(/[\n,]+/)
                    .map((v) => v.trim())
                    .filter(Boolean)
                : undefined,
            )
          }
        />
      </label>
    );
  if (field.type === "boolean" && field.default === undefined)
    return (
      <label>
        {label(name)}
        <select
          value={value === undefined ? "" : String(value)}
          onChange={(e) =>
            onChange(
              e.target.value === "" ? undefined : e.target.value === "true",
            )
          }
        >
          <option value="">{t("sprite.default")}</option>
          <option value="true">{t("sprite.yes")}</option>
          <option value="false">{t("sprite.no")}</option>
        </select>
      </label>
    );
  if (field.type === "boolean")
    return (
      <label className="sprite-toggle">
        <input
          type="checkbox"
          checked={value ?? field.default ?? false}
          onChange={(e) => onChange(e.target.checked)}
        />
        {label(name)}
      </label>
    );
  const defaults: Record<string, string[]> = {
    bg_mode: ["transparent", "white", "include"],
    mode: ["assets", "texture", "ui"],
    quality: ["low", "medium", "high"],
    aspect_ratio: ["1:1", "16:9", "9:16"],
    resolution: ["1K", "2K", "4K"],
    removebg: ["None", "Basic", "Pro"],
  };
  const patternValues = field.pattern
    ?.match(/^\^\(([a-zA-Z0-9_|-]+)\)\$$/)?.[1]
    ?.split("|");
  const enumValues = field.enum ?? defaults[name] ?? patternValues;
  const choices =
    enumValues?.map((v) => ({
      value: String(v),
      name: t(`sprite.options.${v}` as "sprite.options.auto", {
        defaultValue: String(v),
      }),
    })) ?? options[name];
  if (choices?.length)
    return (
      <label>
        {label(name)}
        <select
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || undefined)}
        >
          <option value="">
            {field.default !== undefined
              ? `${t("sprite.default")}: ${String(field.default)}`
              : t("sprite.default")}
          </option>
          {choices.map((v) => (
            <option key={v.value} value={v.value}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
    );
  return (
    <label>
      {label(name)}
      {name.includes("prompt") || name === "style" ? (
        <textarea
          rows={3}
          maxLength={field.maxLength}
          value={value ?? ""}
          placeholder={field.default === undefined ? "" : String(field.default)}
          onChange={(e) => onChange(e.target.value || undefined)}
        />
      ) : (
        <input
          type={
            field.type === "integer" || field.type === "number"
              ? "number"
              : "text"
          }
          min={field.minimum}
          max={field.maximum}
          maxLength={field.maxLength}
          value={value ?? ""}
          placeholder={field.default === undefined ? "" : String(field.default)}
          onChange={(e) =>
            onChange(
              e.target.value === ""
                ? undefined
                : field.type === "integer" || field.type === "number"
                  ? e.target.valueAsNumber
                  : e.target.value,
            )
          }
        />
      )}
    </label>
  );
}
