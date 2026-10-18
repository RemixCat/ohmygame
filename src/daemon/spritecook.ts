import { createHash, randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { lookup } from "node:dns/promises";
import path from "node:path";
import {
  SPRITECOOK_BASE_URL,
  SPRITECOOK_OPERATIONS,
  validateSpriteFields,
  type SpriteCatalog,
  type SpriteJob,
  type SpriteOperation,
} from "../shared/spritecook.js";
import { SPRITECOOK_SCHEMAS } from "../shared/spritecook-schema.js";
import type { AssetLibrary } from "./asset-library.js";
import { writeSpriteJson } from "./sprite-tools.js";
import { sniffImageType } from "./image-format.js";
import { readMediaDimensions } from "./media-dimensions.js";

const terminal = new Set(["completed", "succeeded", "success", "complete"]);
const stopped = new Set(["failed", "cancelled", "canceled", "error"]);
const object = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
const identifier = (value: unknown) => {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,200}$/.test(value))
    throw new Error("Invalid remote identifier");
  return encodeURIComponent(value);
};

export class SpriteCookError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
  ) {
    super(message);
  }
}
export class SpriteCookService {
  #key?: string;
  #jobs: SpriteJob[] = [];
  #imports: Record<string, string> = {};
  #writes = Promise.resolve();
  #active = new Map<string, Promise<unknown>>();
  #timer?: ReturnType<typeof setInterval>;
  #closed = false;
  #closing = new AbortController();
  constructor(
    private directory: string,
    private library: AssetLibrary,
    private request: typeof fetch = fetch,
    private enabled: () => boolean = () => true,
    private resolveHost: (
      name: string,
    ) => Promise<Array<{ address: string }>> = (name) =>
      lookup(name, { all: true }),
  ) {}
  async load() {
    try {
      this.#key = JSON.parse(
        await readFile(
          path.join(this.directory, "spritecook-key.json"),
          "utf8",
        ),
      ).apiKey;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    try {
      const state = JSON.parse(
        await readFile(
          path.join(this.directory, "spritecook-jobs.json"),
          "utf8",
        ),
      );
      if (state.version !== 1 || !Array.isArray(state.jobs))
        throw new Error("Invalid SpriteCook state");
      this.#jobs = state.jobs;
      this.#imports = state.imports ?? {};
      for (const job of this.#jobs)
        if (job.status === "submitting") {
          job.status = "uncertain";
          job.error =
            "Submission was interrupted. Attach the existing provider task before retrying.";
        }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    this.#timer = setInterval(() => {
      if (!this.#closed && this.#key && this.enabled())
        for (const job of this.#jobs)
          if (
            job.remoteId &&
            job.account === this.account() &&
            job.status === "running"
          )
            void this.refresh(job.id).catch(() => {});
    }, 5000);
    this.#timer.unref();
  }
  settings() {
    return { configured: Boolean(this.#key), enabled: this.enabled() };
  }
  account() {
    return createHash("sha256")
      .update(this.#key ?? "")
      .digest("hex")
      .slice(0, 24);
  }
  async setKey(value: string) {
    if (this.#active.size)
      throw new SpriteCookError(
        "Wait for active provider requests before changing keys",
        409,
      );
    if (
      typeof value !== "string" ||
      !/^[\x21-\x7E]{1,10000}$/.test(value.trim())
    )
      throw new SpriteCookError("Invalid SpriteCook API key");
    return this.exclusive(async () => {
      if (this.#active.size)
        throw new SpriteCookError(
          "Wait for active provider requests before changing keys",
          409,
        );
      await writeSpriteJson(path.join(this.directory, "spritecook-key.json"), {
        version: 1,
        apiKey: value.trim(),
      });
      this.#key = value.trim();
      return this.settings();
    });
  }
  async clear() {
    if (this.#active.size)
      throw new SpriteCookError(
        "Wait for active provider requests before disconnecting",
        409,
      );
    await this.exclusive(async () => {
      if (this.#active.size)
        throw new SpriteCookError(
          "Wait for active provider requests before disconnecting",
          409,
        );
      await rm(path.join(this.directory, "spritecook-key.json"), {
        force: true,
      });
      this.#key = undefined;
    });
  }
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const pending = this.#writes.then(fn);
    this.#writes = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  }
  private persist() {
    return this.exclusive(() =>
      writeSpriteJson(path.join(this.directory, "spritecook-jobs.json"), {
        version: 1,
        jobs: this.#jobs,
        imports: this.#imports,
      }),
    );
  }
  private error(e: unknown): string {
    return String(e instanceof Error ? e.message : e)
      .split(this.#key || "\0")
      .join("[redacted]")
      .slice(0, 1200);
  }
  private async api(route: string, method = "GET", input?: unknown) {
    if (!this.#key || !this.enabled())
      throw new SpriteCookError("Connect and enable SpriteCook first", 409);
    const key = this.#key;
    const response = await this.request(
      `${SPRITECOOK_BASE_URL}/v1/api/${route}`,
      {
        method,
        redirect: "error",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        ...(input === undefined ? {} : { body: JSON.stringify(input) }),
        signal: AbortSignal.any([
          AbortSignal.timeout(90000),
          this.#closing.signal,
        ]),
      },
    );
    const value = JSON.parse(
      JSON.stringify(await response.json())
        .split(key)
        .join("[redacted]"),
    );
    if (!response.ok)
      throw new SpriteCookError(
        this.error(
          object(object(value).detail).error?.message ??
            object(object(value).detail).error?.code ??
            (typeof object(value).detail === "string"
              ? object(value).detail
              : `SpriteCook HTTP ${response.status}`),
        ),
        response.status,
      );
    // Do not persist a service response which accidentally echoes a credential.
    return object(value);
  }
  async catalog(): Promise<SpriteCatalog> {
    const [models, workflows, tilesets, credits] = await Promise.all([
      this.api("models"),
      this.api("character-workflows"),
      this.api("tilesets/options"),
      this.api("credits").catch((e) => ({ creditError: this.error(e) })),
    ]);
    return {
      models,
      workflows,
      tilesets,
      ...(credits.creditError
        ? { creditError: credits.creditError }
        : { credits }),
    };
  }
  async recent() {
    return this.api("assets/recent?limit=40");
  }
  async metadata(id: string) {
    return this.api(`assets/${identifier(id)}`);
  }
  list() {
    return structuredClone(this.#jobs);
  }
  async importAsset(id: string) {
    const { asset, absolutePath } = await this.library.content(id);
    if (asset.mediaType !== "image")
      throw new SpriteCookError("Choose an image asset");
    const bytes = await readFile(absolutePath);
    if (bytes.length > 20 * 1024 * 1024)
      throw new SpriteCookError("Import image exceeds 20 MB");
    const cacheKey = `${this.account()}:${createHash("sha256").update(bytes).digest("hex")}`;
    if (this.#imports[cacheKey]) return this.#imports[cacheKey]!;
    const result = await this.api("assets/import", "POST", {
      image: `data:${asset.contentType};base64,${bytes.toString("base64")}`,
    });
    identifier(result.id);
    this.#imports[cacheKey] = result.id;
    await this.persist();
    return result.id as string;
  }
  async start(
    operation: SpriteOperation,
    input: Record<string, unknown>,
    sourceAssetId?: string,
    requestId: string = randomUUID(),
  ) {
    if (
      !SPRITECOOK_OPERATIONS.includes(operation) ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(requestId)
    )
      throw new SpriteCookError("Invalid operation or request ID");
    const existing = this.#jobs.find((j) => j.id === requestId);
    if (existing) {
      if (
        existing.account !== this.account() ||
        existing.operation !== operation ||
        existing.sourceAssetId !== sourceAssetId ||
        JSON.stringify(existing.input) !== JSON.stringify(input)
      )
        throw new SpriteCookError(
          "Request ID belongs to another operation",
          409,
        );
      return structuredClone(existing);
    }
    if (!this.#key || !this.enabled())
      throw new SpriteCookError("Connect and enable SpriteCook first", 409);
    const schema = SPRITECOOK_SCHEMAS[operation];
    if (!schema) throw new SpriteCookError("Unsupported operation");
    const parameters = { ...input };
    // Local source binding fills asset_id, but validate before importing anything.
    const sourceOperations = [
      "animate",
      "auto-slice",
      "alpha-cutoff",
      "remove-background",
    ];
    if (sourceAssetId && sourceOperations.includes(operation))
      parameters.asset_id = "local-source";
    const validation = { ...parameters };
    if (
      ["character-animations", "auto-slice", "alpha-cutoff"].includes(operation)
    )
      delete validation.asset_id;
    validateSpriteFields(validation, schema);
    if (sourceOperations.includes(operation) && !parameters.asset_id)
      throw new SpriteCookError("Select a source image or a provider asset");
    if (operation === "character-animations" && !parameters.asset_id)
      throw new SpriteCookError(
        "Choose a SpriteCook character ID from a completed character task",
      );
    this.validateAnimation(parameters, operation, sourceAssetId);
    const job: SpriteJob = {
      id: requestId,
      operation,
      createdAt: new Date().toISOString(),
      account: this.account(),
      status: "submitting",
      input: structuredClone(input),
      sourceAssetId,
      assets: [],
    };
    this.#jobs.unshift(job);
    await this.persist();
    const pending = (async () => {
      try {
        if (job.account !== this.account())
          throw new SpriteCookError(
            "Connection changed before submission; no generation was sent",
            409,
          );
        if (sourceAssetId && sourceOperations.includes(operation))
          parameters.asset_id = await this.importAsset(sourceAssetId);
        else if (sourceAssetId && operation === "generate")
          parameters.reference_asset_id = await this.importAsset(sourceAssetId);
        const assetId = parameters.asset_id;
        let route: string =
          operation === "character" ? "characters" : operation;
        let method = "POST";
        if (operation === "character-animations") {
          route = `characters/${identifier(assetId)}/animations`;
          delete parameters.asset_id;
        }
        if (operation === "auto-slice" || operation === "alpha-cutoff") {
          route = `assets/${identifier(assetId)}/${operation}`;
          delete parameters.asset_id;
          if (operation === "alpha-cutoff") method = "PUT";
        }
        const result = await this.api(route, method, parameters);
        job.remoteId =
          result.job_id ??
          (operation === "character-animations" ? result.id : undefined);
        if (job.remoteId) identifier(job.remoteId);
        job.remoteKind = operation === "character-animations" ? "run" : "job";
        job.result = result;
        job.status = job.remoteId ? "running" : "completed";
        await this.persist();
        if (!job.remoteId || terminal.has(String(result.status).toLowerCase()))
          await this.finish(job, result);
      } catch (e) {
        job.status = job.remoteId
          ? "download_failed"
          : e instanceof SpriteCookError &&
              e.statusCode >= 400 &&
              e.statusCode < 500
            ? "failed"
            : "uncertain";
        job.error = this.error(e);
        await this.persist();
      }
    })();
    this.#active.set(job.id, pending);
    void pending
      .catch((e) => {
        job.status = job.remoteId ? "download_failed" : "uncertain";
        job.error = this.error(e);
      })
      .finally(() => this.#active.delete(job.id));
    return structuredClone(job);
  }
  private validateAnimation(
    input: Record<string, unknown>,
    operation: SpriteOperation,
    source?: string,
  ) {
    if (operation !== "animate") return;
    const model = input.model,
      count = input.output_frames ?? 8;
    if (
      (model === "pixel-engine-v1.5" &&
        (Number(count) < 3 || Number(count) > 16)) ||
      (model !== "pixel-engine-v1.5" && Number(count) % 2)
    )
      throw new SpriteCookError("This model does not support that frame count");
    const pixel = input.pixel;
    if (input.use_random_seed === false && !Number.isInteger(input.seed))
      throw new SpriteCookError(
        "A fixed seed is required when random seed is disabled",
      );
    if (
      (model === "pixel-engine-v1.1" ||
        (pixel === true && model !== "pixel-engine-v1.5")) &&
      Number(count) > 16
    )
      throw new SpriteCookError("Pixel animation supports at most 16 frames");
    if (model === "pixel-engine-v1.5" && input.negative_prompt)
      throw new SpriteCookError(
        "This model does not support a negative prompt",
      );
    if (source) {
      const asset = this.library.get(source);
      if (pixel === true && asset?.contentType !== "image/png")
        throw new SpriteCookError("Pixel animation requires a PNG source");
      if (asset?.width && asset.height) {
        if (
          pixel === true &&
          (asset.width > (model === "pixel-engine-v1.5" ? 320 : 256) ||
            asset.height > (model === "pixel-engine-v1.5" ? 320 : 256))
        )
          throw new SpriteCookError(
            "Pixel source exceeds this model's image size limit",
          );
        if (
          pixel === false &&
          (asset.width < 256 ||
            asset.height < 256 ||
            asset.width > 2048 ||
            asset.height > 2048)
        )
          throw new SpriteCookError(
            "Detailed source must be between 256 and 2048 pixels per side",
          );
      }
    }
  }
  async refresh(id: string): Promise<SpriteJob> {
    const job = this.#jobs.find((j) => j.id === id);
    if (!job) throw new SpriteCookError("Task not found", 404);
    if (this.#active.has(id)) {
      await this.#active.get(id);
      return structuredClone(job);
    }
    if (!job.remoteId || job.account !== this.account())
      throw new SpriteCookError(
        "Task belongs to another key or needs its provider task ID",
        409,
      );
    if (job.status === "completed" || job.status === "cancelled")
      return structuredClone(job);
    const pending = (async () => {
      try {
        const result = await this.api(
          `${job.remoteKind === "run" ? "character-animation-runs" : "jobs"}/${identifier(job.remoteId)}`,
        );
        job.result = result;
        job.progress =
          typeof result.progress === "number" ? result.progress : undefined;
        const status = String(result.status).toLowerCase();
        if (terminal.has(status)) await this.finish(job, result);
        else if (stopped.has(status)) {
          // Preserve successful members of a partially failed character batch.
          if (
            Array.isArray(result.result_asset_ids) &&
            result.result_asset_ids.length
          ) {
            await this.finish(job, result);
            job.status = "partial";
          } else
            job.status = status.startsWith("cancel") ? "cancelled" : "failed";
          job.error = this.error(
            result.error_message ??
              result.error?.message ??
              "Provider task stopped",
          );
        } else {
          job.status = "running";
          job.error = undefined;
        }
      } catch (e) {
        job.error = this.error(e);
        if (terminal.has(String(job.result?.status).toLowerCase()))
          job.status = "download_failed";
      }
      await this.persist();
    })();
    this.#active.set(id, pending);
    try {
      await pending;
    } finally {
      this.#active.delete(id);
    }
    return structuredClone(job);
  }
  async attach(id: string, remoteId: string) {
    const job = this.#jobs.find((j) => j.id === id);
    if (!job || job.status !== "uncertain" || job.account !== this.account())
      throw new SpriteCookError(
        "Only an uncertain task from this key can be attached",
        409,
      );
    identifier(remoteId);
    job.remoteId = remoteId;
    job.remoteKind = job.operation === "character-animations" ? "run" : "job";
    job.status = "running";
    await this.persist();
    return this.refresh(id);
  }
  async cancel(id: string) {
    const job = this.#jobs.find((j) => j.id === id);
    if (!job?.remoteId || job.account !== this.account())
      throw new SpriteCookError("Task cannot be cancelled", 409);
    if (job.remoteKind === "run")
      throw new SpriteCookError(
        "The public API does not expose batch-run cancellation; cancel its individual jobs in the provider dashboard",
        409,
      );
    const result = await this.api(
      `jobs/${identifier(job.remoteId)}/cancel`,
      "POST",
    );
    if (result.cancelled === true) job.status = "cancelled";
    await this.persist();
    return structuredClone(job);
  }
  private async finish(job: SpriteJob, result: Record<string, any>) {
    if (job.operation === "animate" && result.output?.metadata) {
      const m = result.output.metadata;
      if (
        m.frame_count != null &&
        (!Number.isInteger(m.frame_count) ||
          m.frame_count !== (job.input.output_frames ?? 8))
      )
        throw new SpriteCookError(
          "Provider completed with an unexpected animation frame count; resume this task to retrieve corrected results",
          502,
        );
      for (const name of ["frame_width", "frame_height"])
        if (m[name] != null && (!Number.isInteger(m[name]) || m[name] < 1))
          throw new SpriteCookError(
            "Provider returned invalid frame dimensions",
            502,
          );
    }
    const urls = new Map<
      string,
      { id: string; metadata: Record<string, any> }
    >();
    const collect = (value: unknown, depth = 0) => {
      if (depth > 6) return;
      if (Array.isArray(value)) {
        value.slice(0, 128).forEach((v) => collect(v, depth + 1));
        return;
      }
      const node = object(value),
        id = String(node.id ?? node.asset_id ?? job.remoteId ?? job.id);
      for (const key of [
        "url",
        "sprite_url",
        "spritesheet_url",
        "raw_url",
        "pixel_url",
      ])
        if (typeof node[key] === "string")
          urls.set(node[key], { id, metadata: node });
      for (const key of [
        "assets",
        "output",
        "file",
        "items",
        "result",
        "asset",
      ])
        if (node[key]) collect(node[key], depth + 1);
    };
    collect(result);
    for (const asset of Array.isArray(result.assets) ? result.assets : [])
      if (asset.id && !asset.url && !asset.sprite_url && !asset.spritesheet_url)
        collect(await this.metadata(asset.id));
    if (Array.isArray(result.result_asset_ids))
      for (const id of result.result_asset_ids.slice(0, 128))
        collect(await this.metadata(id));
    if (!urls.size && result.output?.asset_id)
      collect(await this.metadata(result.output.asset_id));
    if (!urls.size)
      throw new SpriteCookError(
        "Provider completed without downloadable image outputs",
        502,
      );
    if (urls.size > 128)
      throw new SpriteCookError("Too many result files", 502);
    let total = 0;
    for (const [url, info] of urls) {
      const key = `spritecook:${job.account}:${job.id}:${createHash("sha256").update(url.split("?")[0]!).digest("hex")}`;
      const bytes = await this.download(url);
      total += bytes.length;
      if (total > 128 * 1024 * 1024)
        throw new SpriteCookError("Result batch exceeds 128 MB", 502);
      const type =
        sniffImageType(bytes) ??
        (/^GIF8[79]a/.test(bytes.toString("ascii", 0, 6))
          ? "image/gif"
          : undefined);
      if (!type)
        throw new SpriteCookError(
          "Provider result is not a supported image or animation",
          502,
        );
      const ext = type.split("/")[1] === "jpeg" ? "jpg" : type.split("/")[1];
      const asset = await this.library.add(
        `spritecook-${job.operation}-${job.id.slice(0, 8)}-${job.assets.length + 1}.${ext}`,
        bytes,
        {
          origin: "generated",
          prompt:
            typeof job.input.prompt === "string" ? job.input.prompt : undefined,
          sourceKey: key,
        },
      );
      const dimensions = await this.library
        .content(asset.id)
        .then((a) => readMediaDimensions(a.absolutePath));
      if (!dimensions?.width || !dimensions.height)
        throw new SpriteCookError(
          "Could not validate result image dimensions",
          502,
        );
      if (
        url === info.metadata.spritesheet_url &&
        info.metadata.metadata?.frame_width &&
        info.metadata.metadata?.frame_height
      ) {
        const m = info.metadata.metadata;
        if (
          dimensions.width % m.frame_width ||
          dimensions.height % m.frame_height ||
          (dimensions.width / m.frame_width) *
            (dimensions.height / m.frame_height) <
            m.frame_count
        )
          throw new SpriteCookError(
            "Sprite sheet dimensions do not match its frame metadata",
            502,
          );
      }
      if (!job.assets.some((a) => a.id === asset.id)) job.assets.push(asset);
      // Preserve provider dimensions/frame metadata separately from local Library media records.
      const metadata: Record<string, unknown> = {
        ...info.metadata,
        local_asset_id: asset.id,
        download_role:
          url === info.metadata.spritesheet_url ? "sheet" : "image",
      };
      delete metadata.local_assets;
      const localMetadata = (job.result ??= {}).local_assets as
        Record<string, unknown> | undefined;
      job.result.local_assets = { ...localMetadata, [asset.id]: metadata };
      await this.persist();
    }
    job.status = "completed";
    job.error = undefined;
    await this.persist();
  }
  private async download(value: string): Promise<Buffer> {
    let url = new URL(value);
    for (let redirects = 0; redirects < 5; redirects++) {
      if (url.protocol !== "https:" || url.username || url.password)
        throw new SpriteCookError("Result must use a public HTTPS URL", 502);
      // Validate every redirect destination before contacting an untrusted result host.
      const addresses = await this.resolveHost(
        url.hostname.replace(/^\[|\]$/g, ""),
      );
      if (
        !addresses.length ||
        addresses.some(
          ({ address }) =>
            /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
              address,
            ) ||
            (address.includes(":") && !/^2[0-9a-f]{3}:/i.test(address)),
        )
      )
        throw new SpriteCookError(
          "Result URL points to a private address",
          502,
        );
      const response = await this.request(url.href, {
        redirect: "manual",
        signal: AbortSignal.any([
          AbortSignal.timeout(90000),
          this.#closing.signal,
        ]),
        headers: { "User-Agent": "Mozilla/5.0 OhMyGame" },
      });
      if (
        response.status >= 300 &&
        response.status < 400 &&
        response.headers.get("location")
      ) {
        url = new URL(response.headers.get("location")!, url);
        continue;
      }
      if (!response.ok)
        throw new SpriteCookError(
          `Result download failed (HTTP ${response.status})`,
          502,
        );
      const reader = response.body?.getReader();
      if (!reader) throw new SpriteCookError("Empty result", 502);
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 32 * 1024 * 1024)
            throw new SpriteCookError("Result exceeds 32 MB", 502);
          chunks.push(part.value);
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      return Buffer.concat(chunks);
    }
    throw new SpriteCookError("Too many result redirects", 502);
  }
  async close() {
    this.#closed = true;
    clearInterval(this.#timer);
    this.#closing.abort();
    await Promise.allSettled(this.#active.values());
    await this.#writes;
  }
}
