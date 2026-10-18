import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { AssetLibrary } from "../src/daemon/asset-library.js";
import { CanvasStore } from "../src/daemon/canvas-workspace.js";
import { ProjectManager } from "../src/daemon/projects.js";
import { ToolRunner } from "../src/daemon/tools.js";
import { createTopic } from "../src/shared/canvas-diagram.js";
import {
  createAssetCanvasDocument,
  isAssetCanvasDocument,
} from "../src/shared/asset-canvas.js";
import {
  createCanvasClipboard,
  parseCanvasClipboard,
  duplicateCanvasSelection,
} from "../src/renderer/asset-canvas-clipboard.js";
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  );
});
it("persists shared board links and viewports independently of target renames/deletions or topic removal", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "ohmygame-board-links-"));
  directories.push(directory);
  const library = new AssetLibrary(directory),
    projects = new ProjectManager(directory, library);
  await Promise.all([library.load(), projects.load()]);
  const generate = vi.fn(async () => {
    throw new Error("Unexpected generation");
  });
  const tools = new ToolRunner(
    directory,
    { generate },
    undefined,
    undefined,
    library,
  );
  const store = new CanvasStore(projects, library, tools);
  const project = await projects.create("Game overview");
  const workspace = await store.workspace(project.id),
    sourceId = workspace.boards[0]!.id;
  const index = await store.changeBoards(project.id, {
    type: "create",
    name: "Fishing",
  });
  const targetId = index.boards.at(-1)!.id;
  const detail = await store.board(project.id, sourceId);
  const a = createTopic("Gameplay", { x: 0, y: 0 }),
    b = createTopic("UI", { x: 300, y: 0 });
  a.data.boardLink = b.data.boardLink = {
    projectId: project.id,
    boardId: targetId,
  };
  detail.board.nodes.push(a, b);
  detail.board.editorLayout.nodes[a.id] = a.position;
  detail.board.editorLayout.nodes[b.id] = b.position;
  detail.board.editorLayout.viewport = { x: -325, y: 176, zoom: 0.65 };
  await store.saveBoard(project.id, detail.board, detail.revision);
  await store.changeBoards(project.id, {
    type: "rename",
    boardId: targetId,
    name: "Fishing mechanics",
  });
  const after = await store.board(project.id, sourceId);
  expect(
    after.board.nodes
      .filter((n) => n.type === "topic")
      .map((n) => n.data.boardLink),
  ).toEqual([a.data.boardLink, a.data.boardLink]);
  expect(after.board.editorLayout.viewport).toEqual(
    detail.board.editorLayout.viewport,
  );
  after.board.nodes = after.board.nodes.filter((n) => n.id !== a.id);
  delete after.board.editorLayout.nodes[a.id];
  await store.saveBoard(project.id, after.board, after.revision);
  expect((await store.board(project.id, targetId)).board.id).toBe(targetId);
  await store.changeBoards(project.id, { type: "delete", boardId: targetId });
  const missing = await store.board(project.id, sourceId);
  expect(missing.board.nodes.find((n) => n.id === b.id)!.data).toMatchObject({
    boardLink: a.data.boardLink,
  });
  // Broken links remain readable/editable; unlinking does not require the target to exist.
  const topic = missing.board.nodes.find((n) => n.id === b.id)!;
  if (topic.type !== "topic") throw new Error("Expected topic");
  delete topic.data.boardLink;
  await store.saveBoard(project.id, missing.board, missing.revision);
  const source = JSON.parse(
    await readFile(
      path.join(project.workspacePath, `canvas/boards/${sourceId}.json`),
      "utf8",
    ),
  );
  expect(
    source.nodes.find((n: { id: string }) => n.id === b.id).data,
  ).not.toHaveProperty("boardLink");
  expect(generate).not.toHaveBeenCalled();
});
it("validates scoped IDs and preserves the source project in copied topic links", () => {
  const doc = createAssetCanvasDocument(),
    topic = createTopic("UI", { x: 0, y: 0 });
  topic.data.boardLink = { projectId: "source-project", boardId: "ui-board" };
  doc.nodes = [topic];
  doc.editorLayout.nodes[topic.id] = topic.position;
  expect(isAssetCanvasDocument(doc)).toBe(true);
  const clip = parseCanvasClipboard(
    JSON.stringify(createCanvasClipboard("source-project", doc.nodes, [])),
  )!;
  const copied = duplicateCanvasSelection(clip.nodes, [], { x: 100, y: 100 });
  expect(copied.nodes[0]!.data).toMatchObject({
    boardLink: topic.data.boardLink,
  });
  for (const boardId of ["", "../other", "x".repeat(101)]) {
    topic.data.boardLink.boardId = boardId;
    expect(isAssetCanvasDocument(doc)).toBe(false);
  }
});
