import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { AssetLibrary } from "../src/daemon/asset-library.js";
import { SpriteCookService } from "../src/daemon/spritecook.js";
import type { SpriteJob, SpriteOperation } from "../src/shared/spritecook.js";
import { PhotonImage } from "@silvia-odwyer/photon-node";
const png = (() => {
  const p = new PhotonImage(new Uint8Array(8 * 8 * 4).fill(255), 8, 8);
  try {
    return Buffer.from(p.get_bytes());
  } finally {
    p.free();
  }
})();
const cleaners: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const fn of cleaners.splice(0).reverse()) await fn();
});
async function fixture(
  request: typeof fetch,
  addresses = [{ address: "93.184.216.34" }],
) {
  const directory = await mkdtemp(path.join(tmpdir(), "studio-spritecook-"));
  cleaners.push(() => rm(directory, { recursive: true, force: true }));
  const library = new AssetLibrary(directory);
  await library.load();
  const service = new SpriteCookService(
    directory,
    library,
    request,
    () => true,
    async () => addresses,
  );
  await service.load();
  await service.setKey("fixture-sprite-key");
  cleaners.push(() => service.close());
  return { service, library, directory };
}
async function result(
  service: SpriteCookService,
  id: string,
  status: SpriteJob["status"] = "completed",
) {
  let job: SpriteJob | undefined;
  await vi.waitFor(async () => {
    job = service.list().find((j) => j.id === id);
    if (job?.remoteId) job = await service.refresh(id);
    expect(job?.status, job?.error).toBe(status);
  });
  return job!;
}
it("persists private key-only settings without exposing the key and keeps jobs after disconnect", async () => {
  const { service, directory } = await fixture(vi.fn());
  expect(service.settings()).toEqual({ configured: true, enabled: true });
  expect(
    (await stat(path.join(directory, "spritecook-key.json"))).mode & 0o777,
  ).toBe(0o600);
  await expect(service.setKey("bad\nkey")).rejects.toThrow();
  expect(JSON.stringify(service.list())).not.toContain("fixture-sprite-key");
  await service.clear();
  expect(service.settings().configured).toBe(false);
});
it("imports an existing source once, polls and validates outputs, keeps native files and never forwards Authorization to the CDN", async () => {
  const request = vi.fn<typeof fetch>(async (url, init) => {
    if (String(url).includes("assets/import"))
      return Response.json({ id: "source-owned" });
    if (String(url).endsWith("/animate"))
      return Response.json({ job_id: "remote-1", status: "queued" });
    if (String(url).includes("/jobs/"))
      return Response.json({
        job_id: "remote-1",
        status: "completed",
        output: {
          asset_id: "animation-1",
          url: "https://cdn.example.test/result.png",
          spritesheet_url: "https://cdn.example.test/sheet.png",
          metadata: {
            frame_count: 8,
            frame_width: 1,
            frame_height: 8,
            fps: 12,
          },
        },
      });
    expect(new Headers(init?.headers).has("Authorization")).toBe(false);
    return new Response(png, { headers: { "Content-Type": "image/png" } });
  });
  const { service, library, directory } = await fixture(request);
  const source = await library.add("character.png", png);
  const first = await service.start(
    "animate",
    { prompt: "run", pixel: true, output_frames: 8 },
    source.id,
    "request-1",
  );
  const job = await result(service, first.id);
  expect(job.assets).toHaveLength(2);
  expect(
    job.assets.every((a) => a.contentType === "image/png" && a.width === 8),
  ).toBe(true);
  expect(job.result?.local_assets).toBeTruthy();
  expect(
    request.mock.calls.filter(([u]) => String(u).includes("assets/import")),
  ).toHaveLength(1);
  await service.start(
    "animate",
    { prompt: "run", pixel: true, output_frames: 8 },
    source.id,
    "request-1",
  );
  expect(
    request.mock.calls.filter(([u]) => String(u).endsWith("/animate")),
  ).toHaveLength(1);
  expect(
    await readFile(path.join(directory, "spritecook-jobs.json"), "utf8"),
  ).not.toContain("fixture-sprite-key");
  await service.setKey("another-key");
  await expect(service.refresh(first.id)).rejects.toThrow("another key");
});
it.each<[SpriteOperation, Record<string, unknown>, string, string]>([
  ["generate", { prompt: "panel", mode: "ui" }, "generate", "POST"],
  [
    "tilesets",
    { prompt: "forest", perspective: "platformer" },
    "tilesets",
    "POST",
  ],
  [
    "character",
    { prompt: "hero", perspective: "platformer" },
    "characters",
    "POST",
  ],
  [
    "character-animations",
    { asset_id: "hero-1", perspective: "platformer", animation_ids: ["idle"] },
    "characters/hero-1/animations",
    "POST",
  ],
  [
    "auto-slice",
    { asset_id: "image-1", padding: 2 },
    "assets/image-1/auto-slice",
    "POST",
  ],
  [
    "alpha-cutoff",
    { asset_id: "image-1", cutoff: 96 },
    "assets/image-1/alpha-cutoff",
    "PUT",
  ],
  ["remove-background", { asset_id: "image-1" }, "remove-background", "POST"],
])(
  "routes %s through the documented public operation",
  async (operation, input, route, method) => {
    const request = vi.fn<typeof fetch>(async () =>
      Response.json({ job_id: "task-1", id: "run-1", status: "queued" }),
    );
    const { service } = await fixture(request);
    const job = await service.start(operation, input, undefined, "operation-1");
    await vi.waitFor(() => expect(service.list()[0]?.status).toBe("running"));
    expect(String(request.mock.calls[0]![0])).toBe(
      `https://api.spritecook.ai/v1/api/${route}`,
    );
    expect(request.mock.calls[0]![1]?.method).toBe(method);
    expect(job.id).toBe("operation-1");
  },
);
it("rejects unsupported frame counts and oversized source images before any paid submission", async () => {
  const request = vi.fn<typeof fetch>();
  const { service } = await fixture(request);
  await expect(
    service.start("animate", {
      asset_id: "source",
      prompt: "run",
      model: "pixel-engine-v1.1",
      output_frames: 3,
    }),
  ).rejects.toThrow("frame count");
  await expect(
    service.start("animate", {
      asset_id: "source",
      prompt: "run",
      model: "pixel-engine-v1.5",
      negative_prompt: "blur",
    }),
  ).rejects.toThrow("negative");
  await expect(
    service.start("generate", { prompt: "hero", unknown_option: 1 }),
  ).rejects.toThrow("unsupported");
  expect(request).not.toHaveBeenCalled();
});
it("retains ambiguous submissions and attaches an existing task without generating again", async () => {
  const request = vi.fn<typeof fetch>(async (url) => {
    if (String(url).endsWith("/generate")) throw new Error("Timed out");
    if (String(url).includes("/jobs/"))
      return Response.json({
        status: "completed",
        assets: [{ id: "a", url: "https://cdn.example.test/a.png" }],
      });
    return new Response(png);
  });
  const { service } = await fixture(request);
  const job = await service.start(
    "generate",
    { prompt: "hero" },
    undefined,
    "uncertain-1",
  );
  await vi.waitFor(() => expect(service.list()[0]?.status).toBe("uncertain"));
  const attached = await service.attach(job.id, "existing-task");
  expect(attached.status).toBe("completed");
  expect(
    request.mock.calls.filter(([url]) => String(url).endsWith("/generate")),
  ).toHaveLength(1);
});
it("resumes a known job after restart and preserves partial character batch results", async () => {
  const request = vi.fn<typeof fetch>(async (url) => {
    if (String(url).endsWith("/animations"))
      return Response.json({ id: "run-1", status: "queued" });
    if (String(url).includes("character-animation-runs"))
      return Response.json({
        status: "failed",
        result_asset_ids: ["good-animation"],
        error_message: "one action failed",
      });
    if (String(url).includes("/assets/"))
      return Response.json({
        id: "good-animation",
        url: "https://cdn.example.test/a.png",
      });
    return new Response(png);
  });
  const { service, library, directory } = await fixture(request);
  const job = await service.start(
    "character-animations",
    { asset_id: "character-1", perspective: "platformer" },
    undefined,
    "batch-1",
  );
  await vi.waitFor(() => expect(service.list()[0]?.remoteId).toBe("run-1"));
  await service.close();
  const restored = new SpriteCookService(
    directory,
    library,
    request,
    () => true,
    async () => [{ address: "93.184.216.34" }],
  );
  await restored.load();
  cleaners.push(() => restored.close());
  const partial = await restored.refresh(job.id);
  expect(partial.status).toBe("partial");
  expect(partial.assets).toHaveLength(1);
  expect(
    request.mock.calls.filter(([url]) => String(url).endsWith("/animations")),
  ).toHaveLength(1);
});
it("blocks private download destinations and keeps the remote ID for retry", async () => {
  const request = vi.fn<typeof fetch>(async (url) =>
    String(url).endsWith("/generate")
      ? Response.json({ job_id: "remote-1", status: "queued" })
      : Response.json({
          status: "completed",
          assets: [{ id: "a", url: "https://internal.test/file.png" }],
        }),
  );
  const { service } = await fixture(request, [{ address: "127.0.0.1" }]);
  const job = await service.start(
    "generate",
    { prompt: "hero" },
    undefined,
    "private-result",
  );
  const failed = await result(service, job.id, "download_failed");
  expect(failed.remoteId).toBe("remote-1");
  expect(failed.error).toContain("private address");
  expect(
    request.mock.calls.some(([url]) => String(url).includes("internal.test")),
  ).toBe(false);
});
it("accepts direct alpha-cleanup metadata without circular state and does not mistake pending cancellation for cancellation", async () => {
  const request = vi.fn<typeof fetch>(async (url) => {
    if (String(url).includes("alpha-cutoff"))
      return Response.json({
        id: "clean-1",
        url: "https://cdn.example.test/clean.png",
      });
    if (String(url).endsWith("/generate"))
      return Response.json({ job_id: "task-1", status: "queued" });
    if (String(url).endsWith("/cancel"))
      return Response.json({
        ok: true,
        cancelled: false,
        cancellation_pending: true,
      });
    return new Response(png);
  });
  const { service } = await fixture(request);
  const clean = await service.start(
    "alpha-cutoff",
    { asset_id: "src", cutoff: 96 },
    undefined,
    "cleanup",
  );
  await result(service, clean.id);
  const job = await service.start(
    "generate",
    { prompt: "hero" },
    undefined,
    "cancel-1",
  );
  await vi.waitFor(() =>
    expect(service.list().find((j) => j.id === job.id)?.status).toBe("running"),
  );
  expect((await service.cancel(job.id)).status).toBe("running");
});
it("preserves native WebP and GIF results without relabeling or transcoding them", async () => {
  const image = new PhotonImage(new Uint8Array(4 * 4 * 4).fill(255), 4, 4);
  const webp = Buffer.from(image.get_bytes_webp());
  image.free();
  const gif = Buffer.from(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    "base64",
  );
  const request = vi.fn<typeof fetch>(async (url) => {
    if (String(url).endsWith("/generate"))
      return Response.json({ job_id: "native", status: "queued" });
    if (String(url).includes("/jobs/"))
      return Response.json({
        status: "completed",
        assets: [
          { id: "webp", url: "https://cdn.example.test/a.webp" },
          { id: "gif", url: "https://cdn.example.test/a.gif" },
        ],
      });
    return new Response(String(url).endsWith("webp") ? webp : gif);
  });
  const { service, library } = await fixture(request);
  const job = await service.start(
    "generate",
    { prompt: "hero" },
    undefined,
    "native-formats",
  );
  const done = await result(service, job.id);
  expect(done.assets.map((a) => a.contentType)).toEqual([
    "image/webp",
    "image/gif",
  ]);
  expect(
    await readFile((await library.content(done.assets[0]!.id)).absolutePath),
  ).toEqual(webp);
  expect(
    await readFile((await library.content(done.assets[1]!.id)).absolutePath),
  ).toEqual(gif);
});
it("rejects a successful remote animation whose reported frame count is incomplete", async () => {
  const request = vi.fn<typeof fetch>(async (url) =>
    String(url).endsWith("/animate")
      ? Response.json({ job_id: "incomplete", status: "queued" })
      : Response.json({
          status: "completed",
          output: {
            asset_id: "output",
            url: "https://cdn.example.test/a.png",
            metadata: { frame_count: 2, frame_width: 4, frame_height: 8 },
          },
        }),
  );
  const { service } = await fixture(request);
  const job = await service.start(
    "animate",
    { asset_id: "src", prompt: "run", output_frames: 8 },
    undefined,
    "bad-frame-count",
  );
  const failed = await result(service, job.id, "download_failed");
  expect(failed.remoteId).toBe("incomplete");
  expect(failed.error).toContain("frame count");
});
