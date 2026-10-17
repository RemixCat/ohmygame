import type {
  CustomModel3DSettings,
  Model3DOperation,
  Model3DOptions,
} from "./contracts.js";

export const TRIPO_TEXTURE_MODELS = [
  "v3.5-20260815",
  "v3.0-20250812",
  "v2.5-20250123",
] as const;
export const TRIPO_GENERATION_OPTIONS = [
  "adaptivePolycount",
  "geometryQuality",
  "modelSeed",
  "imageSeed",
  "textureSeed",
  "negativePrompt",
  "imageAutofix",
  "textureAlignment",
  "orientation",
  "autoSize",
  "exportUv",
  "delight",
  "smartLowPoly",
  "quad",
  "textureModel",
  "textureQuality",
];
export const TRIPO_TEXTURE_OPTIONS = [
  "textureModel",
  "textureQuality",
  "textureSeed",
  "textureAlignment",
  "delight",
  "bake",
];
export const TRIPO_REMESH_OPTIONS = [
  "adaptivePolycount",
  "remeshModel",
  "smartUv",
  "quad",
  "bake",
];

/** Limits depend on the algorithm as well as the geometry model. */
export function tripoPolycount(
  base: CustomModel3DSettings["polycount"],
  id: string,
  operation: Model3DOperation,
  options: Model3DOptions = {},
): CustomModel3DSettings["polycount"] {
  let min = base.min,
    max = base.max,
    fallback = base.default;
  if (operation === "remesh") {
    min = options.remeshModel === "v1.0" ? 100 : 500;
    max =
      options.remeshModel === "v1.0"
        ? options.quad
          ? 150_000
          : 2_000_000
        : options.quad
          ? 10_000
          : 20_000;
    fallback = 4_000;
  } else if (options.smartLowPoly) {
    min = 500;
    max = 20_000;
    fallback = 4_000;
  } else if (id === "P2-20260801" && options.quad) max = 25_000;
  else if (
    ["v3.1-20260211", "v3.0-20250812"].includes(id) &&
    options.geometryQuality === "detailed"
  )
    max = 2_000_000;
  return {
    min,
    max,
    default: Math.max(min, Math.min(max, fallback)),
    presets: [...new Set([min, 1_000, 4_000, ...base.presets, max])]
      .filter((value) => value >= min && value <= max)
      .sort((a, b) => a - b),
  };
}

/** Validate before uploads or paid task creation, including combinations the API rejects. */
export function tripoOptionError(
  id: string,
  operation: Model3DOperation,
  options: Model3DOptions = {},
  imageCount = 0,
): string | undefined {
  const generation = operation === "image" || operation === "text";
  const allowed = generation
    ? TRIPO_GENERATION_OPTIONS
    : operation === "retexture"
      ? TRIPO_TEXTURE_OPTIONS
      : TRIPO_REMESH_OPTIONS;
  if (
    Object.entries(options).some(
      ([key, value]) => value !== undefined && !allowed.includes(key),
    )
  )
    return "These options are not supported by the selected Tripo operation";
  if (
    options.textureModel &&
    !TRIPO_TEXTURE_MODELS.includes(
      options.textureModel as (typeof TRIPO_TEXTURE_MODELS)[number],
    )
  )
    return "Unsupported Tripo texture version";
  const textureModel =
    options.textureModel ??
    (operation === "retexture"
      ? "v3.5-20260815"
      : id === "v2.5-20250123"
        ? id
        : "v3.0-20250812");
  if (options.textureQuality === "fast" && textureModel !== "v3.5-20260815")
    return "Fast textures require Tripo v3.5";
  if (options.delight !== undefined && textureModel !== "v3.5-20260815")
    return "Delight requires Tripo v3.5";
  if (generation) {
    const h3 = ["v3.1-20260211", "v3.0-20250812"].includes(id);
    if (
      (options.geometryQuality !== undefined && !h3) ||
      (options.smartLowPoly !== undefined && !h3)
    )
      return "Geometry quality and smart low poly require Tripo V3.0 or V3.1";
    if (options.quad && id !== "P2-20260801")
      return "Quad generation in the GLB workflow requires Tripo P2";
    if (
      id === "v2.5-20250123" &&
      (options.autoSize !== undefined || options.textureQuality !== undefined)
    )
      return "These generation options require Tripo V3.0 or newer";
    if (
      operation !== "text" &&
      (options.negativePrompt !== undefined || options.imageSeed !== undefined)
    )
      return "Negative prompts and image seeds require text generation";
    if (
      operation !== "image" &&
      (options.imageAutofix !== undefined ||
        options.orientation !== undefined ||
        options.textureAlignment !== undefined)
    )
      return "Image correction and alignment require image generation";
    if (imageCount > 1 && options.imageAutofix !== undefined)
      return "Image autofix supports single-image generation only";
  }
  if (operation === "remesh") {
    if (
      options.smartUv !== undefined &&
      (options.remeshModel ?? "v3.0") !== "v3.0"
    )
      return "Smart UV requires retopology v3.0";
    if (
      options.remeshModel === "v1.0" &&
      (options.bake !== undefined || options.adaptivePolycount)
    )
      return "Basic decimation requires an explicit face count and does not support texture baking";
  }
  return undefined;
}

export function isTripoCreditError(message: string): boolean {
  return /(?:not|don['’]t).*enough.*credit|insufficient.*credit|credit.*insufficient/i.test(
    message,
  );
}
