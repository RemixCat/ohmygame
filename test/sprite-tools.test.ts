import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { PhotonImage } from "@silvia-odwyer/photon-node";
import { AssetLibrary } from "../src/daemon/asset-library.js";
import { SpriteTools } from "../src/daemon/sprite-tools.js";
import {
  nineSlicePatches,
  spriteGrid,
  spriteFramesFromMetadata,
  validateSpriteRecipe,
  type SpriteRecipe,
} from "../src/shared/spritecook.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});
export function spritePng(width = 8, height = 8) {
  const bytes = Uint8Array.from({ length: width * height * 4 }, (_, i) =>
    i % 4 === 3 ? 255 : Math.floor(i / 4) % 255,
  );
  const image = new PhotonImage(bytes, width, height);
  try {
    return Buffer.from(image.get_bytes());
  } finally {
    image.free();
  }
}
it("keeps corner dimensions and covers stretched target without gaps, including zero-width borders", () => {
  const p = nineSlicePatches(
    24,
    20,
    { left: 3, top: 4, right: 5, bottom: 6 },
    240,
    100,
  );
  expect(p[0]).toMatchObject({ sw: 3, sh: 4, dw: 3, dh: 4 });
  expect(p[8]).toMatchObject({ sw: 5, sh: 6, dw: 5, dh: 6, dx: 235, dy: 94 });
  expect(p.reduce((sum, r) => sum + r.dw * r.dh, 0)).toBe(240 * 100);
  expect(
    nineSlicePatches(8, 8, { left: 0, top: 0, right: 0, bottom: 0 }, 16, 24)[4],
  ).toMatchObject({ sw: 8, sh: 8, dw: 16, dh: 24 });
  expect(() =>
    nineSlicePatches(8, 8, { left: 4, top: 1, right: 4, bottom: 1 }, 20, 20),
  ).toThrow();
  expect(() =>
    nineSlicePatches(8, 8, { left: 2, top: 1, right: 2, bottom: 1 }, 3, 20),
  ).toThrow();
});
it("cuts an exact grid with margins and gaps and refuses silent pixel loss", () => {
  expect(spriteGrid(20, 12, 2, 1, 2, 1)).toEqual([
    { name: "frame_000", x: 1, y: 1, width: 8, height: 10 },
    { name: "frame_001", x: 11, y: 1, width: 8, height: 10 },
  ]);
  expect(() => spriteGrid(20, 12, 3, 1)).toThrow("evenly");
  expect(() => spriteGrid(100, 100, 100, 100)).toThrow();
});
it("infers real sheet frames from metadata while refusing animation-preview dimensions", () => {
  expect(
    spriteFramesFromMetadata(64, 32, {
      frame_count: 2,
      frame_width: 32,
      frame_height: 32,
    }),
  ).toHaveLength(2);
  expect(
    spriteFramesFromMetadata(32, 32, {
      frame_count: 2,
      frame_width: 32,
      frame_height: 32,
    }),
  ).toBeUndefined();
  expect(
    spriteFramesFromMetadata(32, 32, {
      frame_count: 2,
      frame_width: 0,
      frame_height: 32,
    }),
  ).toBeUndefined();
});
it("exports exact pixels, stable frame order, padded atlas and both engine import helpers without a provider", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "studio-sprites-"));
  directories.push(directory);
  const library = new AssetLibrary(directory);
  await library.load();
  const asset = await library.add("source.png", spritePng());
  const tools = new SpriteTools(directory, library);
  await tools.load();
  const recipe: SpriteRecipe = {
    version: 1,
    assetId: asset.id,
    width: 8,
    height: 8,
    frames: spriteGrid(8, 8, 2, 1),
    fps: 12,
    loop: true,
    pivot: { x: 0.5, y: 1 },
    borders: { left: 1, top: 1, right: 1, bottom: 1 },
  };
  await tools.save(recipe);
  const reloaded = new SpriteTools(directory, library);
  await reloaded.load();
  expect(reloaded.recipe(asset.id)).toEqual(recipe);
  const files = await tools.files(recipe);
  const source = PhotonImage.new_from_byteslice(files.get("source.png")!);
  const frame = PhotonImage.new_from_byteslice(
    files.get("frames/frame_001.png")!,
  );
  try {
    expect(frame.get_width()).toBe(4);
    expect(frame.get_height()).toBe(8);
    expect([...frame.get_raw_pixels().subarray(0, 4)]).toEqual([
      ...source.get_raw_pixels().subarray(16, 20),
    ]);
  } finally {
    source.free();
    frame.free();
  }
  const atlas = JSON.parse(files.get("atlas.json")!.toString());
  expect(atlas.frames.frame_001.frame).toEqual({ x: 7, y: 1, w: 4, h: 8 });
  expect(files.get("Editor/StudioSpriteImporter.cs")!.toString()).toContain(
    "m.height-f.y-f.height",
  );
  expect(files.get("StudioSpriteImporter.gd")!.toString()).toContain(
    "texture_margin_left",
  );
  expect((await tools.export(recipe)).subarray(0, 2).toString()).toBe("PK");
  const first = await tools.cut(recipe),
    second = await tools.cut(recipe);
  expect(first.map((a) => a.id)).toEqual(second.map((a) => a.id));
  expect(library.list()).toHaveLength(3);
  await expect(tools.export({ ...recipe, width: 9 })).rejects.toThrow("match");
  expect(() =>
    validateSpriteRecipe({
      ...recipe,
      frames: [{ ...recipe.frames[0]!, name: "../private" }],
    }),
  ).toThrow();
  expect(() =>
    validateSpriteRecipe({
      ...recipe,
      borders: { left: 2, top: 0, right: 2, bottom: 0 },
    }),
  ).toThrow("center");
});
