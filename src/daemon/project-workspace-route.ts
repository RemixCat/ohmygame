import type { FastifyInstance } from "fastify";
import type { RuntimeEventBus } from "../shared/events.js";
import type { ProjectState } from "../shared/contracts.js";
import type { AgentManager } from "./agent.js";
import type { CheckpointStore } from "./checkpoints.js";
import type { PreviewManager } from "./preview.js";
import type { ProjectManager } from "./projects.js";
import { ProjectWriteError, type ProjectWrites } from "./project-writes.js";
import { writeWorkspaceNotice } from "./workspace-notice.js";

export function registerProjectWorkspaceRoute(
  app: FastifyInstance,
  options: {
    projects: ProjectManager;
    writes: ProjectWrites;
    agents: AgentManager;
    checkpoints: CheckpointStore;
    previews: PreviewManager;
    events: RuntimeEventBus;
    busy: (id: string) => boolean;
    clearRuntime: (project: ProjectState) => Promise<void>;
  },
) {
  const { projects, writes, agents, checkpoints, previews, events } = options;
  app.put<{ Params: { projectId: string }; Body: { workspacePath: string } }>(
    "/projects/:projectId/settings/workspace",
    {
      schema: {
        body: {
          type: "object",
          required: ["workspacePath"],
          additionalProperties: false,
          properties: {
            workspacePath: { type: "string", minLength: 1, maxLength: 4096 },
          },
        },
      },
    },
    async (request, reply) => {
      const id = request.params.projectId;
      let changedVersion: string | undefined;
      const assertIdle = () => {
        if (agents.isProjectBusy(id) || options.busy(id))
          throw new ProjectWriteError(
            "Wait for agents, generation jobs and publishing to finish before selecting a workspace.",
            "workspace_busy",
          );
      };
      try {
        if (!projects.get(id))
          return reply.code(404).send({ error: "Project not found" });
        assertIdle();
        await agents.turnsClosed(id);
        return await writes.exclusive(id, async () => {
          writes.assertVersion(
            id,
            request.headers["x-workspace-version"] as string | undefined,
          );
          assertIdle();
          const project = projects.get(id)!;
          if (await checkpoints.unfinished(project))
            throw new ProjectWriteError(
              "Recover the interrupted file restore before selecting a workspace.",
              "workspace_busy",
            );
          const selected = await projects.validateWorkspaceSelection(
            id,
            request.body.workspacePath,
          );
          if (selected === project.workspacePath) return project;
          await checkpoints.settled(project);
          await previews.forget(project);
          await options.clearRuntime(project);
          await projects.setWorkspace(id, selected);
          changedVersion = writes.changed(id);
          agents.invalidateProjectSessions(id);
          await writeWorkspaceNotice(
            project,
            "The user selected a different project workspace. Project identity and conversations were preserved; no creative files were moved or copied. Earlier conversation file paths and file checkpoints refer to the previous workspace. Inspect the current workspace before continuing and do not assume old files or attachments exist here.",
            changedVersion,
          );
          return project;
        });
      } catch (cause) {
        const error = cause as Error & { statusCode?: number; code?: string };
        return reply.code(error.statusCode ?? 400).send({
          error: error.message,
          ...(changedVersion
            ? { code: "workspace_stale" }
            : error.code
              ? { code: error.code }
              : {}),
        });
      } finally {
        // Listeners must reload only after the exclusive workspace lock releases.
        if (changedVersion) {
          reply.header("x-workspace-version", changedVersion);
          events.publish(id, "project.updated", {
            project: structuredClone(projects.get(id)!),
          });
          events.publish(id, "workspace.restored", {
            version: changedVersion,
            changed: [],
          });
        }
      }
    },
  );
}
