import type { LibraryAsset } from "./contracts.js";

export const SPRITECOOK_PROVIDER_ID = "spritecook";
export const SPRITECOOK_BASE_URL = "https://api.spritecook.ai";
export const SPRITECOOK_OPERATIONS = [
  "generate",
  "animate",
  "tilesets",
  "character",
  "character-animations",
  "remove-background",
  "auto-slice",
  "alpha-cutoff",
] as const;
export type SpriteOperation = (typeof SPRITECOOK_OPERATIONS)[number];
export interface SpriteField {
  type?: string;
  properties?: Record<string, SpriteField>;
  required?: string[];
  items?: SpriteField;
  enum?: (string | number | boolean)[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  pattern?: string;
}
export interface SpriteJob {
  id: string;
  operation: SpriteOperation;
  createdAt: string;
  status:
    | "submitting"
    | "running"
    | "uncertain"
    | "completed"
    | "partial"
    | "failed"
    | "cancelled"
    | "download_failed";
  account: string;
  input: Record<string, unknown>;
  sourceAssetId?: string;
  remoteId?: string;
  remoteKind?: "job" | "run";
  progress?: number;
  result?: Record<string, unknown>;
  assets: LibraryAsset[];
  error?: string;
}
export interface SpriteCatalog {
  models: Record<string, unknown>;
  workflows: Record<string, unknown>;
  tilesets: Record<string, unknown>;
  credits?: Record<string, unknown>;
  creditError?: string;
}
export const SPRITE_UI_STATES = [
  "normal",
  "hover",
  "pressed",
  "disabled",
  "selected",
  "checked",
  "on",
  "off",
  "empty",
  "fill",
] as const;
export interface SpriteRect {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  borders?: SpriteBorders;
  family?: string;
  state?: (typeof SPRITE_UI_STATES)[number];
}
export interface SpriteBorders {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export interface SpriteRecipe {
  version: 1;
  assetId: string;
  width: number;
  height: number;
  frames: SpriteRect[];
  fps: number;
  loop: boolean;
  pivot: { x: number; y: number };
  borders: SpriteBorders;
}
export function validateSpriteRecipe(recipe: SpriteRecipe): void {
  if (
    recipe.version !== 1 ||
    !recipe.assetId ||
    !Number.isInteger(recipe.width) ||
    !Number.isInteger(recipe.height) ||
    recipe.width < 1 ||
    recipe.height < 1 ||
    recipe.width * recipe.height > 16_777_216
  )
    throw new Error("Invalid sprite dimensions (maximum 16 megapixels)");
  if (
    !Array.isArray(recipe.frames) ||
    recipe.frames.length < 1 ||
    recipe.frames.length > 256
  )
    throw new Error("Use 1–256 frames");
  const names = new Set<string>();
  const states = new Set<string>();
  for (const f of recipe.frames) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(f.name) || names.has(f.name))
      throw new Error(
        "Frame names must be unique and contain letters, numbers, underscores or hyphens",
      );
    names.add(f.name);
    if (
      ![f.x, f.y, f.width, f.height].every(Number.isInteger) ||
      f.x < 0 ||
      f.y < 0 ||
      f.width < 1 ||
      f.height < 1 ||
      f.x + f.width > recipe.width ||
      f.y + f.height > recipe.height
    )
      throw new Error("A frame is outside the image");
    if (
      (f.family && !/^[a-zA-Z0-9_-]{1,80}$/.test(f.family)) ||
      (f.state && !SPRITE_UI_STATES.includes(f.state))
    )
      throw new Error("Invalid UI family or state");
    if (f.family) {
      const key = `${f.family}:${f.state ?? "normal"}`;
      if (states.has(key))
        throw new Error(
          "A UI family can have only one component for each state",
        );
      states.add(key);
    }
  }
  if (
    !Number.isFinite(recipe.fps) ||
    recipe.fps < 1 ||
    recipe.fps > 120 ||
    typeof recipe.loop !== "boolean" ||
    ![recipe.pivot.x, recipe.pivot.y].every(
      (n) => Number.isFinite(n) && n >= 0 && n <= 1,
    )
  )
    throw new Error("Invalid timing or pivot");
  for (const frame of recipe.frames) {
    const b = frame.borders ?? recipe.borders;
    if (
      ![b.left, b.top, b.right, b.bottom].every(
        (n) => Number.isInteger(n) && n >= 0,
      ) ||
      b.left + b.right >= frame.width ||
      b.top + b.bottom >= frame.height
    )
      throw new Error(
        "9-slice borders must leave a non-empty center in every frame",
      );
  }
}
export function spriteGrid(
  width: number,
  height: number,
  columns: number,
  rows: number,
  gap = 0,
  margin = 0,
): SpriteRect[] {
  if (
    ![width, height, columns, rows, gap, margin].every(Number.isInteger) ||
    columns < 1 ||
    rows < 1 ||
    columns * rows > 256 ||
    gap < 0 ||
    margin < 0
  )
    throw new Error("Invalid grid");
  const w = (width - margin * 2 - (columns - 1) * gap) / columns;
  const h = (height - margin * 2 - (rows - 1) * gap) / rows;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1)
    throw new Error(
      "Grid does not divide the image evenly; adjust margin, gap or grid counts",
    );
  return Array.from({ length: columns * rows }, (_, i) => ({
    name: `frame_${String(i).padStart(3, "0")}`,
    x: margin + (i % columns) * (w + gap),
    y: margin + Math.floor(i / columns) * (h + gap),
    width: w,
    height: h,
  }));
}
export function spriteFramesFromMetadata(
  width: number,
  height: number,
  metadata: Record<string, unknown>,
): SpriteRect[] | undefined {
  const count = Number(metadata.frame_count ?? metadata.animation_frame_count),
    w = Number(metadata.frame_width ?? metadata.animation_frame_width),
    h = Number(metadata.frame_height ?? metadata.animation_frame_height);
  if (
    ![count, w, h].every(Number.isInteger) ||
    count < 1 ||
    count > 256 ||
    w < 1 ||
    h < 1 ||
    width % w ||
    height % h ||
    (width / w) * (height / h) < count ||
    (width / w) * (height / h) > 256
  )
    return;
  return spriteGrid(width, height, width / w, height / h).slice(0, count);
}
/** Source and destination rectangles for nine-slice rendering. Corners never stretch. */
export function nineSlicePatches(
  width: number,
  height: number,
  b: SpriteBorders,
  targetWidth: number,
  targetHeight: number,
) {
  if (
    ![
      width,
      height,
      targetWidth,
      targetHeight,
      b.left,
      b.top,
      b.right,
      b.bottom,
    ].every(Number.isFinite) ||
    [b.left, b.top, b.right, b.bottom].some((n) => n < 0)
  )
    throw new Error("Invalid nine-slice dimensions");
  if (
    targetWidth < b.left + b.right ||
    targetHeight < b.top + b.bottom ||
    b.left + b.right >= width ||
    b.top + b.bottom >= height
  )
    throw new Error("Target is smaller than the fixed borders");
  const sx = [0, b.left, width - b.right, width],
    sy = [0, b.top, height - b.bottom, height];
  const dx = [0, b.left, targetWidth - b.right, targetWidth],
    dy = [0, b.top, targetHeight - b.bottom, targetHeight];
  return Array.from({ length: 9 }, (_, i) => {
    const x = i % 3,
      y = Math.floor(i / 3);
    return {
      sx: sx[x]!,
      sy: sy[y]!,
      sw: sx[x + 1]! - sx[x]!,
      sh: sy[y + 1]! - sy[y]!,
      dx: dx[x]!,
      dy: dy[y]!,
      dw: dx[x + 1]! - dx[x]!,
      dh: dy[y + 1]! - dy[y]!,
    };
  });
}
export function validateSpriteFields(
  value: unknown,
  field: SpriteField,
  name = "parameters",
): void {
  if (field.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error(`${name}: expected an object`);
    const record = value as Record<string, unknown>;
    for (const key of field.required ?? [])
      if (record[key] === undefined || record[key] === "")
        throw new Error(`${name}.${key}: required`);
    for (const [key, item] of Object.entries(record)) {
      if (!field.properties?.[key])
        throw new Error(`${name}.${key}: unsupported parameter`);
      validateSpriteFields(item, field.properties[key], `${name}.${key}`);
    }
  } else if (field.type === "array") {
    if (
      !Array.isArray(value) ||
      value.length < (field.minItems ?? 0) ||
      value.length > (field.maxItems ?? 256)
    )
      throw new Error(`${name}: invalid array length`);
    value.forEach((v, i) =>
      validateSpriteFields(v, field.items ?? {}, `${name}[${i}]`),
    );
  } else if (field.type === "string") {
    if (
      typeof value !== "string" ||
      value.length < (field.minLength ?? 0) ||
      value.length > (field.maxLength ?? 10000) ||
      (field.pattern && !new RegExp(field.pattern).test(value))
    )
      throw new Error(`${name}: invalid text`);
  } else if (field.type === "integer" || field.type === "number") {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      (field.type === "integer" && !Number.isInteger(value)) ||
      value < (field.minimum ?? -Infinity) ||
      value > (field.maximum ?? Infinity)
    )
      throw new Error(`${name}: invalid number`);
  } else if (field.type === "boolean" && typeof value !== "boolean")
    throw new Error(`${name}: expected a toggle`);
  if (field.enum && !field.enum.includes(value as string))
    throw new Error(`${name}: unsupported option`);
}
