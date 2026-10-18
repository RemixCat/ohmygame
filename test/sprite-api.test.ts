import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { createApp } from "../src/daemon/app.js";
import { PhotonImage } from "@silvia-odwyer/photon-node";
import { spriteGrid } from "../src/shared/spritecook.js";
const cleaners: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const fn of cleaners.splice(0).reverse()) await fn();
});

it("protects provider/local routes, lists the fixed image provider and exports without a provider key", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "studio-sprite-api-"));
  cleaners.push(() => rm(dir, { recursive: true, force: true }));
  const runtime = await ModelRuntime.create({
    authPath: path.join(dir, "auth.json"),
    modelsPath: path.join(dir, "models.json"),
    modelsStorePath: path.join(dir, "catalog.json"),
    allowModelNetwork: false,
  });
  const request = vi.fn<typeof fetch>();
  const app = createApp({
    dataDirectory: dir,
    piAgentDirectory: dir,
    accessToken: "local-token",
    createModelRuntime: async () => runtime,
    spritecookFetch: request,
  });
  cleaners.push(() => app.close());
  const headers = { authorization: "Bearer local-token" };
  expect((await app.inject({ url: "/spritecook/jobs" })).statusCode).toBe(401);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/sprite-tools/export",
        payload: {},
      })
    ).statusCode,
  ).toBe(401);
  const providers = (
    await app.inject({ url: "/settings/providers", headers })
  ).json();
  expect(providers).toContainEqual(
    expect.objectContaining({
      id: "spritecook",
      configured: false,
      capabilities: ["image"],
    }),
  );
  const png = new PhotonImage(new Uint8Array(8 * 8 * 4).fill(255), 8, 8);
  let bytes: Buffer;
  try {
    bytes = Buffer.from(png.get_bytes());
  } finally {
    png.free();
  }
  const upload = await app.inject({
    method: "POST",
    url: "/library/assets/upload?name=source.png&mediaType=image%2Fpng",
    headers: { ...headers, "content-type": "application/octet-stream" },
    payload: bytes,
  });
  expect(upload.statusCode, upload.body).toBe(201);
  const recipe = {
    version: 1,
    assetId: upload.json().id,
    width: 8,
    height: 8,
    frames: spriteGrid(8, 8, 2, 1),
    fps: 12,
    loop: true,
    pivot: { x: 0.5, y: 1 },
    borders: { left: 0, top: 0, right: 0, bottom: 0 },
  };
  const saved = await app.inject({
    method: "PUT",
    url: "/sprite-tools/recipe",
    headers,
    payload: recipe,
  });
  expect(saved.statusCode, saved.body).toBe(200);
  const exported = await app.inject({
    method: "POST",
    url: "/sprite-tools/export",
    headers,
    payload: recipe,
  });
  expect(exported.statusCode, exported.body).toBe(200);
  expect(
    Buffer.from(exported.json().data, "base64").subarray(0, 2).toString(),
  ).toBe("PK");
  const configured = await app.inject({
    method: "PUT",
    url: "/settings/models/providers/spritecook",
    headers,
    payload: { apiKey: "fixture-key" },
  });
  expect(configured.json()).toEqual({ configured: true, enabled: true });
  expect(
    (
      await app.inject({
        url: "/settings/models/providers/spritecook",
        headers,
      })
    ).body,
  ).not.toContain("fixture-key");
  expect(
    (
      await app.inject({
        method: "DELETE",
        url: "/settings/models/providers/spritecook",
        headers,
      })
    ).statusCode,
  ).toBe(204);
  expect(request).not.toHaveBeenCalled();
});
