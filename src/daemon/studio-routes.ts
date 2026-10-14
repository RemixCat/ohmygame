import type { CanvasStore } from "./canvas-workspace.js";
import { BUILTIN_WORKFLOWS } from "../shared/studio-templates.js";
import type { FastifyInstance } from "fastify";
import type { StudioStore } from "./studio-store.js";
import { CanvasError } from "./canvas-files.js";
import type { ProjectProduction, StudioLibrary } from "../shared/studio.js";

export function registerStudioRoutes(
  app: FastifyInstance,
  store: StudioStore,
  canvas?: CanvasStore,
): void {
  for (const route of [
    "/library/organization",
    "/projects/:projectId/production",
  ]) {
    const project = (params: unknown) =>
      (params as { projectId?: string }).projectId;
    app.get(route, async (req, reply) => {
      try {
        return await store.read(project(req.params));
      } catch (e) {
        return reply
          .code(e instanceof CanvasError ? e.statusCode : 400)
          .send({ error: e instanceof Error ? e.message : String(e) });
      }
    });
    app.put<{
      Body: { value: StudioLibrary | ProjectProduction; revision: string };
    }>(route, { bodyLimit: 16 * 1024 * 1024 }, async (req, reply) => {
      try {
        if (!req.body || typeof req.body.revision !== "string")
          throw new CanvasError("A saved revision is required");
        return await store.save(
          req.body.value,
          req.body.revision,
          project(req.params),
        );
      } catch (e) {
        return reply
          .code(e instanceof CanvasError ? e.statusCode : 400)
          .send({ error: e instanceof Error ? e.message : String(e) });
      }
    });
  }
  app.post<{
    Body: {
      filter: import("../shared/studio.js").StudioFilter;
      projectId?: string;
    };
  }>("/library/studio/query", async (req, reply) => {
    try {
      if (!req.body || typeof req.body.filter !== "object" || !req.body.filter)
        throw new CanvasError("A filter is required");
      return await store.query(req.body.filter, req.body.projectId);
    } catch (e) {
      return reply
        .code(e instanceof CanvasError ? e.statusCode : 400)
        .send({ error: String(e) });
    }
  });
  app.post<{ Body: Parameters<StudioStore["batch"]>[0] }>(
    "/library/studio/batch",
    async (req, reply) => {
      try {
        if (!req.body || typeof req.body.revision !== "string")
          throw new CanvasError("A revision is required");
        return await store.batch(req.body);
      } catch (e) {
        return reply
          .code(e instanceof CanvasError ? e.statusCode : 400)
          .send({ error: String(e) });
      }
    },
  );
  if (canvas) {
    app.post<{
      Params: { projectId: string };
      Body: { boardId: string; groupId: string; name: string };
    }>("/projects/:projectId/studio/capture", async (req, reply) => {
      try {
        const { boardId, groupId, name } = req.body;
        if (typeof name !== "string" || !name.trim() || name.length > 200)
          throw new CanvasError("Invalid template name");
        return await canvas.captureTemplate(
          req.params.projectId,
          boardId,
          groupId,
          name,
        );
      } catch (e) {
        return reply
          .code(e instanceof CanvasError ? e.statusCode : 400)
          .send({ error: String(e) });
      }
    });
    app.post<{
      Params: { projectId: string };
      Body: {
        boardId: string;
        templateId: string;
        values: Record<string, string>;
        bindings: Record<string, string>;
        revision: string;
      };
    }>("/projects/:projectId/studio/insert", async (req, reply) => {
      try {
        const { boardId, templateId, values, bindings, revision } = req.body;
        const template =
          (await store.read()).value.templates.find(
            (t) => t.id === templateId,
          ) ?? BUILTIN_WORKFLOWS.find((t) => t.id === templateId);
        if (!template) throw new CanvasError("Template not found", 404);
        return await canvas.insertTemplate(
          req.params.projectId,
          boardId,
          template,
          values,
          bindings,
          revision,
        );
      } catch (e) {
        return reply
          .code(e instanceof CanvasError ? e.statusCode : 400)
          .send({ error: String(e) });
      }
    });
    app.post<{
      Params: { projectId: string; boardId: string; nodeId: string };
    }>(
      "/projects/:projectId/canvas/boards/:boardId/nodes/:nodeId/production-preview",
      async (req, reply) => {
        try {
          return await canvas.generateNode(
            req.params.projectId,
            req.params.boardId,
            req.params.nodeId,
            true,
          );
        } catch (e) {
          return reply
            .code(e instanceof CanvasError ? e.statusCode : 400)
            .send({ error: String(e) });
        }
      },
    );
  }
}
