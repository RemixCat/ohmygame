// Request field names and constraints reviewed against https://www.spritecook.ai/openapi.json on 2026-10-18.
import type { SpriteField } from "./spritecook.js";
export const SPRITECOOK_SCHEMAS: Record<string, SpriteField> = {
  generate: {
    type: "object",
    required: ["prompt"],
    properties: {
      prompt: {
        type: "string",
        minLength: 1,
        maxLength: 5000,
      },
      width: {
        type: "integer",
        default: 64,
        minimum: 16.0,
        maximum: 512.0,
      },
      height: {
        type: "integer",
        default: 64,
        minimum: 16.0,
        maximum: 512.0,
      },
      variations: {
        type: "integer",
        default: 1,
        minimum: 1.0,
        maximum: 4.0,
      },
      pixel: {
        type: "boolean",
        default: true,
      },
      pixel_perfect: {
        type: "boolean",
        default: true,
      },
      bg_mode: {
        type: "string",
        default: "transparent",
        pattern: "^(transparent|white|include)$",
      },
      project_id: {
        type: "string",
      },
      theme: {
        type: "string",
        maxLength: 500,
      },
      style: {
        type: "string",
        maxLength: 500,
      },
      aspect_ratio: {
        type: "string",
        default: "1:1",
        pattern: "^(1:1|16:9|9:16)$",
      },
      smart_crop: {
        type: "boolean",
        default: true,
      },
      smart_crop_mode: {
        type: "string",
        default: "tightest",
        pattern: "^(tightest|power_of_2)$",
      },
      model: {
        type: "string",
      },
      mode: {
        type: "string",
        default: "assets",
        pattern: "^(assets|texture|ui)$",
      },
      resolution: {
        type: "string",
        default: "1K",
        pattern: "^(1K|2K|4K)$",
      },
      quality: {
        type: "string",
        default: "medium",
        pattern: "^(low|medium|high)$",
      },
      colors: {
        type: "array",
        maxItems: 64,
        items: {
          type: "string",
        },
      },
      style_asset_ids: {
        type: "array",
        maxItems: 14,
        items: {
          type: "string",
        },
      },
      reference_asset_id: {
        type: "string",
      },
      edit_asset_id: {
        type: "string",
      },
      runpod_alpha_threshold_enabled: {
        type: "boolean",
      },
      runpod_alpha_cutoff: {
        type: "integer",
        minimum: 0.0,
        maximum: 255.0,
      },
    },
  },
  animate: {
    type: "object",
    required: ["prompt"],
    properties: {
      asset_id: {
        type: "string",
      },
      prompt: {
        type: "string",
        minLength: 1,
        maxLength: 3000,
      },
      auto_enhance_prompt: {
        type: "boolean",
        default: true,
      },
      edge_margin: {
        type: "integer",
        default: 6,
        minimum: 0.0,
        maximum: 25.0,
      },
      pixel: {
        type: "boolean",
      },
      model: {
        type: "string",
        enum: ["pixel-engine-v1.1", "frame-engine-v1.1", "pixel-engine-v1.5"],
      },
      output_frames: {
        type: "integer",
        default: 8,
        minimum: 2.0,
        maximum: 24.0,
      },
      output_format: {
        type: "string",
        enum: ["webp", "gif", "spritesheet"],
        default: "webp",
      },
      negative_prompt: {
        type: "string",
        maxLength: 1000,
      },
      matte_color: {
        type: "string",
      },
      removebg: {
        type: "string",
        default: "Basic",
      },
      colors: {
        type: "integer",
        default: 24,
        minimum: 2.0,
        maximum: 256.0,
      },
      use_random_seed: {
        type: "boolean",
        default: true,
      },
      seed: {
        type: "integer",
      },
      runpod_alpha_threshold_enabled: {
        type: "boolean",
      },
      runpod_alpha_cutoff: {
        type: "integer",
        minimum: 0.0,
        maximum: 255.0,
      },
    },
  },
  tilesets: {
    type: "object",
    required: ["prompt"],
    properties: {
      prompt: {
        type: "string",
        minLength: 1,
        maxLength: 5000,
      },
      style_mode: {
        type: "string",
        enum: ["pixel", "detailed"],
      },
      perspective: {
        type: "string",
        enum: ["topdown", "platformer", "isometric"],
      },
      piece_set: {
        type: "string",
        enum: [
          "15-piece",
          "17-piece-base",
          "autotile-16-set",
          "isometric-3x5-32",
          "isometric-2x4-64",
        ],
      },
      tile_size: {
        type: "integer",
        minimum: 1.0,
        maximum: 512.0,
      },
      elevation: {
        type: "string",
        enum: ["no-elevation", "minimal"],
      },
      edges: {
        type: "string",
        enum: ["transparent", "two_surfaces"],
      },
      variations: {
        type: "integer",
        default: 1,
        minimum: 1.0,
        maximum: 4.0,
      },
      project_id: {
        type: "string",
      },
      theme: {
        type: "string",
        maxLength: 500,
      },
      style: {
        type: "string",
        maxLength: 500,
      },
      model: {
        type: "string",
      },
      colors: {
        type: "array",
        maxItems: 64,
        items: {
          type: "string",
        },
      },
      force_enabled: {
        type: "boolean",
        default: false,
      },
      force_colors: {
        type: "array",
        maxItems: 64,
        items: {
          type: "string",
        },
      },
      force_automatic: {
        type: "boolean",
        default: false,
      },
      force_color_count: {
        type: "integer",
        minimum: 1.0,
        maximum: 64.0,
      },
      reference_asset_id: {
        type: "string",
      },
      edit_asset_id: {
        type: "string",
      },
      style_asset_id: {
        type: "string",
      },
    },
  },
  character: {
    type: "object",
    required: ["prompt", "perspective"],
    properties: {
      prompt: {
        type: "string",
        minLength: 1,
        maxLength: 5000,
      },
      perspective: {
        type: "string",
        enum: ["platformer", "isometric", "topdown"],
      },
      model: {
        type: "string",
      },
      quality: {
        type: "string",
        default: "medium",
        pattern: "^(low|medium|high)$",
      },
    },
  },
  "character-animations": {
    type: "object",
    required: ["perspective"],
    properties: {
      perspective: {
        type: "string",
        enum: ["platformer", "isometric", "topdown"],
      },
      animation_ids: {
        type: "array",
        items: {
          type: "string",
        },
      },
      custom_animations: {
        type: "array",
        items: {
          type: "object",
          required: ["prompt"],
          properties: {
            id: {
              type: "string",
              maxLength: 80,
            },
            label: {
              type: "string",
              maxLength: 80,
            },
            prompt: {
              type: "string",
              minLength: 1,
              maxLength: 3000,
            },
            source_view: {
              type: "string",
            },
            output_frames: {
              type: "integer",
              default: 8,
              minimum: 2.0,
              maximum: 16.0,
            },
          },
        },
      },
      bg_removal_provider: {
        type: "string",
        pattern: "^(basic|photoroom)$",
      },
      photoroom_mode: {
        type: "string",
      },
    },
  },
  "remove-background": {
    type: "object",
    properties: {
      asset_id: {
        type: "string",
      },
      runpod_alpha_threshold_enabled: {
        type: "boolean",
      },
      runpod_alpha_cutoff: {
        type: "integer",
        minimum: 0,
        maximum: 255,
      },
    },
  },
  "alpha-cutoff": {
    type: "object",
    required: ["cutoff"],
    properties: {
      cutoff: {
        type: "integer",
        minimum: 0.0,
        maximum: 255.0,
      },
    },
  },
  "auto-slice": {
    type: "object",
    properties: {
      source_variant: {
        type: "string",
        enum: ["auto", "raw", "pixel"],
        default: "auto",
      },
      alpha_threshold: {
        type: "integer",
        minimum: 0,
        maximum: 255,
        default: 1,
      },
      min_area: {
        type: "integer",
        minimum: 1,
        maximum: 1000000,
        default: 24,
      },
      padding: {
        type: "integer",
        minimum: 0,
        maximum: 256,
        default: 0,
      },
      merge_distance: {
        type: "integer",
        minimum: 0,
        maximum: 256,
        default: 1,
      },
    },
  },
};
