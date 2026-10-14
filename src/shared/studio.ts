import { Type } from "typebox";
import { Check } from "typebox/value";
import type { AssetCanvasNode, AssetCanvasDocument } from "./contracts.js";

export const ASSET_ROLES = [
  "reference",
  "exploration",
  "design",
  "production",
] as const;
export const REVIEW_STATES = [
  "pending",
  "approved",
  "changes",
  "rejected",
] as const;
export const STANDARD_SECTIONS = [
  "art",
  "ui",
  "specifications",
  "acceptance",
] as const;
export type StandardSection = (typeof STANDARD_SECTIONS)[number];
export interface StandardContent {
  art: string;
  ui: string;
  specifications: string;
  acceptance: string;
  referenceIds: string[];
}
export type ProductionOverrides = Partial<StandardContent>;
export interface StandardRevision {
  revision: number;
  createdAt: string;
  content: StandardContent;
}
export interface ProductionStandard {
  id: string;
  name: string;
  draft: StandardContent;
  revisions: StandardRevision[];
  activeRevision?: number;
}
export interface AssetReview {
  specificationStatus?: "pending" | "pass" | "fail";
  specificationNotes?: string;
  roles: (typeof ASSET_ROLES)[number][];
  status: (typeof REVIEW_STATES)[number];
  notes: string;
  integration: "none" | "integrated" | "verified";
  evidence: string;
}
export interface ProjectProduction {
  version: 1;
  standards: ProductionStandard[];
  defaultStandardId?: string;
  reviews: Record<string, AssetReview>;
  selectedVersions: Record<string, string>;
}
export interface GenerationReceipt {
  references?: { assetId?: string; sha256?: string; mediaType: string }[];
  createdAt: string;
  originalPrompt: string;
  effectivePrompt: string;
  standard?: {
    id: string;
    name: string;
    revision: number;
    content: StandardContent;
  };
  template?: {
    id: string;
    revision: number;
    name?: string;
    prompt?: string;
    variables?: TemplateVariable[];
  };
  parameters: Record<string, unknown>;
  referenceIds: string[];
  overrides?: { scope: string; content: ProductionOverrides }[];
}
export interface AssetOrganization {
  tags: string[];
  folders: string[];
  favorite: boolean;
  description: string;
  sourceUrl: string;
  seriesId?: string;
  receipt?: GenerationReceipt;
}
export interface AssetFolder {
  id: string;
  name: string;
  parentId?: string;
}
export interface AssetTag {
  id: string;
  name: string;
}
export interface VersionSeries {
  id: string;
  name: string;
  sourceKey?: string;
}
export interface StudioFilter {
  query?: string;
  media?: string;
  projectId?: string;
  tags?: string[];
  tagMode?: "all" | "any";
  folderId?: string;
  favorite?: boolean;
  role?: string;
  status?: string;
  seriesId?: string;
  origin?: string;
  includeReferences?: boolean;
}
export interface SmartCollection {
  reviewProjectId?: string;
  id: string;
  name: string;
  filter: StudioFilter;
}
export interface TemplateVariable {
  name: string;
  description: string;
  defaultValue: string;
  required: boolean;
}
export interface TemplateInput {
  index?: number;
  name: string;
  nodeId: string;
  field: "images" | "references" | "source" | "promptSource";
  mediaType: "image" | "video" | "model" | "text";
}
export interface WorkflowTemplate {
  id: string;
  name: string;
  revision: number;
  kind: "prompt" | "workflow";
  prompt: string;
  variables: TemplateVariable[];
  inputs: TemplateInput[];
  board?: AssetCanvasDocument;
  documents: { id: string; title: string; markdown: string }[];
  tables: import("./canvas-table.js").CanvasTable[];
  mediaDependencies?: string[];
}
export interface StudioLibrary {
  version: 1;
  folders: AssetFolder[];
  tags: AssetTag[];
  smart: SmartCollection[];
  series: VersionSeries[];
  assets: Record<string, AssetOrganization>;
  templates: WorkflowTemplate[];
  templateHistory?: WorkflowTemplate[];
}
export interface StudioEnvelope<T> {
  value: T;
  revision: string;
}
export interface CanvasGroup {
  id: string;
  name: string;
  color: string;
  parentId?: string;
  standardId?: string;
  standardOverrides?: ProductionOverrides;
}
export interface CanvasGroupLayout {
  x: number;
  y: number;
  collapsed?: boolean;
}
export const emptyStandard = (): StandardContent => ({
  art: "",
  ui: "",
  specifications: "",
  acceptance: "",
  referenceIds: [],
});
export const emptyReview = (): AssetReview => ({
  roles: [],
  status: "pending",
  notes: "",
  integration: "none",
  evidence: "",
});
export const emptyAssetOrganization = (): AssetOrganization => ({
  tags: [],
  folders: [],
  favorite: false,
  description: "",
  sourceUrl: "",
});
export const emptyProduction = (): ProjectProduction => ({
  version: 1,
  standards: [],
  reviews: {},
  selectedVersions: {},
});
export const emptyStudioLibrary = (): StudioLibrary => ({
  version: 1,
  folders: [],
  tags: [],
  smart: [],
  series: [],
  assets: {},
  templates: [],
});

const id = Type.String({ pattern: "^[a-zA-Z0-9_-]{1,120}$" });
const text = Type.String({ maxLength: 32000 });
const name = Type.String({ minLength: 1, maxLength: 200 });
const ids = Type.Array(id, { uniqueItems: true, maxItems: 1000 });
const obj = (properties: Record<string, any>) =>
  Type.Object(properties, { additionalProperties: false });
const record = (schema: any) =>
  Type.Record(Type.String({ pattern: "^[a-zA-Z0-9_-]{1,120}$" }), schema, {
    maxProperties: 20000,
  });
const choice = (values: readonly string[]) =>
  Type.Union(values.map((v) => Type.Literal(v)));
export const STANDARD_CONTENT_SCHEMA = obj({
  art: text,
  ui: text,
  specifications: text,
  acceptance: text,
  referenceIds: ids,
});
export const STANDARD_OVERRIDES_SCHEMA = obj({
  art: Type.Optional(text),
  ui: Type.Optional(text),
  specifications: Type.Optional(text),
  acceptance: Type.Optional(text),
  referenceIds: Type.Optional(ids),
});
export const STANDARD_SCHEMA = obj({
  id,
  name,
  draft: STANDARD_CONTENT_SCHEMA,
  revisions: Type.Array(
    obj({
      revision: Type.Integer({ minimum: 1 }),
      createdAt: name,
      content: STANDARD_CONTENT_SCHEMA,
    }),
    { maxItems: 1000 },
  ),
  activeRevision: Type.Optional(Type.Integer({ minimum: 1 })),
});
export const PRODUCTION_SCHEMA = obj({
  version: Type.Literal(1),
  standards: Type.Array(STANDARD_SCHEMA, { maxItems: 200 }),
  defaultStandardId: Type.Optional(id),
  reviews: record(
    obj({
      specificationStatus: Type.Optional(choice(["pending", "pass", "fail"])),
      specificationNotes: Type.Optional(text),
      roles: Type.Array(choice(ASSET_ROLES), { uniqueItems: true }),
      status: choice(REVIEW_STATES),
      notes: text,
      integration: choice(["none", "integrated", "verified"]),
      evidence: text,
    }),
  ),
  selectedVersions: record(id),
});
const filter = obj({
  query: Type.Optional(text),
  media: Type.Optional(choice(["all", "image", "video", "audio", "model"])),
  projectId: Type.Optional(id),
  tags: Type.Optional(ids),
  tagMode: Type.Optional(choice(["all", "any"])),
  folderId: Type.Optional(id),
  favorite: Type.Optional(Type.Boolean()),
  role: Type.Optional(choice(ASSET_ROLES)),
  status: Type.Optional(choice(REVIEW_STATES)),
  seriesId: Type.Optional(id),
  origin: Type.Optional(
    choice([
      "all",
      "saved",
      "generated",
      "uploaded",
      "workspace",
      "builtin",
      "unknown",
    ]),
  ),
  includeReferences: Type.Optional(Type.Boolean()),
});
const receipt = obj({
  references: Type.Optional(
    Type.Array(
      obj({
        assetId: Type.Optional(id),
        sha256: Type.Optional(Type.String({ pattern: "^[a-f0-9]{64}$" })),
        mediaType: name,
      }),
    ),
  ),
  overrides: Type.Optional(
    Type.Array(obj({ scope: text, content: STANDARD_OVERRIDES_SCHEMA })),
  ),
  createdAt: name,
  originalPrompt: text,
  effectivePrompt: text,
  standard: Type.Optional(
    obj({
      id,
      name,
      revision: Type.Integer({ minimum: 1 }),
      content: STANDARD_CONTENT_SCHEMA,
    }),
  ),
  template: Type.Optional(
    obj({
      id,
      revision: Type.Integer({ minimum: 1 }),
      name: Type.Optional(name),
      prompt: Type.Optional(text),
      variables: Type.Optional(
        Type.Array(
          obj({
            name: text,
            description: text,
            defaultValue: text,
            required: Type.Boolean(),
          }),
        ),
      ),
    }),
  ),
  parameters: Type.Record(Type.String({ maxLength: 100 }), Type.Unknown()),
  referenceIds: ids,
});
export const STUDIO_LIBRARY_SCHEMA = obj({
  templateHistory: Type.Optional(
    Type.Array(Type.Unknown(), { maxItems: 2000 }),
  ),
  version: Type.Literal(1),
  folders: Type.Array(obj({ id, name, parentId: Type.Optional(id) }), {
    maxItems: 2000,
  }),
  tags: Type.Array(obj({ id, name }), { maxItems: 2000 }),
  smart: Type.Array(
    obj({ id, name, filter, reviewProjectId: Type.Optional(id) }),
    { maxItems: 200 },
  ),
  series: Type.Array(obj({ id, name, sourceKey: Type.Optional(text) }), {
    maxItems: 20000,
  }),
  assets: record(
    obj({
      tags: ids,
      folders: ids,
      favorite: Type.Boolean(),
      description: text,
      sourceUrl: text,
      seriesId: Type.Optional(id),
      receipt: Type.Optional(receipt),
    }),
  ),
  templates: Type.Array(
    obj({
      id,
      name,
      revision: Type.Integer({ minimum: 1 }),
      kind: choice(["prompt", "workflow"]),
      mediaDependencies: Type.Optional(ids),
      prompt: text,
      variables: Type.Array(
        obj({
          name: Type.String({ pattern: "^[A-Za-z][A-Za-z0-9_]{0,60}$" }),
          description: text,
          defaultValue: text,
          required: Type.Boolean(),
        }),
        { maxItems: 50 },
      ),
      inputs: Type.Array(
        obj({
          name,
          nodeId: id,
          field: choice(["images", "references", "source", "promptSource"]),
          mediaType: choice(["image", "video", "model", "text"]),
          index: Type.Optional(Type.Integer({ minimum: 0, maximum: 1000 })),
        }),
        { maxItems: 100 },
      ),
      board: Type.Optional(Type.Unknown()),
      documents: Type.Array(obj({ id, title: text, markdown: text }), {
        maxItems: 200,
      }),
      tables: Type.Array(Type.Unknown(), { maxItems: 200 }),
    }),
    { maxItems: 500 },
  ),
});
export const CANVAS_GROUP_SCHEMA = obj({
  id,
  name,
  color: Type.String({ pattern: "^#[0-9a-fA-F]{6}$" }),
  parentId: Type.Optional(id),
  standardId: Type.Optional(id),
  standardOverrides: Type.Optional(STANDARD_OVERRIDES_SCHEMA),
});
export const GROUP_LAYOUT_SCHEMA = Type.Record(
  Type.String({ pattern: "^[a-zA-Z0-9_-]{1,120}$" }),
  obj({
    x: Type.Number(),
    y: Type.Number(),
    collapsed: Type.Optional(Type.Boolean()),
  }),
);

export function validateHierarchy(
  items: { id: string; parentId?: string }[],
): void {
  const map = new Map(items.map((item) => [item.id, item]));
  if (map.size !== items.length) throw new Error("Duplicate IDs");
  for (const item of items) {
    const seen = new Set([item.id]);
    let parent = item.parentId;
    while (parent) {
      if (!map.has(parent) || seen.has(parent))
        throw new Error("Invalid or circular hierarchy");
      seen.add(parent);
      parent = map.get(parent)?.parentId;
    }
  }
}
export function validateProduction(
  value: unknown,
): asserts value is ProjectProduction {
  if (!Check(PRODUCTION_SCHEMA, value))
    throw new Error("Invalid project production data");
  const p = value as unknown as ProjectProduction;
  validateHierarchy(p.standards);
  if (
    p.defaultStandardId &&
    !p.standards.some((s) => s.id === p.defaultStandardId && s.activeRevision)
  )
    throw new Error("Default standard must be activated");
  for (const s of p.standards) {
    if (
      new Set(s.revisions.map((r) => r.revision)).size !== s.revisions.length ||
      (s.activeRevision &&
        !s.revisions.some((r) => r.revision === s.activeRevision))
    )
      throw new Error("Invalid standard revisions");
  }
  for (const review of Object.values(p.reviews))
    if (review.integration === "verified" && !review.evidence.trim())
      throw new Error("Verified integration requires evidence");
}
export function validateStudioLibrary(
  value: unknown,
): asserts value is StudioLibrary {
  if (!Check(STUDIO_LIBRARY_SCHEMA, value))
    throw new Error("Invalid library organization");
  const p = value as unknown as StudioLibrary;
  validateHierarchy(p.folders);
  if (p.templateHistory?.length) {
    for (let index = 0; index < p.templateHistory.length; index += 500) {
      const copy = {
        ...p,
        templateHistory: [],
        templates: p.templateHistory.slice(index, index + 500),
      };
      if (!Check(STUDIO_LIBRARY_SCHEMA, copy))
        throw new Error("Invalid template history");
    }
  }
  for (const items of [p.tags, p.smart, p.series, p.templates])
    validateHierarchy(items);
  for (const template of p.templates) {
    if (
      new Set(template.variables.map((v) => v.name)).size !==
        template.variables.length ||
      new Set(template.inputs.map((i) => i.name)).size !==
        template.inputs.length
    )
      throw new Error("Duplicate template variables or inputs");
    if (template.kind === "workflow" && !template.board)
      throw new Error("Workflow template requires a board");
  }
  for (const a of Object.values(p.assets))
    if (
      a.tags.some((id) => !p.tags.some((t) => t.id === id)) ||
      a.folders.some((id) => !p.folders.some((f) => f.id === id)) ||
      (a.seriesId && !p.series.some((s) => s.id === a.seriesId))
    )
      throw new Error("Unknown tag, folder or version series");
}
export function activeStandard(
  p: ProjectProduction,
  id = p.defaultStandardId,
): (StandardRevision & { id: string; name: string }) | undefined {
  const s = p.standards.find((s) => s.id === id),
    r = s?.revisions.find((r) => r.revision === s.activeRevision);
  return s && r ? { ...r, id: s.id, name: s.name } : undefined;
}
export function inheritedStandardId(
  p: ProjectProduction,
  board?: AssetCanvasDocument,
  node?: AssetCanvasNode,
): string | undefined {
  if (node?.standardId) return node.standardId;
  let group = board?.groups?.find((g) => g.id === node?.groupId);
  const seen = new Set<string>();
  while (group && !seen.has(group.id)) {
    seen.add(group.id);
    if (group.standardId) return group.standardId;
    group = board?.groups?.find((g) => g.id === group?.parentId);
  }
  return p.defaultStandardId;
}
export function resolveProduction(
  p: ProjectProduction,
  prompt: string,
  parameters: Record<string, unknown>,
  board?: AssetCanvasDocument,
  node?: AssetCanvasNode,
): GenerationReceipt {
  const s = activeStandard(p, inheritedStandardId(p, board, node));
  const overrides: { scope: string; content: ProductionOverrides }[] = [];
  let group = board?.groups?.find((g) => g.id === node?.groupId);
  const seen = new Set<string>();
  while (group && !seen.has(group.id)) {
    seen.add(group.id);
    if (group.standardOverrides)
      overrides.unshift({
        scope: group.name,
        content: structuredClone(group.standardOverrides),
      });
    group = board?.groups?.find((g) => g.id === group?.parentId);
  }
  if (node?.standardOverrides)
    overrides.push({
      scope: node.title ?? node.id,
      content: structuredClone(node.standardOverrides),
    });
  const content = Object.assign(
    emptyStandard(),
    s ? structuredClone(s.content) : {},
    ...overrides.map((o) => o.content),
  );
  const hasDirection = !!s || overrides.length > 0;
  return {
    createdAt: new Date().toISOString(),
    originalPrompt: prompt,
    effectivePrompt: [
      prompt,
      ...(hasDirection
        ? [
            "Production direction (preserve the requested subject and operation):",
            content.art,
            content.ui,
            content.specifications,
          ]
        : []),
    ]
      .filter(Boolean)
      .join("\n\n"),
    ...(s
      ? {
          standard: {
            id: s.id,
            name: s.name,
            revision: s.revision,
            content: structuredClone(s.content),
          },
        }
      : {}),
    ...(node?.template ? { template: { ...node.template } } : {}),
    ...(overrides.length ? { overrides } : {}),
    parameters: structuredClone(parameters),
    referenceIds: structuredClone(content.referenceIds),
  };
}
export function renderPrompt(
  template: WorkflowTemplate,
  values: Record<string, string>,
): string {
  const resolved = Object.fromEntries(
    template.variables.map((v) => {
      const text = values[v.name] ?? v.defaultValue;
      if (v.required && !text.trim())
        throw new Error(`Missing template variable: ${v.name}`);
      return [v.name, text];
    }),
  );
  return template.prompt.replace(
    /\{\{([A-Za-z][A-Za-z0-9_]*)\}\}/g,
    (_, name) => {
      if (!Object.hasOwn(resolved, name))
        throw new Error(`Unknown template variable: ${name}`);
      return resolved[name];
    },
  );
}
export function removeFolder(value: StudioLibrary, id: string): void {
  const f = value.folders.find((f) => f.id === id);
  if (!f) return;
  value.folders = value.folders
    .filter((f) => f.id !== id)
    .map((child) =>
      child.parentId === id ? { ...child, parentId: f.parentId } : child,
    );
  for (const a of Object.values(value.assets))
    a.folders = a.folders.filter((f) => f !== id);
  for (const smart of value.smart)
    if (smart.filter.folderId === id) delete smart.filter.folderId;
}
export function folderDescendants(
  folders: AssetFolder[],
  id: string,
): Set<string> {
  const result = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of folders)
      if (f.parentId && result.has(f.parentId) && !result.has(f.id)) {
        result.add(f.id);
        changed = true;
      }
  }
  return result;
}
export function matchesStudioFilter(
  asset: {
    id: string;
    name?: string;
    prompt?: string;
    mediaType: string;
    origin?: string;
    saved?: boolean;
    referenceOnly?: boolean;
    projects?: { id: string; name: string }[];
  },
  library: StudioLibrary,
  filter: StudioFilter,
  production?: ProjectProduction,
): boolean {
  const a = library.assets[asset.id] ?? emptyAssetOrganization(),
    review = production?.reviews[asset.id] ?? emptyReview();
  const q = filter.query?.trim().toLowerCase();
  const projectMatches =
    !filter.projectId ||
    (filter.projectId === "unassigned"
      ? !asset.projects?.length
      : !!asset.projects?.some((p) => p.id === filter.projectId));
  return (
    (!q ||
      [
        asset.name,
        asset.prompt,
        a.description,
        a.sourceUrl,
        ...a.tags.map((id) => library.tags.find((t) => t.id === id)?.name),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)) &&
    (!filter.media ||
      filter.media === "all" ||
      filter.media === asset.mediaType) &&
    (!filter.origin ||
      filter.origin === "all" ||
      (filter.origin === "saved"
        ? asset.saved !== false
        : filter.origin === asset.origin)) &&
    (filter.includeReferences !== false || !asset.referenceOnly) &&
    projectMatches &&
    (!filter.favorite || a.favorite) &&
    (!filter.folderId ||
      a.folders.some((f) =>
        folderDescendants(library.folders, filter.folderId!).has(f),
      )) &&
    (!filter.seriesId || filter.seriesId === a.seriesId) &&
    (!filter.tags?.length ||
      (filter.tagMode === "any"
        ? filter.tags.some((t) => a.tags.includes(t))
        : filter.tags.every((t) => a.tags.includes(t)))) &&
    (!filter.role || review.roles.includes(filter.role as any)) &&
    (!filter.status || review.status === filter.status)
  );
}
