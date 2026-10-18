import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  SPRITECOOK_OPERATIONS,
  type SpriteOperation,
  type SpriteRecipe,
} from "../shared/spritecook.js";
import { SPRITECOOK_SCHEMAS } from "../shared/spritecook-schema.js";
import type { SpriteCookService } from "./spritecook.js";
import type { SpriteTools } from "./sprite-tools.js";
import type { AssetLibrary } from "./asset-library.js";
import type { ProjectManager } from "./projects.js";

export function createSpriteAgentTools(
  projectId: string,
  provider: SpriteCookService,
  tools: SpriteTools,
  library: AssetLibrary,
  projects: ProjectManager,
) {
  const answer = (value: unknown) => ({
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    details: value,
  });
  return [
    defineTool({
      name: "spritecook",
      label: "SpriteCook 2D assets",
      description:
        "Create sprites, 2D animations, tilesets and UI art through the user's SpriteCook connection. Call catalog for model/action options and supported parameter schemas. Start returns a durable task; poll with refresh and never repeat a paid start after a timeout. Use a local Library sourceAssetId to import an existing image. Character action batches require a character_id from a completed character generation. Do not generate for discussion-only requests. Completed files are in Library, not yet integrated into gameplay; use sprite_tools copy_to_project and wire them into the engine.",
      parameters: Type.Object({
        action: Type.Union([
          Type.Literal("catalog"),
          Type.Literal("start"),
          Type.Literal("refresh"),
          Type.Literal("cancel"),
          Type.Literal("attach"),
          Type.Literal("history"),
        ]),
        operation: Type.Optional(
          Type.String({ description: SPRITECOOK_OPERATIONS.join(", ") }),
        ),
        input: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
        sourceAssetId: Type.Optional(Type.String()),
        taskId: Type.Optional(Type.String()),
        requestId: Type.Optional(
          Type.String({
            description:
              "Stable ID for one paid intent; reuse after a transport timeout",
          }),
        ),
        remoteId: Type.Optional(Type.String()),
      }),
      execute: async (callId, input, signal) => {
        signal?.throwIfAborted();
        if (input.action === "catalog")
          return answer({
            catalog: await provider.catalog(),
            schemas: SPRITECOOK_SCHEMAS,
          });
        if (input.action === "history")
          return answer(provider.list().slice(0, 30));
        if (input.action === "start")
          return answer(
            await provider.start(
              input.operation as SpriteOperation,
              input.input ?? {},
              input.sourceAssetId,
              input.requestId ?? callId,
            ),
          );
        if (!input.taskId) throw new Error("taskId is required");
        if (input.action === "refresh")
          return answer(await provider.refresh(input.taskId));
        if (input.action === "cancel")
          return answer(await provider.cancel(input.taskId));
        if (!input.remoteId)
          throw new Error(
            "remoteId is required to reconcile an uncertain submission",
          );
        return answer(await provider.attach(input.taskId, input.remoteId));
      },
    }),
    defineTool({
      name: "sprite_tools",
      label: "Local sprite and UI tools",
      description:
        "Local, provider-independent slicing, per-component 9-slice borders, UI state families, sprite-sheet/atlas export and Unity/Godot import helpers. No model credits. A recipe has version:1, assetId, source width/height, frames:[{name,x,y,width,height,borders?:{left,top,right,bottom},family?,state?}], fps, loop, top-left normalized pivot:{x,y}, default borders:{left,top,right,bottom}. Rectangles use source pixels and keep their full canvas; inspect alignment before declaring an animation ready. copy_to_project saves Library outputs under assets/generated; export saves a ZIP containing PNGs, atlas, manifest and engine helpers. Neither action proves engine integration or a playtest.",
      parameters: Type.Object({
        action: Type.Union([
          Type.Literal("list_images"),
          Type.Literal("get_recipe"),
          Type.Literal("save_recipe"),
          Type.Literal("cut"),
          Type.Literal("export"),
          Type.Literal("copy_to_project"),
        ]),
        query: Type.Optional(Type.String()),
        assetId: Type.Optional(Type.String()),
        assetIds: Type.Optional(Type.Array(Type.String(), { maxItems: 128 })),
        recipe: Type.Optional(Type.Unknown()),
      }),
      execute: async (_callId, input, signal) => {
        signal?.throwIfAborted();
        if (input.action === "list_images")
          return answer(
            library
              .list()
              .filter(
                (a) =>
                  a.mediaType === "image" &&
                  (!input.query ||
                    a.name.toLowerCase().includes(input.query.toLowerCase())),
              )
              .slice(0, 100),
          );
        if (input.action === "get_recipe")
          return answer(tools.recipe(input.assetId ?? "") ?? null);
        if (input.action === "copy_to_project") {
          if (!input.assetIds?.length) throw new Error("assetIds is required");
          const paths = [];
          for (const id of input.assetIds) {
            const { asset, absolutePath } = await library.content(id);
            signal?.throwIfAborted();
            paths.push(
              await projects.addGeneratedAsset(
                projectId,
                `sprite-${id}-${asset.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`,
                await readFile(absolutePath),
                { libraryAssetId: id },
              ),
            );
          }
          return answer({ paths });
        }
        if (!input.recipe) throw new Error("recipe is required");
        const recipe = input.recipe as SpriteRecipe;
        if (input.action === "save_recipe")
          return answer(await tools.save(recipe));
        if (input.action === "cut") return answer(await tools.cut(recipe));
        const bytes = await tools.export(recipe);
        signal?.throwIfAborted();
        return answer({
          path: await projects.addGeneratedAsset(
            projectId,
            `studio-2d-${randomUUID()}.zip`,
            bytes,
          ),
          notice:
            "Extract this archive and integrate its assets through the target engine's import pipeline.",
        });
      },
    }),
  ];
}
