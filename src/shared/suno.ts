import type { AudioModel } from "./audio.js";

/** Standalone MuMu connection; remove this module and its registration when superseded upstream. */
export const SUNO_PROVIDER_ID = "suno-mumu";
export const SUNO_PROVIDER_NAME = "Suno · MuMu";
export const SUNO_BASE_URL = "https://zhongzhuan.mumuverse.space";
export const SUNO_DOCS_URL = "https://4u264cfiu1.apifox.cn/doc-9454819";

// Published by MuMu's Suno documentation. These are presets, not an entitlement check.
export const SUNO_MODELS: readonly AudioModel[] = [
  ["chirp-v5", "Suno V5"],
  ["chirp-auk", "Suno V4.5"],
  ["chirp-v4", "Suno V4"],
  ["chirp-v3-5", "Suno V3.5"],
  ["chirp-v3-0", "Suno V3"],
].map(([id, name]) => ({
  provider: SUNO_PROVIDER_ID,
  providerName: SUNO_PROVIDER_NAME,
  id: id!,
  name: name!,
  protocol: "suno-new-api",
  capabilities: {
    operations: ["music"],
    executionModes: ["async-task"],
    formats: ["mp3"],
    supportsLyrics: true,
    supportsInstrumental: true,
    supportsDuration: false,
    supportsLoop: false,
    supportsReferenceAudio: false,
  },
}));
