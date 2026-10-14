import { preferredImageOption } from "./asset-canvas.js";
import type {
  CanvasQuickAction,
  CanvasRecognizedObject,
  ImageModel,
  ImageModelRef,
} from "./contracts.js";

export const QUICK_ACTIONS = [
  "describe",
  "objects",
  "views",
  "image",
  "model-3d",
] as const;
export type CanvasQuickActionKind = (typeof QUICK_ACTIONS)[number];

/** Without an override, follow the project or global default supplied by the editor. */
export function quickImageSettings(
  action: CanvasQuickAction,
  models: readonly ImageModel[],
  defaultModel?: ImageModelRef,
) {
  const reference = action.imageModel ?? defaultModel;
  const model = models.find(
    (candidate) =>
      candidate.provider === reference?.provider &&
      candidate.id === reference.id,
  );
  const option =
    model?.generationOptions.find(
      (option) =>
        option.resolution === action.resolution &&
        option.aspectRatio === action.aspectRatio,
    ) ?? preferredImageOption(model, action.aspectRatio);
  return { reference, model, ...(option ?? {}) };
}
export const THREE_VIEWS = ["top", "front", "right"] as const;
export const DESCRIPTION_INSTRUCTION =
  "Describe the reference image as an editable image-generation prompt. Cover the subject, geometry, colors, materials, style, camera and background. Infer only what is visible; do not claim to recover the original prompt. Respond in the user's language.";
export const OBJECTS_INSTRUCTION =
  'Identify up to 16 distinct foreground objects in the reference image. Return ONLY a JSON array, no markdown. Each entry must have string fields "name", "description", "prompt". Names and descriptions should use the user\'s language. Each prompt should describe one isolated complete object, matching the reference design, materials and style, with no other objects, no labels and no collage. Keep each entry concise. Do not generate images.';
export function viewPrompt(view: (typeof THREE_VIEWS)[number]): string {
  return `Generate exactly ONE ${view === "top" ? "top-down" : view === "front" ? "front" : "right-side"} orthographic view of the main subject in the reference image. Match its geometry, proportions, materials and colors. Show the entire subject centered, at a consistent scale, on a plain neutral background. No other views, collage, panels, labels or text. Infer unseen surfaces consistently.`;
}

/** Provider text is untrusted. Never silently generate from an unvalidated list. */
export function parseRecognizedObjects(
  text: string,
  newId: () => string = () => crypto.randomUUID(),
): CanvasRecognizedObject[] {
  const value: unknown = JSON.parse(
    text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, ""),
  );
  if (!Array.isArray(value) || value.length > 16)
    throw new Error("Invalid object list");
  return value.map((entry: unknown) => {
    if (!entry || typeof entry !== "object")
      throw new Error("Invalid object entry");
    const item = entry as Record<string, unknown>;
    if (
      typeof item.name !== "string" ||
      !item.name.trim() ||
      item.name.length > 200 ||
      typeof item.description !== "string" ||
      item.description.length > 2000 ||
      typeof item.prompt !== "string" ||
      !item.prompt.trim() ||
      item.prompt.length > 4000
    )
      throw new Error("Invalid object entry");
    return {
      id: newId(),
      name: item.name.trim(),
      description: item.description,
      prompt: item.prompt.trim(),
      selected: false,
    };
  });
}
