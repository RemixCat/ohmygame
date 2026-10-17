import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createApp } from "../src/daemon/app.js";
import { SunoSettingsStore } from "../src/daemon/suno-settings.js";
import { SUNO_PROVIDER_ID } from "../src/shared/suno.js";
import type { AudioModelCatalog } from "../src/shared/audio.js";
import type { ToolJob } from "../src/shared/contracts.js";
import { AssetLibrary } from "../src/daemon/asset-library.js";
import { ToolRunner } from "../src/daemon/tools.js";

const cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
async function directory() {
  const dir = await mkdtemp(path.join(tmpdir(), "ohmygame-suno-"));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

it("serializes key changes, persists privately and clears without exposing the secret", async () => {
  const dir = await directory(),
    settings = new SunoSettingsStore(dir);
  await settings.load();
  expect(settings.get()).toEqual({ configured: false });
  await expect(settings.update("invalid\nkey")).rejects.toThrow("ASCII");
  await Promise.all([
    settings.update("first-key"),
    settings.update(" second-key "),
  ]);
  expect(settings.get()).toEqual({ configured: true });
  const reloaded = new SunoSettingsStore(dir);
  await reloaded.load();
  expect(reloaded.key()).toBe("second-key");
  expect((await stat(path.join(dir, "suno-mumu.json"))).mode & 0o777).toBe(
    0o600,
  );
  await settings.clear();
  expect(settings.key()).toBeUndefined();
  await expect(
    readFile(path.join(dir, "suno-mumu.json")),
  ).rejects.toMatchObject({ code: "ENOENT" });
});

it("connects through a key-only API, filters the music catalog, stores both generated tracks and removes the connection", async () => {
  const dir = await directory();
  const audioFetch = vi
    .fn<typeof fetch>()
    .mockImplementation(async (url, init) => {
      if (String(url).endsWith("/suno/submit/music"))
        return Response.json({ code: "success", data: "task-1" });
      if (String(url).endsWith("/suno/fetch/task-1"))
        return Response.json({
          code: "success",
          data: {
            task_id: "task-1",
            status: "SUCCESS",
            data: [1, 2].map((id) => ({
              status: "complete",
              audio_url: `https://cdn.suno.ai/${id}.mp3`,
              metadata: { duration: id * 10 },
            })),
          },
        });
      expect(new Headers(init?.headers).has("authorization")).toBe(false);
      return new Response("ID3-fixture-audio", {
        headers: { "Content-Type": "audio/mpeg" },
      });
    });
  const app = createApp({ dataDirectory: dir, audioFetch });
  cleanups.push(() => app.close());
  const get = async (url: string) =>
    (await app.inject({ method: "GET", url })).json();
  expect((await get("/audio-models/catalog")).models).toEqual([]);
  const url = `/settings/models/providers/${SUNO_PROVIDER_ID}`;
  const saved = await app.inject({
    method: "PUT",
    url,
    payload: { apiKey: "fixture-key" },
  });
  expect(saved.statusCode).toBe(200);
  expect(saved.json()).toEqual({ configured: true });
  expect(await get(url)).toEqual({ configured: true });
  expect(audioFetch).not.toHaveBeenCalled();
  const catalog = (await get("/audio-models/catalog")) as AudioModelCatalog;
  expect(catalog.models).toHaveLength(5);
  expect(
    catalog.models.every(
      (model) =>
        model.provider === SUNO_PROVIDER_ID &&
        model.capabilities.operations.join() === "music",
    ),
  ).toBe(true);
  const jobResponse = await app.inject({
    method: "POST",
    url: "/tools/generate-music/jobs",
    payload: { prompt: "Calm harbor", instrumental: true },
  });
  expect(jobResponse.statusCode).toBe(202);
  let job = jobResponse.json<ToolJob>();
  for (let i = 0; i < 100 && job.status === "running"; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    job = ((await get("/tool-jobs")) as ToolJob[]).find(
      (candidate) => candidate.id === job.id,
    )!;
  }
  expect(job.status).toBe("succeeded");
  const assets = await get("/library/assets");
  expect(assets).toHaveLength(2);
  expect(
    assets.map((asset: { duration: number }) => asset.duration).sort(),
  ).toEqual([10, 20]);
  const disabled = await app.inject({
    method: "PATCH",
    url: `${url}/enabled`,
    payload: { enabled: false },
  });
  expect(disabled.statusCode).toBe(200);
  expect((await get("/audio-models/catalog")).models).toEqual([]);
  expect((await app.inject({ method: "DELETE", url })).statusCode).toBe(204);
  expect(await get(url)).toEqual({ configured: false });
  expect((await get("/audio-models/catalog")).models).toEqual([]);
  expect(await get("/library/assets")).toHaveLength(2);
});

it("rolls back all audio variants if a later Library write fails", async () => {
  const dir = await directory(),
    library = new AssetLibrary(dir);
  await library.load();
  const add = library.add.bind(library);
  vi.spyOn(library, "add")
    .mockImplementationOnce(add)
    .mockRejectedValueOnce(new Error("disk full"));
  const audio = {
    bytes: Buffer.from("ID3-fixture"),
    mediaType: "audio/mpeg" as const,
    model: { provider: SUNO_PROVIDER_ID, id: "chirp-v5" },
  };
  const runner = new ToolRunner(
    dir,
    { generate: vi.fn() },
    undefined,
    undefined,
    library,
    undefined,
    {
      catalog: () => ({ models: [], providers: [] }),
      generate: async () => ({ ...audio, alternatives: [audio] }),
    },
  );
  cleanups.push(() => runner.close());
  await runner.load();
  await expect(
    runner.run("generate-music", { prompt: "harbor", instrumental: true }),
  ).rejects.toThrow("disk full");
  expect(library.list()).toEqual([]);
});

it("stores native M4A results with an m4a extension and audio/mp4 Library content type", async () => {
  const dir = await directory(),
    library = new AssetLibrary(dir);
  await library.load();
  const audio = {
    bytes: Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]),
    mediaType: "audio/mp4" as const,
    model: { provider: SUNO_PROVIDER_ID, id: "chirp-v5" },
    metadata: { durationMs: 107560 },
  };
  const runner = new ToolRunner(
    dir,
    { generate: vi.fn() },
    undefined,
    undefined,
    library,
    undefined,
    {
      catalog: () => ({ models: [], providers: [] }),
      generate: async () => ({ ...audio, alternatives: [audio] }),
    },
  );
  cleanups.push(() => runner.close());
  await runner.load();
  const run = await runner.run("generate-music", {
    prompt: "harbor",
    instrumental: true,
  });
  expect(run.files.map((file) => [file.name, file.mediaType])).toEqual([
    ["output.m4a", "audio/mp4"],
    ["output-2.m4a", "audio/mp4"],
  ]);
  expect(library.list()).toHaveLength(2);
  for (const file of run.files) {
    expect(library.get(file.assetId!)).toMatchObject({
      mediaType: "audio",
      contentType: "audio/mp4",
      duration: 107.56,
    });
    expect(Buffer.from((await runner.file(run.id, file.name))!.bytes)).toEqual(
      audio.bytes,
    );
  }
});
