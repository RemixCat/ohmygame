import { TEST_GLB } from "./model3d-fixture.js";
import { mkdtemp, rm, readFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetLibrary } from "../src/daemon/asset-library.js";
import { ProjectManager } from "../src/daemon/projects.js";
import { StudioStore } from "../src/daemon/studio-store.js";
import { CanvasStore } from "../src/daemon/canvas-workspace.js";
import { ToolRunner } from "../src/daemon/tools.js";
import { createApp } from "../src/daemon/app.js";
import { ProjectWrites } from "../src/daemon/project-writes.js";
import {
  createAssetCanvasDocument,
  createAssetGenerationNode,
  isAssetCanvasDocument,
} from "../src/shared/asset-canvas.js";
import {
  createGroup,
  groupDescendants,
  moveGroup,
  ungroup,
  validateCanvasGroups,
  collapsedAncestor,
} from "../src/shared/canvas-groups.js";
import { mergeCanvasDocument } from "../src/shared/canvas-workspace.js";
import {
  BUILTIN_WORKFLOWS,
  captureWorkflow,
  duplicateBoardFragment,
  instantiateWorkflow,
} from "../src/shared/studio-templates.js";
import {
  emptyAssetOrganization,
  emptyProduction,
  emptyReview,
  emptyStandard,
  emptyStudioLibrary,
  matchesStudioFilter,
  removeFolder,
  resolveProduction,
  type ProjectProduction,
} from "../src/shared/studio.js";
import { checkCanvasWorkspace } from "../src/daemon/canvas-check.js";

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "ohmygame-studio-"));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const library = new AssetLibrary(directory),
    projects = new ProjectManager(directory, library);
  await library.load();
  await projects.load();
  const studio = new StudioStore(directory, projects, library);
  const generate = vi
    .fn()
    .mockResolvedValue({ bytes: Buffer.from("png"), mediaType: "image/png" });
  const generate3D = vi
    .fn()
    .mockResolvedValue({ bytes: TEST_GLB, mediaType: "model/gltf-binary" });
  const tools = new ToolRunner(
    directory,
    { generate },
    { generate: generate3D },
    undefined,
    library,
    undefined,
    undefined,
    studio,
  );
  await tools.load();
  cleanups.push(() => tools.close());
  const canvas = new CanvasStore(projects, library, tools, studio);
  cleanups.push(() => canvas.close());
  const project = await projects.create("Hero", "asset-canvas"),
    other = await projects.create("Other", "asset-canvas");
  const boardId = (await canvas.workspace(project.id)).boards[0]!.id;
  return {
    directory,
    library,
    projects,
    studio,
    generate,
    generate3D,
    tools,
    canvas,
    project,
    other,
    boardId,
  };
}
function grouped() {
  const b = createAssetCanvasDocument();
  const n = createAssetGenerationNode("image", { x: 100, y: 150 });
  n.data.prompt = "A fox";
  b.nodes.push(n);
  b.editorLayout.nodes[n.id] = { ...n.position };
  const root = createGroup(b, [n.id], "Root"),
    child = createGroup(b, [n.id], "Child", root);
  return { b, n, root, child };
}
async function standard(f: Awaited<ReturnType<typeof fixture>>) {
  const p = await f.studio.read<ProjectProduction>(f.project.id);
  const content = {
    ...emptyStandard(),
    art: "Copper and teal",
    specifications: "Full silhouette",
  };
  p.value.standards.push({
    id: "direction",
    name: "Hero style",
    draft: structuredClone(content),
    revisions: [{ revision: 1, createdAt: new Date().toISOString(), content }],
    activeRevision: 1,
  });
  p.value.defaultStandardId = "direction";
  return f.studio.save(p.value, p.revision, f.project.id);
}
async function wait(canvas: CanvasStore, projectId: string, id: string) {
  await expect
    .poll(
      async () =>
        (await canvas.jobs(projectId)).find((j) => j.id === id)?.status,
    )
    .not.toBe("running");
  return (await canvas.jobs(projectId)).find((j) => j.id === id)!;
}

describe("studio organization and persistence", () => {
  it("intersects filters, matches tag modes and promotes children without deleting assets", () => {
    const d = emptyStudioLibrary();
    d.folders = [
      { id: "parent", name: "Parent" },
      { id: "child", name: "Child", parentId: "parent" },
    ];
    d.tags = [
      { id: "a", name: "warm" },
      { id: "b", name: "hero" },
    ];
    d.assets.image = {
      ...emptyAssetOrganization(),
      folders: ["child"],
      tags: ["a"],
      favorite: true,
    };
    const asset = {
        id: "image",
        name: "Fox",
        mediaType: "image",
        projects: [{ id: "project", name: "Game" }],
      },
      p = emptyProduction();
    p.reviews.image = {
      ...emptyReview(),
      roles: ["reference"],
      status: "approved",
    };
    expect(
      matchesStudioFilter(
        asset,
        d,
        {
          folderId: "parent",
          favorite: true,
          role: "reference",
          status: "approved",
          query: "warm",
        },
        p,
      ),
    ).toBe(true);
    expect(
      matchesStudioFilter(asset, d, { tags: ["a", "b"], tagMode: "all" }),
    ).toBe(false);
    expect(
      matchesStudioFilter(asset, d, { tags: ["a", "b"], tagMode: "any" }),
    ).toBe(true);
    expect(matchesStudioFilter(asset, d, { projectId: "other" })).toBe(false);
    removeFolder(d, "parent");
    expect(d.folders[0]?.parentId).toBeUndefined();
    expect(d.assets.image?.folders).toEqual(["child"]);
  });
  it("persists organization and isolates per-project reviews and chosen versions with conflict protection", async () => {
    const f = await fixture(),
      a = await f.library.add("fox.png", Buffer.from("png")),
      b = await f.library.add("fox2.png", Buffer.from("png2"));
    const d = await f.studio.read();
    d.value.series.push({ id: "hero", name: "Hero" });
    for (const asset of [a, b])
      d.value.assets[asset.id] = {
        ...emptyAssetOrganization(),
        seriesId: "hero",
      };
    await f.studio.save(d.value, d.revision);
    const p = await f.studio.read<ProjectProduction>(f.project.id);
    p.value.reviews[a.id] = {
      ...emptyReview(),
      roles: ["design"],
      status: "approved",
    };
    p.value.selectedVersions.hero = a.id;
    await f.studio.save(p.value, p.revision, f.project.id);
    await expect(
      f.studio.save(p.value, p.revision, f.project.id),
    ).rejects.toMatchObject({ statusCode: 409 });
    const q = await f.studio.read<ProjectProduction>(f.other.id);
    q.value.reviews[a.id] = {
      ...emptyReview(),
      roles: ["reference"],
      status: "rejected",
    };
    q.value.selectedVersions.hero = b.id;
    await f.studio.save(q.value, q.revision, f.other.id);
    const reloaded = new StudioStore(f.directory, f.projects, f.library);
    expect(
      (await reloaded.read<ProjectProduction>(f.project.id)).value.reviews[a.id]
        ?.status,
    ).toBe("approved");
    expect(
      (await reloaded.read<ProjectProduction>(f.other.id)).value
        .selectedVersions.hero,
    ).toBe(b.id);
    const invalid = await reloaded.read<ProjectProduction>(f.other.id);
    invalid.value.selectedVersions.hero = "missing";
    await expect(
      reloaded.save(invalid.value, invalid.revision, f.other.id),
    ).rejects.toThrow("belong");
  });
  it("keeps activated standards and generation receipts immutable while drafts evolve", async () => {
    const f = await fixture(),
      p = await standard(f);
    p.value.standards[0]!.draft.art = "Changed draft";
    await f.studio.save(p.value, p.revision, f.project.id);
    expect(
      (await f.studio.receipt(f.project.id, "Fox", {})).effectivePrompt,
    ).toContain("Copper and teal");
    const next = await f.studio.read<ProjectProduction>(f.project.id);
    next.value.standards[0]!.revisions[0]!.content.art = "Rewrite history";
    await expect(
      f.studio.save(next.value, next.revision, f.project.id),
    ).rejects.toThrow("immutable");
    const a = await f.library.add("fox.png", Buffer.from("png"));
    await f.studio.record(
      [a.id],
      await f.studio.receipt(f.project.id, "Fox", {}),
      "node",
    );
    const d = await f.studio.read();
    d.value.assets[a.id]!.receipt!.effectivePrompt = "Rewrite history";
    await expect(f.studio.save(d.value, d.revision)).rejects.toThrow(
      "immutable",
    );
  });
});

describe("nested board groups", () => {
  it("moves every descendant, preserves collapse references, remaps copies and rejects cycles", () => {
    const { b, n, root, child } = grouped();
    moveGroup(b, root, 20, 30);
    expect(n.position).toEqual({ x: 120, y: 180 });
    expect(groupDescendants(b.groups!, root)).toEqual(new Set([root, child]));
    b.editorLayout.groups![root]!.collapsed = true;
    expect(collapsedAncestor(b, n)).toBe(root);
    const copy = duplicateBoardFragment(b);
    expect(copy.nodes[0]?.id).not.toBe(n.id);
    expect(copy.nodes[0]?.groupId).toBe(copy.groups?.[1]?.id);
    expect(isAssetCanvasDocument(copy)).toBe(true);
    b.groups![0]!.parentId = child;
    expect(() => validateCanvasGroups(b)).toThrow("circular");
    delete b.groups![0]!.parentId;
    ungroup(b, child);
    expect(n.groupId).toBe(root);
    ungroup(b, root);
    expect(n.groupId).toBeUndefined();
    expect(b.nodes).toHaveLength(1);
  });
  it("merges independent edits and reports group conflicts instead of dropping ownership", () => {
    const { b, n, child } = grouped(),
      local = structuredClone(b),
      remote = structuredClone(b);
    local.groups![1]!.name = "Local name";
    remote.nodes[0]!.standardId = "remote";
    const merged = mergeCanvasDocument(b, local, remote);
    expect(merged?.groups?.[1]?.name).toBe("Local name");
    expect(merged?.nodes[0]?.standardId).toBe("remote");
    expect(merged?.nodes[0]?.groupId).toBe(child);
    remote.groups![1]!.name = "Different name";
    expect(mergeCanvasDocument(b, local, remote)).toBeUndefined();
  });
  it("enables multiple asset boards and backs up format 1 before format 2 migration", async () => {
    const f = await fixture();
    expect(
      (
        await f.canvas.changeBoards(f.project.id, {
          type: "create",
          name: "Second",
        })
      ).boards,
    ).toHaveLength(2);
    const d = await f.canvas.board(f.project.id, f.boardId);
    createGroup(d.board, [], "Empty");
    await f.canvas.saveBoard(f.project.id, d.board, d.revision);
    expect(
      JSON.parse(
        await readFile(
          path.join(
            f.project.workspacePath,
            `canvas/boards/${f.boardId}.v1-backup.json`,
          ),
          "utf8",
        ),
      ).version,
    ).toBe(1);
    expect(
      (await f.canvas.board(f.project.id, f.boardId)).board.groups,
    ).toHaveLength(1);
    expect((await checkCanvasWorkspace(f.project.workspacePath)).ok).toBe(true);
    for (const directory of ["boards", "editor"]) {
      const base = path.join(
        f.project.workspacePath,
        "canvas",
        directory,
        f.boardId,
      );
      await copyFile(`${base}.v1-backup.json`, `${base}.json`);
    }
    const restored = await f.canvas.board(f.project.id, f.boardId);
    expect(restored.board.version).toBe(1);
    expect(restored.board.groups ?? []).toHaveLength(0);
    expect((await checkCanvasWorkspace(f.project.workspacePath)).ok).toBe(true);
  });
});

describe("production generation and workflow templates", () => {
  it("resolves nearest group / node direction and snapshots rather than mutating source", () => {
    const { b, n, root, child } = grouped(),
      p = emptyProduction();
    p.standards = ["project", "parent", "child", "node"].map((id) => ({
      id,
      name: id,
      draft: emptyStandard(),
      activeRevision: 1,
      revisions: [
        {
          revision: 1,
          createdAt: "now",
          content: { ...emptyStandard(), art: id },
        },
      ],
    }));
    p.defaultStandardId = "project";
    b.groups![0]!.standardId = "parent";
    b.groups![1]!.standardId = "child";
    expect(resolveProduction(p, "Fox", {}, b, n).standard?.id).toBe("child");
    n.standardId = "node";
    const receipt = resolveProduction(p, "Fox", {}, b, n);
    expect(receipt.standard?.id).toBe("node");
    p.standards[3]!.revisions[0]!.content.art = "Changed";
    expect(receipt.standard?.content.art).toBe("node");
  });
  it("previews without generation, retries with one standard application and automatically groups versions", async () => {
    const f = await fixture();
    await standard(f);
    const d = await f.canvas.board(f.project.id, f.boardId),
      n = createAssetGenerationNode("image", { x: 96, y: 96 });
    n.data.prompt = "Fox";
    d.board.nodes.push(n);
    d.board.editorLayout.nodes[n.id] = n.position;
    await f.canvas.saveBoard(f.project.id, d.board, d.revision);
    const preview = await f.canvas.generateNode(
      f.project.id,
      f.boardId,
      n.id,
      true,
    );
    expect(preview.production?.effectivePrompt).toContain("Copper and teal");
    expect(f.generate).not.toHaveBeenCalled();
    expect(await f.canvas.jobs(f.project.id)).toHaveLength(0);
    f.generate.mockRejectedValueOnce(new Error("Temporary outage"));
    const first = await f.canvas.generateNode(f.project.id, f.boardId, n.id);
    expect((await wait(f.canvas, f.project.id, first.id)).status).toBe(
      "failed",
    );
    const p = await f.studio.read<ProjectProduction>(f.project.id);
    p.value.standards[0]!.draft.art = "Different";
    p.value.standards[0]!.revisions.push({
      revision: 2,
      createdAt: "later",
      content: { ...emptyStandard(), art: "Different" },
    });
    p.value.standards[0]!.activeRevision = 2;
    await f.studio.save(p.value, p.revision, f.project.id);
    const retry = await f.canvas.retry(f.project.id, first.id);
    const done = await wait(f.canvas, f.project.id, retry.id);
    expect(done.status).toBe("succeeded");
    expect(
      f.generate.mock.calls[1]![0].prompt.match(/Copper and teal/g),
    ).toHaveLength(1);
    expect(f.generate.mock.calls[1]![0].prompt).not.toContain("Different");
    const again = await f.canvas.generateNode(f.project.id, f.boardId, n.id);
    await wait(f.canvas, f.project.id, again.id);
    const library = (await f.studio.read()).value;
    const receipts = Object.values(library.assets);
    expect(new Set(receipts.map((a) => a.seriesId)).size).toBe(1);
    expect(receipts).toHaveLength(2);
    expect(receipts[0]?.receipt?.standard?.revision).toBe(1);
    expect(receipts[1]?.receipt?.standard?.revision).toBe(2);
  });
  it("applies active reference images to Agent size requests and records animation direction", async () => {
    const f = await fixture();
    await standard(f);
    const bytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=",
      "base64",
    );
    const reference = await f.library.add("fox.png", bytes);
    const data = await f.studio.read<ProjectProduction>(f.project.id);
    data.value.standards[0]!.draft.referenceIds = [reference.id];
    data.value.standards[0]!.revisions.push({
      revision: 2,
      createdAt: "later",
      content: structuredClone(data.value.standards[0]!.draft),
    });
    data.value.standards[0]!.activeRevision = 2;
    await f.studio.save(data.value, data.revision, f.project.id);
    await f.tools.run(
      "generate-image",
      { prompt: "Fox", size: "1536x1024" },
      undefined,
      f.project.id,
    );
    expect(f.generate.mock.calls[0]![0]).toMatchObject({
      resolution: "1K",
      aspectRatio: "3:2",
      images: [{ data: bytes.toString("base64") }],
    });
    const imageModel = await f.tools.prepare(
      "image-to-3d",
      {
        operation: "image",
        images: [{ mediaType: "image/png", data: bytes.toString("base64") }],
        prompt: undefined,
      },
      f.project.id,
    );
    expect(imageModel).not.toHaveProperty("prompt", expect.any(String));
    expect(f.tools.productionFor(imageModel)?.effectivePrompt).toBe("");
    const textModel = await f.tools.prepare(
      "image-to-3d",
      { operation: "text", images: [], prompt: "Fox" },
      f.project.id,
    );
    expect(textModel).toHaveProperty("images", []);
    expect(textModel).toHaveProperty(
      "prompt",
      expect.stringContaining("Copper and teal"),
    );
    const animation = await f.tools.prepare(
      "animate-3d",
      { assetId: reference.id, actionIds: ["walk"] },
      f.project.id,
    );
    expect(f.tools.productionFor(animation)?.standard?.revision).toBe(2);
  });
  it("carries a reviewed character candidate through three views and 3D without inferring game integration", async () => {
    const f = await fixture();
    await standard(f);
    const bytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=",
      "base64",
    );
    f.generate.mockResolvedValue({ bytes, mediaType: "image/png" });
    const d = await f.canvas.board(f.project.id, f.boardId);
    const node = createAssetGenerationNode("image", { x: 96, y: 96 });
    node.data.prompt = "Copper fox candidate";
    d.board.nodes.push(node);
    d.board.editorLayout.nodes[node.id] = node.position;
    await f.canvas.saveBoard(f.project.id, d.board, d.revision);
    const candidateJob = await f.canvas.generateNode(
      f.project.id,
      f.boardId,
      node.id,
    );
    expect((await wait(f.canvas, f.project.id, candidateJob.id)).status).toBe(
      "succeeded",
    );
    const candidateId = f.library.list()[0]!.id;
    const seriesId = (await f.studio.read()).value.assets[candidateId]!
      .seriesId!;
    const p = await f.studio.read<ProjectProduction>(f.project.id);
    p.value.reviews[candidateId] = {
      ...emptyReview(),
      roles: ["design"],
      status: "approved",
    };
    p.value.selectedVersions[seriesId] = candidateId;
    await f.studio.save(p.value, p.revision, f.project.id);
    const target = await f.canvas.board(f.project.id, f.boardId);
    await f.canvas.insertTemplate(
      f.project.id,
      f.boardId,
      BUILTIN_WORKFLOWS[0]!,
      { subject: "Copper fox" },
      {},
      target.revision,
    );
    const inserted = await f.canvas.board(f.project.id, f.boardId);
    for (const view of inserted.board.nodes.filter(
      (n) => n.id !== node.id && n.type === "image",
    )) {
      if (view.type !== "image") continue;
      view.data.images.push({ type: "library", assetId: candidateId });
    }
    await f.canvas.saveBoard(f.project.id, inserted.board, inserted.revision);
    const viewIds = inserted.board.nodes
      .filter((n) => n.id !== node.id && n.type === "image")
      .map((n) => n.id);
    expect(viewIds).toHaveLength(3);
    for (const id of viewIds) {
      const job = await f.canvas.generateNode(f.project.id, f.boardId, id);
      expect((await wait(f.canvas, f.project.id, job.id)).status).toBe(
        "succeeded",
      );
    }
    const result = await f.tools.run(
      "image-to-3d",
      {
        images: [{ mediaType: "image/png", data: bytes.toString("base64") }],
        targetPolycount: 8000,
      },
      undefined,
      f.project.id,
    );
    expect(f.generate3D).toHaveBeenCalledOnce();
    const modelId = result.files[0]!.assetId!;
    expect(
      (await f.studio.read()).value.assets[modelId]?.receipt?.standard
        ?.revision,
    ).toBe(1);
    expect(
      (await f.studio.read<ProjectProduction>(f.project.id)).value.reviews[
        modelId
      ]?.integration ?? "none",
    ).toBe("none");
    expect((await checkCanvasWorkspace(f.project.workspacePath)).ok).toBe(true);
  });
  it("captures outside inputs, strips old results and clones template instances without execution", async () => {
    const { b, n, child } = grouped();
    if (n.type !== "image") throw new Error();
    n.data.assetId = "old";
    n.data.images.push({ type: "node", nodeId: "outside" });
    const template = captureWorkflow(b, child, "Fox variants");
    expect(template.inputs).toHaveLength(1);
    expect(template.board?.nodes[0]?.data).not.toHaveProperty("assetId");
    expect(() => instantiateWorkflow(template, {}, {})).toThrow(
      "Missing input",
    );
    const instance = instantiateWorkflow(
      template,
      {},
      { input_1: "reference" },
    );
    expect(instance.nodes[0]?.id).not.toBe(n.id);
    expect(instance.nodes[0]?.data).toHaveProperty("images", [
      { type: "library", assetId: "reference" },
    ]);
    for (const builtin of BUILTIN_WORKFLOWS)
      expect(
        isAssetCanvasDocument(
          instantiateWorkflow(
            builtin,
            { subject: "Fox" },
            { reference: "image" },
          ),
        ),
      ).toBe(true);
    const f = await fixture();
    const d = await f.canvas.board(f.project.id, f.boardId);
    const result = await f.canvas.insertTemplate(
      f.project.id,
      f.boardId,
      BUILTIN_WORKFLOWS[0]!,
      { subject: "Fox" },
      {},
      d.revision,
    );
    expect(result.board.nodes).toHaveLength(3);
    expect(f.generate).not.toHaveBeenCalled();
    expect(await f.canvas.jobs(f.project.id)).toHaveLength(0);
    expect((await checkCanvasWorkspace(f.project.workspacePath)).ok).toBe(true);
  });
  it("copies authored documents and tables across projects and keeps immutable template revisions", async () => {
    const f = await fixture(),
      doc = await f.canvas.createDocument(f.project.id, "Brief"),
      table = await f.canvas.createTable(f.project.id, "Stats");
    const reference = await f.library.add("reference.png", Buffer.from("png"));
    await f.canvas.insertAsset(f.project.id, doc.document.id, reference.id);
    const currentDoc = (await f.canvas.read(f.project.id, doc.document.id))!;
    doc.document.markdown = "A copper fox" + currentDoc.document.markdown;
    doc.revision = currentDoc.revision;
    await f.canvas.save(
      f.project.id,
      doc.document,
      doc.revision,
      doc.document.id,
    );
    const d = await f.canvas.board(f.project.id, f.boardId);
    d.board.nodes = [
      {
        id: "doc",
        type: "document",
        position: { x: 96, y: 96 },
        data: { documentId: doc.document.id },
      },
      {
        id: "table",
        type: "table",
        position: { x: 650, y: 96 },
        data: { tableId: table.table.id },
      },
    ];
    d.board.editorLayout.nodes = Object.fromEntries(
      d.board.nodes.map((n) => [n.id, n.position]),
    );
    const group = createGroup(d.board, ["doc", "table"], "Process");
    await f.canvas.saveBoard(f.project.id, d.board, d.revision);
    const template = await f.canvas.captureTemplate(
        f.project.id,
        f.boardId,
        group,
        "Shared",
      ),
      library = await f.studio.read();
    library.value.templates.push(template);
    const saved = await f.studio.save(library.value, library.revision);
    const edit = structuredClone(saved);
    edit.value.templates[0]!.name = "Updated";
    edit.value.templates[0]!.revision++;
    const revised = await f.studio.save(edit.value, edit.revision);
    expect(revised.value.templateHistory?.[0]?.name).toBe("Shared");
    const otherBoard = (await f.canvas.workspace(f.other.id)).boards[0]!.id,
      target = await f.canvas.board(f.other.id, otherBoard);
    await f.canvas.insertTemplate(
      f.other.id,
      otherBoard,
      template,
      {},
      {},
      target.revision,
    );
    const w = await f.canvas.workspace(f.other.id);
    expect(w.documents[0]?.id).not.toBe(doc.document.id);
    expect(w.documents[0]?.markdown).toContain("A copper fox");
    expect(w.documents[0]?.markdown).toContain("../../assets/");
    expect(w.assets).toHaveLength(1);
    expect(w.tables?.[0]?.id).not.toBe(table.table.id);
    expect((await checkCanvasWorkspace(f.other.workspacePath)).ok).toBe(true);
  });
  it("batches global tags and independent project reviews with query context and conflicts", async () => {
    const f = await fixture();
    const asset = await f.library.add("fox.png", Buffer.from("png"));
    const data = await f.studio.read();
    data.value.tags.push({ id: "copper", name: "Copper" });
    data.value.smart.push({
      id: "approved",
      name: "Approved",
      reviewProjectId: f.project.id,
      filter: { status: "approved" },
    });
    const saved = await f.studio.save(data.value, data.revision);
    await f.studio.batch({
      assetIds: [asset.id],
      revision: saved.revision,
      addTags: ["copper"],
      favorite: true,
    });
    await expect(
      f.studio.batch({
        assetIds: [asset.id],
        revision: saved.revision,
        favorite: false,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    const first = await f.studio.read<ProjectProduction>(f.project.id);
    await f.studio.batch({
      assetIds: [asset.id],
      revision: first.revision,
      projectId: f.project.id,
      roles: ["design"],
      status: "approved",
    });
    const second = await f.studio.read<ProjectProduction>(f.other.id);
    await f.studio.batch({
      assetIds: [asset.id],
      revision: second.revision,
      projectId: f.other.id,
      roles: ["reference"],
      status: "rejected",
    });
    expect(
      await f.studio.query(
        { status: "approved", tags: ["copper"], favorite: true },
        f.project.id,
      ),
    ).toHaveLength(1);
    expect(
      await f.studio.query({ status: "approved" }, f.other.id),
    ).toHaveLength(0);
    expect(await f.studio.query({ projectId: f.other.id })).toHaveLength(0);
    expect((await f.studio.read()).value.smart[0]?.reviewProjectId).toBe(
      f.project.id,
    );
  });
  it("protects production saves and bulk reviews across workspace restore boundaries", async () => {
    const f = await fixture();
    const asset = await f.library.add("fox.png", Buffer.from("png"));
    let writes: ProjectWrites | undefined;
    const initialize = ProjectWrites.prototype.initialize;
    const spy = vi
      .spyOn(ProjectWrites.prototype, "initialize")
      .mockImplementation(function (this: ProjectWrites, id, version) {
        writes = this;
        initialize.call(this, id, version);
      });
    const app = createApp({ dataDirectory: f.directory });
    cleanups.push(() => app.close());
    let production: { value: ProjectProduction; revision: string };
    try {
      production = (
        await app.inject({
          method: "GET",
          url: `/projects/${f.project.id}/production`,
        })
      ).json();
    } finally {
      spy.mockRestore();
    }
    expect(writes).toBeDefined();
    const version = writes!.changed(f.project.id);
    const payload = {
      assetIds: [asset.id],
      revision: production!.revision,
      projectId: f.project.id,
      status: "approved",
    };
    const staleSave = await app.inject({
      method: "PUT",
      url: `/projects/${f.project.id}/production`,
      headers: { "x-workspace-version": "0" },
      payload: production!,
    });
    expect(staleSave.statusCode).toBe(409);
    expect(staleSave.json().code).toBe("workspace_stale");
    const staleBatch = await app.inject({
      method: "POST",
      url: "/library/studio/batch",
      headers: { "x-workspace-version": "0" },
      payload,
    });
    expect(staleBatch.statusCode).toBe(409);
    expect(staleBatch.json().code).toBe("workspace_stale");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const lock = writes!.exclusive(f.project.id, () => gate);
    try {
      const busy = await app.inject({
        method: "POST",
        url: "/library/studio/batch",
        headers: { "x-workspace-version": version },
        payload,
      });
      expect(busy.statusCode).toBe(409);
      expect(busy.json().code).toBe("workspace_busy");
    } finally {
      release();
      await lock;
    }
    const saved = await app.inject({
      method: "POST",
      url: "/library/studio/batch",
      headers: { "x-workspace-version": version },
      payload,
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().value.reviews[asset.id].status).toBe("approved");
  });
  it("keeps outside image inputs in their original slots when instantiating templates", () => {
    const { b, n, child } = grouped();
    if (n.type !== "image") throw new Error();
    n.data.images = [
      { type: "node", nodeId: "front" },
      { type: "library", assetId: "side" },
      { type: "node", nodeId: "back" },
    ];
    const template = captureWorkflow(b, child, "Views");
    expect(template.inputs.map((i) => i.index)).toEqual([0, 2]);
    const instance = instantiateWorkflow(
      template,
      {},
      { input_1: "bound-front", input_2: "bound-back" },
    );
    expect(instance.nodes[0]!.data).toHaveProperty("images", [
      { type: "library", assetId: "bound-front" },
      { type: "library", assetId: "side" },
      { type: "library", assetId: "bound-back" },
    ]);
  });
  it("serves organization routes with revision conflicts and bad-input validation", async () => {
    const f = await fixture(),
      app = createApp({ dataDirectory: f.directory });
    cleanups.push(() => app.close());
    const d = (await app.inject("/library/organization")).json();
    d.value.folders.push({ id: "f", name: "Characters" });
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/library/organization",
          payload: d,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/library/organization",
          payload: d,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/library/organization",
          payload: {},
        })
      ).statusCode,
    ).toBe(400);
  });
});
