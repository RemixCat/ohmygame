# SpriteCook and local 2D tools

[中文](spritecook.zh-CN.md)

**Status: experimental implementation on `feat/spritecook-2d`.** This branch
contains a key-only provider connection, public REST operation coverage, local
slicing/animation/9-slice tools, Library/canvas entry points and agent tools.
The target integration branch remains `RemixCat/ohmygame:studio`.

Public contract tests and an isolated browser workflow use simulated provider
responses. No real SpriteCook key or paid generation was used for acceptance.
Do not equate that verification with live generation quality or every engine
version. Keep the feature PR in draft until live-provider acceptance is recorded.

## Run and connect

```bash
git clone --branch feat/spritecook-2d https://github.com/RemixCat/ohmygame.git
cd ohmygame
bun install --frozen-lockfile
bun run start:desktop
```

Use **Settings → Providers & Models → Images → SpriteCook** to enter your key.
Use **Check connection** to check the live catalogs. `generate` and `read_assets`
scopes are needed; `read_credits` is optional for balance display. No model key
is required to use local editing/export. The existing setup and troubleshooting
instructions in [CONTRIBUTING.md](../CONTRIBUTING.md) still apply.

Open **2D asset workbench** from the canvas, Library toolbar, or SpriteCook
settings. Choose an existing image or upload a PNG/JPEG/WebP/GIF. Use a sprite
sheet for frame editing; animated previews are not decoded into a timeline.
Source media is retained, and derivatives are saved as new Library assets.

![Local 2D workbench with a slice guide and nine-slice preview](assets/sprite-workbench.png)

The screenshot uses deterministic test artwork, not an AI-generation quality sample.

## Intended user workflow

The fixed **SpriteCook** provider card lives under **Settings → Providers & Models →
Images**. The connection needs an API key; its default address is
`https://api.spritecook.ai`. Animation and slicing remain distinct operations,
not extra parameters hidden inside ordinary image generation.

Available workbench operations:

| Operation           | Inputs                                                                                  | Results                                                   |
| ------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Sprite / UI art     | Prompt, reference, pixel or detailed mode, theme, palette                               | Local image assets with generation metadata               |
| 2D sprite animation | Existing image, motion prompt, supported model and frame count, cleanup options         | Native animation preview, sprite sheet and frame metadata |
| Automatic slicing   | Transparent component sheet, detection threshold, minimum area, padding, merge distance | Reviewable rectangles and separate local images           |
| Tileset             | Terrain prompt, perspective, layout, supported tile size, palette                       | Local tile atlas and layout metadata                      |

Open the workbench with a selected canvas image, or choose any saved Library image.
It is not necessary to regenerate the image with SpriteCook. The service imports
local source bytes before operations requiring provider-owned IDs. Completed
outputs can be added as ordinary canvas asset nodes. This version does not add
new serialized generation-node types or automatically execute graph connections.
Existing canvas file formats remain unchanged.

## Public API evidence

Reviewed on **2026-10-18**. Treat the live catalog and actual responses as the
source of truth; model availability and pricing can change.

- [API reference](https://www.spritecook.ai/api-docs)
- [OpenAPI specification](https://www.spritecook.ai/openapi.json)
- [UI Kit Builder](https://www.spritecook.ai/docs/ui-kit)
- [Frame animation guide](https://www.spritecook.ai/docs/guide-frame-animation)

The OpenAPI specification contains routes not listed in the short API overview:

| Purpose                               | Public routes                                                                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Model catalog and credits             | `GET /v1/api/models`, `GET /v1/api/credits`                                                                                                                        |
| Source import and metadata            | `POST /v1/api/assets/import`, `GET /v1/api/assets/{asset_id}`                                                                                                      |
| Image generation                      | `POST /v1/api/generate`                                                                                                                                            |
| Animation                             | `POST /v1/api/animate`                                                                                                                                             |
| Guided character creation and actions | `GET /v1/api/character-workflows`, `POST /v1/api/characters`, `POST /v1/api/characters/{character_id}/animations`, `GET /v1/api/character-animation-runs/{run_id}` |
| Automatic component slicing           | `POST /v1/api/assets/{asset_id}/auto-slice`                                                                                                                        |
| Tilesets                              | `GET /v1/api/tilesets/options`, `POST /v1/api/tilesets`                                                                                                            |
| Background and edge cleanup           | `POST /v1/api/remove-background`, `PUT /v1/api/assets/{asset_id}/alpha-cutoff`                                                                                     |
| Job lifecycle                         | `GET /v1/api/jobs/{job_id}`, `POST /v1/api/jobs/{job_id}/cancel`                                                                                                   |

### Boundaries to preserve

- The website's full UI Kit Builder is not exposed as a complete public API in
  the reviewed specification. Do not promise automatic button-state grouping,
  9-slice editing or Unity/Godot package export through these routes.
- The website's per-frame references and selective frame regeneration are not
  parameters of the reviewed public `ApiAnimateRequest` schema.
- Automatic slicing detects connected regions of visible pixels. It is not
  semantic extraction of overlapping controls from an arbitrary screenshot.
  Keep the source and let users inspect/correct rectangles before export.
- Animation frame-count rules and source-size limits depend on the model.
  Validate them before submission. Requested image dimensions can be hints;
  inspect actual output instead of recording the request as the result.
- Cutting animation frames by visible bounds alone can split body parts or
  change their anchors. Preserve frame canvas dimensions and alignment; do not
  treat automatic component slicing as a universal animation slicer.

## Local editing and export

Nine-slice is deterministic image rendering, not an AI capability. Four corners
retain their size, edges stretch on one axis, and the center stretches on both.
Drag pink guides or enter border pixels. Each component can have its own borders;
**Apply these borders to all frames** shares the selected border values.

- Draw or edit slice rectangles; grid slicing supports rows, columns, gaps and
  margins and rejects grids that silently discard pixels.
- Set component family and interaction state. Each state within a named family
  must be unique. Naming/grouping is manual; there is no AI semantic UI parser.
- Reorder frames, set FPS/loop and a shared normalized anchor, preview with zoom,
  nearest-neighbor sampling or a previous-frame overlay, and undo/redo edits.
- Animation-sheet metadata initializes frames only when it fits the actual image.
  Incorrect provider dimensions/counts produce an error instead of fake success.
- Save editing settings, save exact PNG slices to Library, or export the ZIP.
  Sources stay intact. Limits are 16 megapixels per source, 256 frames, and
  an 8192-pixel / 18-megapixel packed atlas.

ZIP exports contain `source.png`, separate `frames/*.png`, `manifest.json`, a
packed PNG/TexturePacker-style JSON atlas with one-pixel extrusion, a Unity Editor
importer and a Godot 4 EditorScript. The manifest uses **top-left pixel coordinates**
and a top-left normalized pivot. The Unity helper converts rectangle Y, pivot Y
and border order. Unity requires 2022.3+ and the 2D Sprite package. Install its Editor helper only
once per project; do not copy a second helper with each asset set.
The Godot helper creates SpriteFrames, StyleBoxTexture assets,
and Button themes for named normal/hover/pressed/disabled state families.
See the ZIP's `README.txt` for import steps. Helpers do not build a complete
interactive game UI or prove that its gameplay works.

## Tasks, recovery and agent access

The fixed API address is `https://api.spritecook.ai`. Operations use asynchronous
submission/polling; sync endpoint variants provide the same operations and are
not a separate workbench mode. Catalog and source import routes are also exposed.

The daemon stores the key separately in `spritecook-key.json` with private file
permissions; read routes return connection state, never the key. Durable request
parameters, remote IDs, native media references and results live in
`spritecook-jobs.json`. Local editing settings live in `sprite-recipes.json` in
the application data directory. These files are user data and must not be committed.

Known jobs resume polling after restart. Downloads retain PNG/JPEG/WebP/GIF
signatures and metadata without relabeling extensions. Download failure keeps the
remote ID and can be resumed without another generation. Ambiguous submission
is marked uncertain: find the existing task in the provider dashboard and attach
its ID. There is no automatic resubmission of paid work. Cancellation is marked
complete only when confirmed; the public API has no guided-run cancellation route.
Partial character batches retain successful outputs; select only failed action
IDs before manually submitting a new batch.

Provider-reported credit balances are displayed when the key permits it. There
is no fabricated per-request price estimate; account/model pricing is controlled
by SpriteCook. Never forward API Authorization to result-download hosts.

Agent tools `spritecook` and `sprite_tools` expose the same provider and local
operations. The former returns durable tasks; the latter can list images, edit
recipes, cut, export or copy selected assets into the current project's
`assets/generated/`. Copying an asset is not engine integration: the agent must
still use it in the actual game and verify the affected behavior.

## Acceptance and remaining verification

- Validate good and malformed job, animation, slicing and metadata responses.
  Reject missing files, inconsistent dimensions and incomplete outputs clearly.
- Exercise polling, restart recovery, cancellation, quota/rate-limit errors and
  partial batch failure without accidental repeated paid submissions.
- Verify source import from local images, native preview formats, saved frame
  counts/dimensions and slicing coordinates. Check alpha and anchor alignment
  visually at actual game size.
- Test key redaction, disconnect, disabled-provider handling and account changes;
  do not reuse a remote asset ID across unrelated provider accounts.
- Run the repository public checks and exercise the actual settings/canvas flow.
  Use mocked responses in CI and a small explicit live verification for real
  results. Publish only redacted evidence, not credentials or private projects.

## Upstream compatibility

Follow the [fork maintenance guide](fork-maintenance.md). Isolate provider files
and registrations, version new node/asset contracts, and document migrations.
If upstream adds equivalent tools, compare behavior and migrate existing keys,
saved nodes, local assets and pending jobs before removing the fork adapter.
Do not auto-delete workflows merely because upstream uses the same feature name.

## Verification record

- Public suite: 2,914 passed, 23 skipped, followed by focused checks for subsequent export fixes.
- Isolated browser: guide dragging, undo, nine-slice stretching, save, simulated animation completion, metadata slicing and ZIP download.
- Unity 6000.3.23f1: imported two Sprites and checked asymmetric Y conversion, pivot and all four nine-slice borders from the exported package.
- Godot 4.7.1: executed the importer and checked SpriteFrames, AtlasTexture regions, StyleBoxTexture borders and Button Theme resources. The headless editor emitted cleanup warnings on immediate exit; resource assertions passed.
- Real SpriteCook generation, billing, rate limiting and account differences remain unverified. Website-only per-frame guidance/regeneration controls are outside the public API integration.
