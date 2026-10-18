import { request, notifyAgentModelsChanged } from "./api.js";
import type { LibraryAsset } from "../shared/contracts.js";
import type {
  SpriteCatalog,
  SpriteJob,
  SpriteOperation,
  SpriteRecipe,
} from "../shared/spritecook.js";
export const spriteSettings = () =>
  request<{ configured: boolean; enabled: boolean }>(
    "/settings/models/providers/spritecook",
  );
export async function saveSpriteKey(apiKey: string) {
  const result = await request("/settings/models/providers/spritecook", {
    method: "PUT",
    body: JSON.stringify({ apiKey }),
  });
  notifyAgentModelsChanged();
  return result;
}
export const spriteCatalog = () =>
  request<SpriteCatalog>("/spritecook/catalog");
export const spriteRecent = () =>
  request<Record<string, any>>("/spritecook/assets/recent");
export const spriteJobs = () => request<SpriteJob[]>("/spritecook/jobs");
export const startSpriteJob = (
  operation: SpriteOperation,
  input: Record<string, unknown>,
  sourceAssetId: string | undefined,
  requestId: string,
) =>
  request<SpriteJob>("/spritecook/jobs", {
    method: "POST",
    body: JSON.stringify({ operation, input, sourceAssetId, requestId }),
  });
export const refreshSpriteJob = (id: string) =>
  request<SpriteJob>(`/spritecook/jobs/${encodeURIComponent(id)}/refresh`, {
    method: "POST",
  });
export const cancelSpriteJob = (id: string) =>
  request<SpriteJob>(`/spritecook/jobs/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
  });
export const attachSpriteJob = (id: string, remoteId: string) =>
  request<SpriteJob>(`/spritecook/jobs/${encodeURIComponent(id)}/attach`, {
    method: "POST",
    body: JSON.stringify({ remoteId }),
  });
export const getSpriteRecipe = (id: string) =>
  request<SpriteRecipe | null>(
    `/sprite-tools/recipes/${encodeURIComponent(id)}`,
  );
export const saveSpriteRecipe = (recipe: SpriteRecipe) =>
  request<SpriteRecipe>("/sprite-tools/recipe", {
    method: "PUT",
    body: JSON.stringify(recipe),
  });
export const cutSpriteRecipe = (recipe: SpriteRecipe) =>
  request<LibraryAsset[]>("/sprite-tools/cut", {
    method: "POST",
    body: JSON.stringify(recipe),
  });
export const exportSpriteRecipe = (recipe: SpriteRecipe) =>
  request<{ fileName: string; data: string }>("/sprite-tools/export", {
    method: "POST",
    body: JSON.stringify(recipe),
  });
