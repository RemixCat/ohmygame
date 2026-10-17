import { describe, expect, it, vi } from "vitest";
import { SunoProvider } from "../src/daemon/suno-provider.js";
import {
  SUNO_BASE_URL,
  SUNO_MODELS,
  SUNO_PROVIDER_ID,
} from "../src/shared/suno.js";
import type { MusicAudioRequest } from "../src/shared/audio.js";

const input: MusicAudioRequest = {
  operation: "music",
  prompt: "Quiet harbor, piano",
  instrumental: true,
  model: { provider: SUNO_PROVIDER_ID, id: "chirp-v5" },
};
const json = (data: unknown) => Response.json({ code: "success", data });
const complete = () =>
  json({
    task_id: "task-1",
    status: "SUCCESS",
    data: [
      {
        id: "a",
        status: "complete",
        audio_url: "https://cdn.suno.ai/a.mp3",
        metadata: { duration: 12.5 },
      },
      {
        id: "b",
        status: "complete",
        audio_url: "https://cdn.suno.ai/b.mp3",
        metadata: { duration: 13 },
      },
    ],
  });
const mp3 = () =>
  new Response("ID3-audio", { headers: { "Content-Type": "audio/mpeg" } });

describe("standalone MuMu Suno adapter", () => {
  it("polls until complete, downloads every variation without the API key, and preserves duration", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json("task-1"))
      .mockResolvedValueOnce(json({ status: "QUEUED" }))
      .mockResolvedValueOnce(
        json({
          status: "IN_PROGRESS",
          data: [
            { status: "streaming", audio_url: "https://cdn.suno.ai/stream" },
          ],
        }),
      )
      .mockResolvedValueOnce(complete())
      .mockResolvedValueOnce(mp3())
      .mockResolvedValueOnce(mp3());
    const provider = new SunoProvider(() => "test-secret", request, undefined, {
      pollIntervalMs: 0,
    });
    const audio = await provider.generate(input);
    expect(audio).toMatchObject({
      mediaType: "audio/mpeg",
      model: input.model,
      metadata: { durationMs: 12500, providerRequestId: "task-1" },
      alternatives: [{ metadata: { durationMs: 13000 } }],
    });
    expect(request.mock.calls[0]![0]).toBe(
      `${SUNO_BASE_URL}/suno/submit/music`,
    );
    expect(JSON.parse(String(request.mock.calls[0]![1]?.body))).toEqual({
      mv: "chirp-v5",
      make_instrumental: true,
      gpt_description_prompt: input.prompt,
    });
    expect(request.mock.calls[1]![0]).toBe(
      `${SUNO_BASE_URL}/suno/fetch/task-1`,
    );
    for (const [url, init] of request.mock.calls.filter(([url]) =>
      String(url).includes("cdn.suno.ai"),
    )) {
      expect(String(url)).not.toContain("stream");
      expect(init).not.toHaveProperty("headers");
    }
  });
  it("sends exact lyrics separately from style and advertises music capabilities only", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json("task-1"))
      .mockResolvedValueOnce(complete())
      .mockResolvedValueOnce(mp3())
      .mockResolvedValueOnce(mp3());
    const provider = new SunoProvider(() => "key", request);
    await provider.generate({
      ...input,
      instrumental: false,
      lyrics: "[Verse]\nWelcome aboard",
    });
    expect(JSON.parse(String(request.mock.calls[0]![1]?.body))).toEqual({
      mv: "chirp-v5",
      make_instrumental: false,
      prompt: "[Verse]\nWelcome aboard",
      tags: input.prompt,
      title: input.prompt,
    });
    expect(provider.models()).toEqual(SUNO_MODELS);
    expect(provider.models()[0]?.capabilities).toMatchObject({
      operations: ["music"],
      supportsDuration: false,
      supportsLyrics: true,
      supportsInstrumental: true,
    });
  });
  it.each([
    { durationSeconds: 30 },
    { loop: true },
    { referenceAssetId: "reference" },
    { output: { format: "wav" as const } },
    { lyrics: "Cannot sing instrumental lyrics" },
    { prompt: " " },
  ])(
    "rejects unsupported settings before creating a paid task: %j",
    async (patch) => {
      const request = vi.fn<typeof fetch>();
      await expect(
        new SunoProvider(() => "key", request).generate({ ...input, ...patch }),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(request).not.toHaveBeenCalled();
    },
  );
  it("rejects disconnected, disabled and speech requests", async () => {
    const request = vi.fn<typeof fetch>();
    await expect(
      new SunoProvider(() => undefined, request).generate(input),
    ).rejects.toMatchObject({ statusCode: 503 });
    await expect(
      new SunoProvider(
        () => "key",
        request,
        () => false,
      ).generate(input),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      new SunoProvider(() => "key", request).generate({
        operation: "speech",
        text: "Hello",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(request).not.toHaveBeenCalled();
  });
  it.each([
    [401, { error: { message: "Invalid token" } }, 503],
    [200, { code: "error", message: "insufficient quota" }, 402],
    [429, { message: "Too many requests" }, 429],
  ])("maps provider errors (%s)", async (status, body, statusCode) => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(body, { status }));
    await expect(
      new SunoProvider(() => "key", request).generate(input),
    ).rejects.toMatchObject({ statusCode });
    expect(request).toHaveBeenCalledOnce();
  });
  it("never resubmits after a network failure and respects cancellation and timeout", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("lost response"));
    await expect(
      new SunoProvider(() => "key", request).generate(input),
    ).rejects.toThrow("task history");
    expect(request).toHaveBeenCalledOnce();
    const controller = new AbortController();
    controller.abort();
    request.mockClear();
    await expect(
      new SunoProvider(() => "key", request).generate(input, controller.signal),
    ).rejects.toBeDefined();
    expect(request).not.toHaveBeenCalled();
    const pending = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json("task-1"))
      .mockImplementation(async () => json({ status: "IN_PROGRESS" }));
    await expect(
      new SunoProvider(() => "key", pending, undefined, {
        timeoutMs: 10,
        pollIntervalMs: 100,
      }).generate(input),
    ).rejects.toMatchObject({ statusCode: 504 });
    expect(
      pending.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(1);
  });
  it("fails terminal/unknown tasks, redacts the key, and rejects non-audio downloads", async () => {
    for (const task of [
      { status: "FAILURE", failReason: "provider said secret" },
      { status: "MYSTERY" },
      { status: "SUCCESS", data: [] },
    ]) {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(json("task-1"))
        .mockResolvedValueOnce(json(task));
      await expect(
        new SunoProvider(() => "secret", request).generate(input),
      ).rejects.toMatchObject({
        statusCode: 502,
        message: expect.not.stringContaining("secret"),
      });
    }
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json("task-1"))
      .mockResolvedValueOnce(complete())
      .mockResolvedValueOnce(
        new Response("<html>login</html>", {
          headers: { "content-type": "text/html" },
        }),
      );
    await expect(
      new SunoProvider(() => "key", request).generate(input),
    ).rejects.toThrow("non-MP3");
  });
});
