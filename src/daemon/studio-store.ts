import { BUILTIN_WORKFLOWS } from "../shared/studio-templates.js";
import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import type { ProjectManager } from "./projects.js";
import type { AssetLibrary } from "./asset-library.js";
import { canvasPath, CanvasError } from "./canvas-files.js";
import { isAssetCanvasDocument } from "../shared/asset-canvas.js";
import { isCanvasTable } from "../shared/canvas-table.js";
import {
  matchesStudioFilter,
  emptyReview,
  type StudioFilter,
  type AssetReview,
  emptyProduction,
  emptyStudioLibrary,
  emptyAssetOrganization,
  resolveProduction,
  validateProduction,
  validateStudioLibrary,
  type StudioLibrary,
  type ProjectProduction,
  type StudioEnvelope,
  type GenerationReceipt,
} from "../shared/studio.js";

export class StudioStore {
  private queues = new Map<string, Promise<unknown>>();
  constructor(
    private directory: string,
    private projects: ProjectManager,
    private library: AssetLibrary,
  ) {}
  private async file(projectId?: string, create = false): Promise<string> {
    if (projectId) {
      const project = this.projects.get(projectId);
      if (!project) throw new CanvasError("Project not found", 404);
      return canvasPath(project.workspacePath, "production.json", create);
    }
    const dir = path.join(this.directory, "library");
    if (create) await mkdir(dir, { recursive: true });
    try {
      if ((await lstat(dir)).isSymbolicLink())
        throw new CanvasError("Library directory must not be a symbolic link");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    const file = path.join(dir, "organization.json");
    try {
      if ((await lstat(file)).isSymbolicLink())
        throw new CanvasError(
          "Library organization must not be a symbolic link",
        );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    return file;
  }
  async read<T extends StudioLibrary | ProjectProduction = StudioLibrary>(
    projectId?: string,
  ): Promise<StudioEnvelope<T>> {
    let text = "";
    try {
      text = await readFile(await this.file(projectId), "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    if (Buffer.byteLength(text) > 16 * 1024 * 1024)
      throw new CanvasError("Studio metadata is too large");
    const value = text
      ? JSON.parse(text)
      : projectId
        ? emptyProduction()
        : emptyStudioLibrary();
    if (projectId) validateProduction(value);
    else validateStudioLibrary(value);
    return {
      value: value as T,
      revision: createHash("sha256").update(text).digest("hex"),
    };
  }
  private serialize<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const next = (this.queues.get(key) ?? Promise.resolve())
      .catch(() => {})
      .then(operation);
    this.queues.set(key, next);
    void next
      .finally(() => {
        if (this.queues.get(key) === next) this.queues.delete(key);
      })
      .catch(() => {});
    return next;
  }
  async save<T extends StudioLibrary | ProjectProduction>(
    value: T,
    revision: string,
    projectId?: string,
  ): Promise<StudioEnvelope<T>> {
    value = structuredClone(value);
    return this.serialize(projectId ?? "library", async () => {
      const current = await this.read<T>(projectId);
      if (current.revision !== revision)
        throw new CanvasError(
          "Studio data changed. Reload before saving; your draft has not been overwritten.",
          409,
        );
      if (projectId) {
        validateProduction(value);
        const production = value as ProjectProduction,
          organization = (await this.read()).value;
        for (const [seriesId, assetId] of Object.entries(
          production.selectedVersions,
        ))
          if (
            production.selectedVersions[seriesId] !==
              (current.value as ProjectProduction).selectedVersions[seriesId] &&
            (!organization.series.some((s) => s.id === seriesId) ||
              organization.assets[assetId]?.seriesId !== seriesId ||
              !this.library.get(assetId))
          )
            throw new CanvasError("Selected version must belong to its series");
        for (const standard of production.standards)
          for (const assetId of standard.draft.referenceIds)
            if (this.library.get(assetId)?.mediaType !== "image")
              throw new CanvasError(
                "Standard references must identify existing library images",
              );
        for (const old of (current.value as ProjectProduction).standards) {
          const next = (value as ProjectProduction).standards.find(
            (s) => s.id === old.id,
          );
          if (
            old.revisions.length &&
            (!next ||
              old.revisions.some(
                (r) =>
                  JSON.stringify(
                    next.revisions.find((n) => n.revision === r.revision),
                  ) !== JSON.stringify(r),
              ))
          )
            throw new CanvasError("Activated standard revisions are immutable");
        }
      } else {
        validateStudioLibrary(value);
        const next = value as StudioLibrary,
          previous = current.value as StudioLibrary;
        if (
          JSON.stringify(next.templateHistory ?? []) !==
          JSON.stringify(previous.templateHistory ?? [])
        )
          throw new CanvasError("Template history is immutable");
        for (const old of previous.templates) {
          const updated = next.templates.find((t) => t.id === old.id);
          if (
            updated &&
            JSON.stringify(old) !== JSON.stringify(updated) &&
            updated.revision !== old.revision + 1
          )
            throw new CanvasError(
              "Increment the template revision before editing",
            );
          if (
            (!updated || updated.revision !== old.revision) &&
            !(next.templateHistory ?? []).some(
              (t) => t.id === old.id && t.revision === old.revision,
            )
          )
            (next.templateHistory ??= []).push(structuredClone(old));
        }
        for (const template of [
          ...next.templates,
          ...(next.templateHistory ?? []),
        ]) {
          if (template.board && !isAssetCanvasDocument(template.board))
            throw new CanvasError("Invalid template board");
          if (!template.tables.every(isCanvasTable))
            throw new CanvasError("Invalid template tables");
        }
        for (const [id, a] of Object.entries(
          (current.value as StudioLibrary).assets,
        ))
          if (
            a.receipt &&
            JSON.stringify((value as StudioLibrary).assets[id]?.receipt) !==
              JSON.stringify(a.receipt)
          )
            throw new CanvasError("Generation receipts are immutable");
      }
      return this.write(value, projectId);
    });
  }
  private async write<T extends StudioLibrary | ProjectProduction>(
    value: T,
    projectId?: string,
  ): Promise<StudioEnvelope<T>> {
    const file = await this.file(projectId, true),
      text = `${JSON.stringify(value, null, 2)}\n`;
    if (Buffer.byteLength(text) > 16 * 1024 * 1024)
      throw new CanvasError("Studio metadata is too large");
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, text, { flag: "wx" });
      await rename(temp, file);
    } finally {
      await rm(temp, { force: true });
    }
    return {
      value: structuredClone(value),
      revision: createHash("sha256").update(text).digest("hex"),
    };
  }
  async query(filter: StudioFilter, projectId?: string) {
    const organization = (await this.read()).value;
    const associations = await this.projects.libraryAssetAssociations(() => {});
    const production = projectId
      ? (await this.read<ProjectProduction>(projectId)).value
      : undefined;
    return this.library
      .list()
      .map((asset) => ({
        ...asset,
        projects: associations.get(asset.id)?.projects ?? [],
        referenceOnly:
          asset.purpose === "reference" &&
          !associations.get(asset.id)?.hasAssetUsage,
      }))
      .filter((asset) =>
        matchesStudioFilter(asset, organization, filter, production),
      )
      .map((asset) => ({
        ...asset,
        organization: organization.assets[asset.id] ?? emptyAssetOrganization(),
        ...(production
          ? {
              review: production.reviews[asset.id] ?? emptyReview(),
              current:
                !!organization.assets[asset.id]?.seriesId &&
                production.selectedVersions[
                  organization.assets[asset.id]!.seriesId!
                ] === asset.id,
            }
          : {}),
      }));
  }
  async batch(input: {
    assetIds: string[];
    revision: string;
    projectId?: string;
    addTags?: string[];
    removeTags?: string[];
    addFolders?: string[];
    removeFolders?: string[];
    favorite?: boolean;
    roles?: AssetReview["roles"];
    status?: AssetReview["status"];
  }) {
    if (
      !Array.isArray(input.assetIds) ||
      input.assetIds.length > 1000 ||
      !input.assetIds.length ||
      input.assetIds.some((id) => !this.library.get(id))
    )
      throw new CanvasError("Choose existing assets for batch editing");
    if (input.projectId) {
      if (
        input.addTags ||
        input.removeTags ||
        input.addFolders ||
        input.removeFolders ||
        input.favorite !== undefined
      )
        throw new CanvasError("Use the global endpoint for organization");
      const data = await this.read<ProjectProduction>(input.projectId);
      for (const id of input.assetIds) {
        const review = (data.value.reviews[id] ??= emptyReview());
        if (input.roles) review.roles = input.roles;
        if (input.status) review.status = input.status;
      }
      return this.save(data.value, input.revision, input.projectId);
    }
    if (input.roles || input.status)
      throw new CanvasError("Project context is required for review");
    const data = await this.read();
    for (const id of input.assetIds) {
      const a = (data.value.assets[id] ??= emptyAssetOrganization());
      a.tags = [...new Set([...a.tags, ...(input.addTags ?? [])])].filter(
        (id) => !input.removeTags?.includes(id),
      );
      a.folders = [
        ...new Set([...a.folders, ...(input.addFolders ?? [])]),
      ].filter((id) => !input.removeFolders?.includes(id));
      if (input.favorite !== undefined) a.favorite = input.favorite;
    }
    return this.save(data.value, input.revision);
  }
  async receipt(
    projectId: string | undefined,
    prompt: string,
    parameters: Record<string, unknown>,
    board?: import("../shared/contracts.js").AssetCanvasDocument,
    node?: import("../shared/contracts.js").AssetCanvasNode,
  ): Promise<GenerationReceipt> {
    const receipt = resolveProduction(
      projectId
        ? (await this.read<ProjectProduction>(projectId)).value
        : emptyProduction(),
      prompt,
      parameters,
      board,
      node,
    );
    if (node?.template) {
      const library = (await this.read()).value;
      const template = [
        ...library.templates,
        ...(library.templateHistory ?? []),
        ...BUILTIN_WORKFLOWS,
      ].find(
        (t) =>
          t.id === node.template!.id && t.revision === node.template!.revision,
      );
      if (template)
        receipt.template = {
          id: template.id,
          revision: template.revision,
          name: template.name,
          prompt: template.prompt,
          variables: structuredClone(template.variables),
        };
    }
    return receipt;
  }
  async record(
    assetIds: string[],
    receipt: GenerationReceipt,
    sourceKey?: string,
  ): Promise<void> {
    await this.serialize("library", async () => {
      const { value } = await this.read();
      let series = sourceKey
        ? value.series.find((s) => s.sourceKey === sourceKey)
        : undefined;
      if (sourceKey && !series) {
        series = {
          id: randomUUID(),
          name: this.library.get(assetIds[0])?.name ?? "Versions",
          sourceKey,
        };
        value.series.push(series);
      }
      for (const id of assetIds)
        if (this.library.get(id)) {
          const entry = (value.assets[id] ??= emptyAssetOrganization());
          entry.receipt ??= structuredClone(receipt);
          if (series) entry.seriesId = series.id;
        }
      await this.write(value);
    });
  }
}
