import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import type { ProjectState } from "../shared/contracts.js";
import { writeAtomically } from "./checkpoint-objects.js";

type Project = Pick<
  ProjectState,
  "workspacePath" | "storagePath" | "workspaceCheckpointId"
>;
const switchedWorkspaceNotice =
  "The user selected a different workspace. Earlier file paths and checkpoints refer to another folder. Inspect the current files before continuing.";
const noticePath = (project: Project) =>
  path.join(
    project.storagePath ?? path.dirname(project.workspacePath),
    "workspace-restore-notice.txt",
  );
/** Outside creative files: an interrupted restore must still inform future
 * model requests even if recording an individual session failed. */
export async function writeWorkspaceNotice(
  project: Project,
  notice: string,
  version: string = randomUUID(),
): Promise<void> {
  const target = noticePath(project);
  await mkdir(path.dirname(target), { recursive: true });
  await writeAtomically(
    path.dirname(target),
    target,
    `[workspace-version:${version}]\n${project.workspaceCheckpointId ? `[workspace-id:${project.workspaceCheckpointId}]\n` : ""}${notice}`,
  );
}
export async function readWorkspaceNotice(
  project: Project,
): Promise<string | undefined> {
  try {
    const text = await readFile(noticePath(project), "utf8");
    if (
      project.workspaceCheckpointId &&
      !text.includes(`[workspace-id:${project.workspaceCheckpointId}]\n`)
    )
      return switchedWorkspaceNotice;
    return text
      .replace(/^\[workspace-version:[^\]]+\]\n/, "")
      .replace(/^\[workspace-id:[^\]]+\]\n/, "");
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT")
      return project.workspaceCheckpointId
        ? switchedWorkspaceNotice
        : undefined;
    throw cause;
  }
}
export async function readWorkspaceVersion(project: Project): Promise<string> {
  try {
    const text = await readFile(noticePath(project), "utf8");
    if (
      project.workspaceCheckpointId &&
      !text.includes(`[workspace-id:${project.workspaceCheckpointId}]\n`)
    )
      return project.workspaceCheckpointId;
    return (
      /^\[workspace-version:([a-f0-9-]{36})\]/.exec(text)?.[1] ??
      project.workspaceCheckpointId ??
      "0"
    );
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT")
      return project.workspaceCheckpointId ?? "0";
    throw cause;
  }
}
