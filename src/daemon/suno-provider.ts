import { setTimeout as delay } from "node:timers/promises";
import type {
  AudioGenerationRequest,
  AudioModel,
  GeneratedAudio,
  MusicAudioRequest,
} from "../shared/audio.js";
import {
  SUNO_BASE_URL,
  SUNO_MODELS,
  SUNO_PROVIDER_ID,
  SUNO_PROVIDER_NAME,
} from "../shared/suno.js";
import {
  AudioGenerationError,
  type AudioProviderAdapter,
} from "./audio-generation.js";

const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
type RecordValue = Record<string, unknown>;
const object = (value: unknown): value is RecordValue =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

export class SunoProvider implements AudioProviderAdapter {
  readonly id = SUNO_PROVIDER_ID;
  readonly name = SUNO_PROVIDER_NAME;
  constructor(
    private readonly apiKey: () => string | undefined,
    private readonly request: typeof fetch = fetch,
    private readonly isEnabled: () => boolean = () => true,
    private readonly options: {
      pollIntervalMs?: number;
      timeoutMs?: number;
    } = {},
  ) {}
  configured(): boolean {
    return Boolean(this.apiKey());
  }
  enabled(): boolean {
    return this.isEnabled();
  }
  models(): AudioModel[] {
    return SUNO_MODELS.map((model) => structuredClone(model));
  }

  async generate(
    input: AudioGenerationRequest,
    signal?: AbortSignal,
  ): Promise<GeneratedAudio> {
    if (!this.enabled())
      throw new AudioGenerationError("Suno connection is disabled", 409);
    const key = this.apiKey();
    if (!key)
      throw new AudioGenerationError(
        "Connect Suno with a MuMu API key first",
        503,
      );
    if (input.operation !== "music")
      throw new AudioGenerationError(
        "Suno supports music generation only",
        400,
      );
    if (
      input.model?.provider !== this.id ||
      !SUNO_MODELS.some((model) => model.id === input.model?.id)
    )
      throw new AudioGenerationError(
        "The selected Suno model is unavailable",
        400,
      );
    validate(input);
    const timeout = AbortSignal.timeout(this.options.timeoutMs ?? 15 * 60_000);
    const combined = AbortSignal.any([timeout, ...(signal ? [signal] : [])]);
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    };
    let taskId: string | undefined;
    try {
      combined.throwIfAborted();
      const submitted = await this.json(
        "/suno/submit/music",
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            mv: input.model.id,
            make_instrumental: input.instrumental,
            ...(input.lyrics?.trim()
              ? {
                  prompt: input.lyrics.trim(),
                  tags: input.prompt.trim(),
                  title: input.prompt.trim().slice(0, 80),
                }
              : { gpt_description_prompt: input.prompt.trim() }),
          }),
          signal: combined,
        },
        key,
      );
      if (typeof submitted !== "string" || !submitted.trim())
        throw new AudioGenerationError("Suno returned no task ID", 502);
      taskId = submitted;
      for (;;) {
        const task = await this.json(
          `/suno/fetch/${encodeURIComponent(taskId)}`,
          { headers, signal: combined },
          key,
        );
        if (!object(task))
          throw new AudioGenerationError("Suno returned an invalid task", 502);
        if (typeof task.task_id === "string" && task.task_id !== taskId)
          throw new AudioGenerationError(
            "Suno returned a different task ID",
            502,
          );
        if (
          ["FAIL", "FAILURE", "FAILED", "CANCELLED", "CANCELED"].includes(
            String(task.status),
          )
        )
          throw new AudioGenerationError(
            `Suno: ${redact(task.failReason ?? task.fail_reason ?? "Music generation failed", key)}`,
            502,
          );
        if (task.status === "SUCCESS") {
          if (
            !Array.isArray(task.data) ||
            !task.data.length ||
            task.data.length > 4
          )
            throw new AudioGenerationError(
              "Suno returned no complete music tracks",
              502,
            );
          const tracks: GeneratedAudio[] = [];
          for (const clip of task.data) {
            if (
              !object(clip) ||
              typeof clip.audio_url !== "string" ||
              (clip.status !== undefined && clip.status !== "complete")
            )
              throw new AudioGenerationError(
                "Suno returned an incomplete music track",
                502,
              );
            const bytes = await this.download(clip.audio_url, combined);
            const duration = object(clip.metadata)
              ? clip.metadata.duration
              : undefined;
            tracks.push({
              bytes,
              mediaType: "audio/mpeg",
              model: input.model,
              metadata: {
                providerRequestId: taskId,
                ...(typeof duration === "number" &&
                Number.isFinite(duration) &&
                duration > 0
                  ? { durationMs: Math.round(duration * 1000) }
                  : {}),
              },
            });
          }
          const [first, ...alternatives] = tracks;
          return {
            ...first!,
            ...(alternatives.length ? { alternatives } : {}),
          };
        }
        if (
          !["NOT_START", "SUBMITTED", "QUEUED", "IN_PROGRESS"].includes(
            String(task.status),
          )
        )
          throw new AudioGenerationError(
            "Suno returned an unknown task status",
            502,
          );
        await delay(this.options.pollIntervalMs ?? 3_000, undefined, {
          signal: combined,
        });
      }
    } catch (cause) {
      if (signal?.aborted) throw cause;
      if (timeout.aborted)
        throw new AudioGenerationError(
          `Suno timed out${taskId ? ` (task ${taskId})` : ""}. Check the MuMu task history before generating again.`,
          504,
        );
      if (cause instanceof AudioGenerationError) throw cause;
      throw new AudioGenerationError(
        `Could not reach Suno${taskId ? ` (task ${taskId})` : ""}. Check the MuMu task history before retrying.`,
        502,
      );
    }
  }

  private async json(
    path: string,
    init: RequestInit,
    key: string,
  ): Promise<unknown> {
    // Never retry POST automatically: a lost response may already have created a paid task.
    const response = await this.request(`${SUNO_BASE_URL}${path}`, {
      ...init,
      redirect: "error",
    });
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new AudioGenerationError(
        `Suno returned an invalid response (${response.status})`,
        502,
      );
    }
    if (response.ok && object(value) && value.code === "success")
      return value.data;
    const detail = object(value)
      ? object(value.error)
        ? value.error.message
        : value.message
      : undefined;
    const message = redact(detail ?? "Request failed", key);
    if (
      response.status === 401 ||
      response.status === 403 ||
      /token|api.?key|令牌|密钥/i.test(message)
    )
      throw new AudioGenerationError(
        "Suno: MuMu API key was rejected or lacks model access",
        503,
      );
    if (/quota|credit|balance|余额|额度|积分/i.test(message))
      throw new AudioGenerationError(
        "Suno: MuMu API credit is insufficient",
        402,
      );
    throw new AudioGenerationError(
      `Suno: ${message}`,
      response.status === 429 ? 429 : response.status >= 500 ? 502 : 400,
    );
  }

  private async download(
    value: string,
    signal: AbortSignal,
  ): Promise<Uint8Array> {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new AudioGenerationError("Suno returned an invalid audio URL", 502);
    }
    if (url.protocol !== "https:" || url.username || url.password)
      throw new AudioGenerationError("Suno returned an invalid audio URL", 502);
    // CDN requests deliberately carry no MuMu credentials.
    const response = await this.request(url.href, { signal });
    if (
      !response.ok ||
      !response.body ||
      Number(response.headers.get("content-length")) > MAX_AUDIO_BYTES
    )
      throw new AudioGenerationError("Could not download the Suno audio", 502);
    const type = response.headers.get("content-type")?.split(";")[0]?.trim();
    if (
      type &&
      ![
        "audio/mpeg",
        "audio/mp3",
        "application/octet-stream",
        "binary/octet-stream",
      ].includes(type)
    )
      throw new AudioGenerationError("Suno returned a non-MP3 download", 502);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { value: chunk, done } = await reader.read();
        if (done) break;
        size += chunk.byteLength;
        if (size > MAX_AUDIO_BYTES)
          throw new AudioGenerationError(
            "Suno audio exceeds the download limit",
            502,
          );
        chunks.push(chunk);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    if (!size) throw new AudioGenerationError("Suno returned empty audio", 502);
    return Buffer.concat(chunks);
  }
}

function validate(input: MusicAudioRequest): void {
  if (!input.prompt?.trim() || input.prompt.length > 10_000)
    throw new AudioGenerationError(
      "Suno music description must contain 1–10,000 characters",
      400,
    );
  if (typeof input.instrumental !== "boolean")
    throw new AudioGenerationError("Choose instrumental or vocal music", 400);
  if (input.instrumental && input.lyrics?.trim())
    throw new AudioGenerationError(
      "Instrumental music cannot include lyrics",
      400,
    );
  if (input.lyrics && input.lyrics.length > 5_000)
    throw new AudioGenerationError(
      "Suno lyrics must contain at most 5,000 characters",
      400,
    );
  if (
    input.durationSeconds !== undefined ||
    input.loop ||
    input.referenceAssetId ||
    input.output?.sampleRate !== undefined ||
    input.output?.channels !== undefined ||
    (input.output?.format && input.output.format !== "mp3")
  )
    throw new AudioGenerationError(
      "This Suno connection supports MP3 music with automatic duration; looping, reference audio and output conversion are unavailable",
      400,
    );
}
function redact(value: unknown, key: string): string {
  return String(value).split(key).join("[redacted]").slice(0, 300);
}
