import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { ZipFile } from "yazl";
import type { AssetLibrary } from "./asset-library.js";
import {
  validateSpriteRecipe,
  type SpriteRecipe,
} from "../shared/spritecook.js";
import {
  SPRITE_UNITY_IMPORTER,
  SPRITE_GODOT_IMPORTER,
} from "./sprite-engine-importers.js";

export async function writeSpriteJson(
  file: string,
  value: unknown,
): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600 });
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}

export class SpriteTools {
  #recipes: Record<string, SpriteRecipe> = {};
  #writes = Promise.resolve();
  constructor(
    private directory: string,
    private library: AssetLibrary,
  ) {}
  async load() {
    try {
      this.#recipes = JSON.parse(
        await readFile(
          path.join(this.directory, "sprite-recipes.json"),
          "utf8",
        ),
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
  recipe(id: string) {
    return this.#recipes[id];
  }
  async save(recipe: SpriteRecipe) {
    const image = await this.source(recipe);
    image.free();
    const result = this.#writes.then(async () => {
      const next = {
        ...this.#recipes,
        [recipe.assetId]: structuredClone(recipe),
      };
      await writeSpriteJson(
        path.join(this.directory, "sprite-recipes.json"),
        next,
      );
      this.#recipes = next;
      return recipe;
    });
    this.#writes = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  async source(recipe: SpriteRecipe) {
    validateSpriteRecipe(recipe);
    const { asset, absolutePath } = await this.library.content(recipe.assetId);
    if (asset.mediaType !== "image") throw new Error("Choose an image asset");
    if (
      !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
        asset.contentType,
      )
    )
      throw new Error(
        "Local slicing needs a PNG, JPEG, WebP or GIF bitmap; convert vector artwork first",
      );
    if (asset.width && asset.height && asset.width * asset.height > 16_777_216)
      throw new Error("Source image exceeds 16 megapixels");
    const { PhotonImage } = await import("@silvia-odwyer/photon-node");
    const bytes = await readFile(absolutePath);
    if (bytes.length > 32 * 1024 * 1024)
      throw new Error("Source image exceeds 32 MB");
    const image = PhotonImage.new_from_byteslice(bytes);
    if (
      image.get_width() !== recipe.width ||
      image.get_height() !== recipe.height
    ) {
      image.free();
      throw new Error("Recipe dimensions no longer match the source image");
    }
    return image;
  }
  async files(recipe: SpriteRecipe): Promise<Map<string, Buffer>> {
    const image = await this.source(recipe);
    const { PhotonImage, crop } = await import("@silvia-odwyer/photon-node");
    try {
      const files = new Map<string, Buffer>();
      files.set("source.png", Buffer.from(image.get_bytes()));
      // Resolve defaults explicitly: Unity's inline JSON classes do not preserve
      // missing nested borders as null, so a missing override can become zeros.
      const manifest = {
        ...recipe,
        frames: recipe.frames.map((frame) => ({
          ...frame,
          borders: frame.borders ?? recipe.borders,
        })),
      };
      files.set(
        "manifest.json",
        Buffer.from(JSON.stringify(manifest, null, 2)),
      );
      const cellWidth = Math.max(...recipe.frames.map((f) => f.width)) + 2,
        cellHeight = Math.max(...recipe.frames.map((f) => f.height)) + 2;
      const columns = Math.ceil(Math.sqrt(recipe.frames.length)),
        rows = Math.ceil(recipe.frames.length / columns);
      const width = columns * cellWidth,
        height = rows * cellHeight;
      if (width > 8192 || height > 8192 || width * height > 18_000_000)
        throw new Error(
          "Atlas exceeds the 8192 px / 18 megapixel limit; export a smaller batch",
        );
      const pixels = new Uint8Array(width * height * 4);
      const frames: Record<string, unknown> = {};
      for (const [i, frame] of recipe.frames.entries()) {
        const part = crop(
          image,
          frame.x,
          frame.y,
          frame.x + frame.width,
          frame.y + frame.height,
        );
        try {
          files.set(`frames/${frame.name}.png`, Buffer.from(part.get_bytes()));
          const raw = part.get_raw_pixels(),
            x = (i % columns) * cellWidth + 1,
            y = Math.floor(i / columns) * cellHeight + 1;
          // Extrude one pixel to prevent filtered texture bleeding at atlas edges.
          for (let py = -1; py <= frame.height; py++)
            for (let px = -1; px <= frame.width; px++) {
              const from =
                (Math.max(0, Math.min(frame.height - 1, py)) * frame.width +
                  Math.max(0, Math.min(frame.width - 1, px))) *
                4;
              pixels.set(
                raw.subarray(from, from + 4),
                ((y + py) * width + x + px) * 4,
              );
            }
          frames[frame.name] = {
            frame: { x, y, w: frame.width, h: frame.height },
            rotated: false,
            trimmed: false,
            spriteSourceSize: { x: 0, y: 0, w: frame.width, h: frame.height },
            sourceSize: { w: frame.width, h: frame.height },
          };
        } finally {
          part.free();
        }
      }
      const atlas = new PhotonImage(pixels, width, height);
      try {
        files.set("atlas.png", Buffer.from(atlas.get_bytes()));
      } finally {
        atlas.free();
      }
      files.set(
        "atlas.json",
        Buffer.from(
          JSON.stringify(
            {
              frames,
              meta: {
                image: "atlas.png",
                size: { w: width, h: height },
                scale: "1",
              },
            },
            null,
            2,
          ),
        ),
      );
      files.set(
        "Editor/StudioSpriteImporter.cs",
        Buffer.from(SPRITE_UNITY_IMPORTER),
      );
      files.set("StudioSpriteImporter.gd", Buffer.from(SPRITE_GODOT_IMPORTER));
      files.set(
        "README.txt",
        Buffer.from(
          "Studio 2D export\n\nCoordinates in manifest.json are top-left pixels; pivot is normalized from top-left.\nPNG frames preserve their defined canvas. atlas.json uses TexturePacker-style JSON with one-pixel extrusion.\n\nUnity 2022.3+ with the 2D Sprite package: install Editor/StudioSpriteImporter.cs once under Assets/Editor. Copy each asset set into its own Assets folder without installing the helper a second time. Select that set's source.png and use Assets > Studio > Import sprite recipe. The importer converts Y coordinates, pivots and borders to Unity conventions.\nGodot 4: copy the folder into the project, open StudioSpriteImporter.gd and run it as an EditorScript (File > Run). It writes SpriteFrames and one StyleBoxTexture per frame. Apply the manifest pivot to your AnimatedSprite2D offset as (Vector2(0.5, 0.5) - pivot) * frame_size.\nWeb: load atlas.png + atlas.json; use manifest.json for FPS, loop, pivot and 9-slice borders.\n\nImport helpers are source tools, not an entire game UI. Verify imported assets in your engine version before shipping.\n",
        ),
      );
      return files;
    } finally {
      image.free();
    }
  }
  async export(recipe: SpriteRecipe): Promise<Buffer> {
    const files = await this.files(recipe);
    const zip = new ZipFile();
    const result = new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      zip.outputStream.on("data", (c) => chunks.push(c));
      zip.outputStream.on("end", () => resolve(Buffer.concat(chunks)));
      zip.outputStream.on("error", reject);
      zip.on("error", reject);
    });
    for (const [name, bytes] of files) zip.addBuffer(bytes, name);
    zip.end();
    return result;
  }
  async cut(recipe: SpriteRecipe) {
    const image = await this.source(recipe);
    const { crop } = await import("@silvia-odwyer/photon-node");
    const digest = createHash("sha256")
      .update(JSON.stringify(recipe))
      .digest("hex");
    const assets = [];
    try {
      for (const frame of recipe.frames) {
        const part = crop(
          image,
          frame.x,
          frame.y,
          frame.x + frame.width,
          frame.y + frame.height,
        );
        try {
          assets.push(
            await this.library.add(`${frame.name}.png`, part.get_bytes(), {
              origin: "uploaded",
              sourceKey: `sprite-cut:${digest}:${frame.name}`,
            }),
          );
        } finally {
          part.free();
        }
      }
    } finally {
      image.free();
    }
    await this.save(recipe);
    return assets;
  }
}
