# Asset organization and production standards

Projects expose **Standards** beside Canvas, Code and Assets. The global Library uses folders, tags, favorites, saved smart filters, a media grid and a detail inspector. Search, media tabs and import stay in a compact toolbar. **Organize** opens folders/tags; **Filters** opens advanced filters. Both are closed initially so the gallery gets most of the space. Select a card to inspect it; use its checkbox for bulk editing. Narrow work areas open folders and details as separate drawers. Less frequent tools live under **More tools**.

## Organization and project decisions

Folders can nest; deleting a folder keeps assets and promotes its children. Assets can belong to several folders and tags. Search, media, origin, project references, tags, favorite, role, review and version series filters intersect. Tags support all/any matching. Smart collections store the filter and evaluate it against current assets.

Global organization lives in `<data directory>/library/organization.json`. Purpose, visual review, specification checks, integration evidence and chosen versions live in each project's `canvas/production.json`. Choose a project context to edit these decisions; a separate project-reference filter controls the grid. The same image can be a rejected reference in one project and an approved design in another. A canvas reference does not establish game integration. Verified integration requires evidence.

Batch editing changes tags, folders, purpose and review for selected assets. Changes require **Save changes**. Unsaved drafts recover locally with their original disk revision; a stale revision fails with HTTP 409 instead of overwriting another editor. **Reload from disk** discards the local draft after confirmation.

Version series can be created, renamed, manually joined or left. Regenerations from a single saved node share a series. Each project chooses its own current member. Choosing a new member keeps previous files, reviews, game code and canvas references. Select two images to compare at the same zoom and inspect their generation receipts.

## Standards

The internal sections cover art direction, UI and interaction, specifications, prompts/templates and acceptance. Each profile has a draft and immutable activated revisions. Saving a draft does not change generation; activation adds a revision. One activated profile is the project default.

**New standard** asks for a name before adding anything; Cancel makes no draft. Active names are unique (case-insensitive). The new item opens in the art-direction editor. Use the trash button beside an item, or **Delete standard**, and confirm removal. Unpublished drafts are removed. Published items move to **Removed standards**, where they can be restored; immutable revisions and past generation receipts stay intact. Removing the default clears it. New generation skips removed references and inherits the next valid group/project standard. Creation, removal and restoration require **Save changes**.

A node resolves its profile from project default, parent groups, child groups and finally its explicit selection. Local section overrides apply from outermost group to node. The generation preview resolves the saved prompt, media references, actual model parameters and direction without submitting a generation request. Generated asset metadata and jobs retain immutable receipts: original/effective prompt, activated profile content/revision, local overrides, template revision/content, actual parameters, reference IDs and image content hashes. Retrying a failed task reuses its prepared prompt and snapshot, with no second direction append.

Canvas, batch generation and Agent media tools share the resolver. Direction and output requirements are text constraints; only supported existing provider parameters enter provider requests. Specifications may require post-generation inspection. Specification checks, visual review and integration evidence are separate fields. The Agent reads activated direction again each turn and uses existing shared UI styles; editing a standard does not edit runtime code.

## Nested groups

Use **Groups and templates** to group a selected set, rename/recolor it, choose a parent, move nodes in/out, duplicate, collapse or ungroup. Drag the group header to move descendants. Groups have one parent and nodes one direct group; cycles are rejected. Collapsed groups proxy cross-boundary edges for display while keeping the actual nodes, connections and results. Ungroup promotes contents; **Delete group and contents** is a separate operation. Group operations participate in board undo/redo and conflict recovery.

Groups upgrade the board to format 2. Semantic group membership, hierarchy and standard references live in the board; positions/collapse remain in the editor layout. Before the first format 2 save, format 1 board and layout files are preserved as `<id>.v1-backup.json`. Existing format 1 files remain readable.

The board chooser and canvas action buttons share one wrapping toolbar; its panel opens below it. Narrow split panes move zoom controls above the bottom toolbar, even inside a wide desktop window.

Standalone Asset Canvas now uses the same create/switch/rename/order/delete board controls as game projects. Removing a board preserves authored documents, tables, media and submitted jobs; at least one board remains.

## Templates

Prompt variables have names, descriptions, defaults and required flags. Copy the resolved prompt or insert it as a text node. Workflow templates can be captured from nested groups. Before saving, the dependency dialog lists copied documents/tables, retained Library media and required external inputs. Old generated outputs and job history are omitted. Local Markdown images are retained in the Library and rebound to target-project paths. Media external inputs choose a Library asset; text inputs accept text. Referenced internal documents and tables receive new IDs on insertion.

Four built-in starting points are object orthographic views, character sheets, reference-to-3D and UI icons. Insertion creates independent node/group/edge IDs and does not execute generation. Templates are global; revisions preserve previous definitions and do not change inserted instances.

## API and validation

- `GET/PUT /library/organization`: global folders, tags, smart filters, series, asset metadata and templates, with `{value, revision}` envelopes.
- `GET/PUT /projects/:id/production`: project standards/reviews/chosen versions, with the same conflict protection.
- `POST /library/studio/query`: `{filter, projectId?}`.
- `POST /library/studio/batch`: asset IDs, revision, global organization or project review updates.
- `POST /projects/:id/studio/capture`: capture a saved group; inspect dependencies before saving it to organization.
- `POST /projects/:id/studio/insert`: template ID, target board, required values/bindings and board revision.
- `POST /projects/:id/canvas/boards/:board/nodes/:node/production-preview`: same saved-node resolver without generation.

JSON writes are serialized and atomically renamed. Schemas reject unexpected fields and invalid parent/reference relationships. `canvas_check` validates grouped boards and active standard references. The application maintains `canvas/schemas/production.schema.json` and updates its generated contract guidance while preserving custom AGENTS files.

Saving standards before first opening the canvas creates only `canvas/production.json`. The canvas can initialize this exact state after validating the production data, preserving that file. Any other existing canvas directory without `index.json` still requires recovery; authored boards/documents are never overwritten by initialization.

See [UI validation](studio-ui-validation.md) for screenshots, regression tests and manual checks.

Color search, visual deduplication, webpage collection and automatic AI tagging are not part of this version. Real model output quality and gameplay integration require configured providers and actual visual review; fixture tests do not establish those outcomes.
