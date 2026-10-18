import {
  readWorkspaceNotice,
  readWorkspaceVersion,
  writeWorkspaceNotice,
} from "../src/daemon/workspace-notice.js";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createApp } from "../src/daemon/app.js";
import { ProjectManager } from "../src/daemon/projects.js";
import {
  CheckpointStore,
  checkpointDirectory,
} from "../src/daemon/checkpoints.js";

const apps: ReturnType<typeof createApp>[] = [];
const directories: string[] = [];
async function folder() {
  const p = await mkdtemp(path.join(tmpdir(), "omg-workspace-choice-"));
  directories.push(p);
  return p;
}
async function setup(options: Partial<Parameters<typeof createApp>[0]> = {}) {
  const dataDirectory = await folder();
  const app = createApp({ dataDirectory, ...options });
  apps.push(app);
  const project = (
    await app.inject({
      method: "POST",
      url: "/projects",
      payload: { name: "Keep project", type: "general" },
    })
  ).json();
  return { app, project, dataDirectory };
}
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
  await Promise.all(
    directories.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
  vi.restoreAllMocks();
});

it("rebinds a project without moving files or losing conversations, isolates checkpoints and survives restart", async () => {
  const { app, project, dataDirectory } = await setup();
  await writeFile(path.join(project.workspacePath, "keep.txt"), "old folder");
  const conversation = (
    await app.inject({
      method: "POST",
      url: `/projects/${project.id}/conversations`,
    })
  ).json();
  const store = new CheckpointStore();
  const before = await store.snapshot(project);
  const oldCheckpoints = checkpointDirectory(project);
  const selected = await folder();
  await writeFile(path.join(selected, "keep.txt"), "selected folder");
  const response = await app.inject({
    method: "PUT",
    url: `/projects/${project.id}/settings/workspace`,
    payload: { workspacePath: selected },
  });
  expect(response.statusCode, response.body).toBe(200);
  const updated = response.json();
  expect(updated).toMatchObject({
    id: project.id,
    name: project.name,
    type: project.type,
    workspaceLocation: "external",
    workspaceAvailable: true,
    storagePath: project.storagePath,
  });
  expect(updated.workspaceCheckpointId).toMatch(/^[a-f0-9-]{36}$/);
  expect(checkpointDirectory(updated)).not.toBe(oldCheckpoints);
  await expect(store.restore(updated, before)).rejects.toThrow();
  expect(
    await readFile(path.join(project.workspacePath, "keep.txt"), "utf8"),
  ).toBe("old folder");
  expect(await readFile(path.join(selected, "keep.txt"), "utf8")).toBe(
    "selected folder",
  );
  expect(
    (
      await app.inject({
        method: "GET",
        url: `/projects/${project.id}/conversations`,
      })
    ).json(),
  ).toContainEqual(expect.objectContaining({ id: conversation.id }));
  const oldWrite = await app.inject({
    method: "PUT",
    url: `/projects/${project.id}/settings/workspace`,
    headers: { "x-workspace-version": "0" },
    payload: { workspacePath: project.workspacePath },
  });
  expect(oldWrite.statusCode).toBe(409);
  expect(oldWrite.json().code).toBe("workspace_stale");
  const version = response.headers["x-workspace-version"] as string;
  expect(version).not.toBe("0");
  const noOp = await app.inject({
    method: "PUT",
    url: `/projects/${project.id}/settings/workspace`,
    headers: { "x-workspace-version": version },
    payload: { workspacePath: updated.workspacePath },
  });
  expect(noOp.statusCode).toBe(200);
  expect(noOp.json().workspaceCheckpointId).toBe(updated.workspaceCheckpointId);
  await app.close();
  apps.splice(apps.indexOf(app), 1);
  const restarted = createApp({ dataDirectory });
  apps.push(restarted);
  const loaded = await restarted.inject({
    method: "GET",
    url: `/projects/${project.id}`,
  });
  expect(loaded.json()).toMatchObject({
    workspacePath: updated.workspacePath,
    workspaceCheckpointId: updated.workspaceCheckpointId,
  });
  expect(loaded.headers["x-workspace-version"]).toBe(version);
  await restarted.inject({
    method: "DELETE",
    url: `/projects/${project.id}`,
    headers: { "x-workspace-version": version },
  });
  expect(await readFile(path.join(selected, "keep.txt"), "utf8")).toBe(
    "selected folder",
  );
});

it("rejects unavailable, relative, symlink, storage, filesystem-root and overlapping project folders", async () => {
  const { app, project, dataDirectory } = await setup();
  const selected = await folder();
  const owner = (
    await app.inject({
      method: "POST",
      url: "/projects",
      payload: { workspacePath: selected },
    })
  ).json();
  const nested = path.join(selected, "nested");
  await mkdir(nested);
  const links = await folder();
  const link = path.join(links, "link");
  await symlink(nested, link);
  for (const workspacePath of [
    "relative",
    "/",
    path.join(links, "missing"),
    link,
    selected,
    nested,
    dataDirectory,
  ]) {
    const response = await app.inject({
      method: "PUT",
      url: `/projects/${project.id}/settings/workspace`,
      payload: { workspacePath },
    });
    expect(response.statusCode, workspacePath + response.body).toBe(400);
  }
  expect(
    (await app.inject({ method: "GET", url: `/projects/${project.id}` })).json()
      .workspacePath,
  ).toBe(project.workspacePath);
  expect(
    (await app.inject({ method: "GET", url: `/projects/${owner.id}` })).json()
      .workspacePath,
  ).toBe(owner.workspacePath);
});

it("serializes competing workspace selections so two projects cannot own the same folder", async () => {
  const manager = new ProjectManager(await folder());
  await manager.load();
  const a = await manager.create("A"),
    b = await manager.create("B"),
    selected = await folder();
  const results = await Promise.allSettled([
    manager.setWorkspace(a.id, selected),
    manager.setWorkspace(b.id, selected),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
});

it("refuses to change folders while an agent is running", async () => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const prompt = vi.fn(async () => pending);
  const { app, project } = await setup({
    createSession: async () => ({
      messages: [],
      prompt,
      abort: async () => {},
      dispose() {},
      subscribe: () => () => {},
    }),
  });
  const conversation = (
    await app.inject({
      method: "POST",
      url: `/projects/${project.id}/conversations`,
    })
  ).json();
  await app.inject({
    method: "POST",
    url: `/projects/${project.id}/conversations/${conversation.id}/turns`,
    payload: { prompt: "Wait" },
  });
  await vi.waitFor(() => expect(prompt).toHaveBeenCalled());
  try {
    const response = await app.inject({
      method: "PUT",
      url: `/projects/${project.id}/settings/workspace`,
      payload: { workspacePath: await folder() },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("workspace_busy");
  } finally {
    finish();
  }
  await vi.waitFor(async () =>
    expect(
      (await app.inject({ method: "GET", url: "/projects/activity" })).json(),
    ).toEqual([]),
  );
});

it("drains an in-flight writer before switching and refuses new stale writes", async () => {
  const app = createApp({ dataDirectory: await folder() });
  apps.push(app);
  let started!: () => void, release!: () => void;
  const entered = new Promise<void>((r) => {
    started = r;
  });
  const pending = new Promise<void>((r) => {
    release = r;
  });
  let original = "";
  app.post("/projects/:projectId/test-writer", async () => {
    started();
    await pending;
    await writeFile(path.join(original, "writer.txt"), "finished in original");
    return {};
  });
  const project = (
    await app.inject({ method: "POST", url: "/projects", payload: {} })
  ).json();
  original = project.workspacePath;
  const writer = app
    .inject({ method: "POST", url: `/projects/${project.id}/test-writer` })
    .then((r) => r);
  await entered;
  const destination = await folder();
  let done = false;
  const change = app
    .inject({
      method: "PUT",
      url: `/projects/${project.id}/settings/workspace`,
      payload: { workspacePath: destination },
    })
    .then((r) => {
      done = true;
      return r;
    });
  await vi.waitFor(async () => {
    const probe = await app.inject({
      method: "PATCH",
      url: `/projects/${project.id}`,
      payload: { name: "not applied" },
    });
    expect(probe.statusCode).toBe(409);
  });
  expect(done).toBe(false);
  release();
  await writer;
  expect((await change).statusCode).toBe(200);
  expect(await readFile(path.join(original, "writer.txt"), "utf8")).toBe(
    "finished in original",
  );
  await expect(
    readFile(path.join(destination, "writer.txt")),
  ).rejects.toThrow();
});

it("keeps a new workspace version and inspection notice if shutdown interrupts notice persistence", async () => {
  const manager = new ProjectManager(await folder());
  await manager.load();
  const project = await manager.create();
  await writeWorkspaceNotice(
    project,
    "Old workspace notice",
    "11111111-1111-4111-8111-111111111111",
  );
  await manager.setWorkspace(project.id, await folder());
  // Metadata is committed first; the process can exit before the new notice is written.
  expect(await readWorkspaceVersion(project)).toBe(
    project.workspaceCheckpointId,
  );
  expect(await readWorkspaceNotice(project)).toContain("different workspace");
  await rm(path.join(project.storagePath!, "workspace-restore-notice.txt"));
  expect(await readWorkspaceVersion(project)).toBe(
    project.workspaceCheckpointId,
  );
  expect(await readWorkspaceNotice(project)).toContain(
    "Inspect the current files",
  );
});
