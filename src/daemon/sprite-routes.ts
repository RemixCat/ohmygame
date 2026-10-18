import type { FastifyInstance } from "fastify";
import type { SpriteRecipe, SpriteOperation } from "../shared/spritecook.js";
import type { SpriteCookService } from "./spritecook.js";
import type { SpriteTools } from "./sprite-tools.js";

export function registerSpriteRoutes(
  app: FastifyInstance,
  provider: SpriteCookService,
  tools: SpriteTools,
) {
  const run = async (reply: any, operation: () => Promise<unknown>) => {
    try {
      return await operation();
    } catch (e) {
      return reply
        .code(
          typeof (e as any).statusCode === "number"
            ? (e as any).statusCode
            : 400,
        )
        .send({
          error: e instanceof Error ? e.message : "2D operation failed",
        });
    }
  };
  app.get("/settings/models/providers/spritecook", async () =>
    provider.settings(),
  );
  app.put<{ Body: { apiKey: string } }>(
    "/settings/models/providers/spritecook",
    async (req, reply) => run(reply, () => provider.setKey(req.body?.apiKey)),
  );
  app.get("/spritecook/catalog", async (_req, reply) =>
    run(reply, () => provider.catalog()),
  );
  app.get("/spritecook/assets/recent", async (_req, reply) =>
    run(reply, () => provider.recent()),
  );
  app.get<{ Params: { id: string } }>(
    "/spritecook/assets/:id",
    async (req, reply) => run(reply, () => provider.metadata(req.params.id)),
  );
  app.post<{ Body: { assetId: string } }>(
    "/spritecook/import",
    async (req, reply) =>
      run(reply, async () => ({
        id: await provider.importAsset(req.body.assetId),
      })),
  );
  app.get("/spritecook/jobs", async () => provider.list());
  app.post<{
    Body: {
      operation: SpriteOperation;
      input: Record<string, unknown>;
      sourceAssetId?: string;
      requestId: string;
    };
  }>("/spritecook/jobs", { bodyLimit: 100_000 }, async (req, reply) =>
    run(reply, async () => {
      const job = await provider.start(
        req.body.operation,
        req.body.input,
        req.body.sourceAssetId,
        req.body.requestId,
      );
      reply.code(202);
      return job;
    }),
  );
  app.post<{ Params: { id: string } }>(
    "/spritecook/jobs/:id/refresh",
    async (req, reply) => run(reply, () => provider.refresh(req.params.id)),
  );
  app.post<{ Params: { id: string }; Body: { remoteId: string } }>(
    "/spritecook/jobs/:id/attach",
    async (req, reply) =>
      run(reply, () => provider.attach(req.params.id, req.body.remoteId)),
  );
  app.post<{ Params: { id: string } }>(
    "/spritecook/jobs/:id/cancel",
    async (req, reply) => run(reply, () => provider.cancel(req.params.id)),
  );
  app.get<{ Params: { id: string } }>(
    "/sprite-tools/recipes/:id",
    async (req) => tools.recipe(req.params.id) ?? null,
  );
  app.put<{ Body: SpriteRecipe }>(
    "/sprite-tools/recipe",
    { bodyLimit: 100_000 },
    async (req, reply) => run(reply, () => tools.save(req.body)),
  );
  app.post<{ Body: SpriteRecipe }>(
    "/sprite-tools/cut",
    { bodyLimit: 100_000 },
    async (req, reply) => run(reply, () => tools.cut(req.body)),
  );
  app.post<{ Body: SpriteRecipe }>(
    "/sprite-tools/export",
    { bodyLimit: 100_000 },
    async (req, reply) =>
      run(reply, async () => ({
        fileName: "studio-2d.zip",
        data: (await tools.export(req.body)).toString("base64"),
      })),
  );
}
