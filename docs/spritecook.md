# SpriteCook integration plan

[中文](spritecook.zh-CN.md)

**Status: design only.** The `feat/spritecook-2d` branch currently contains this
proposal, not a working provider connection or canvas implementation. Nothing in
this document is a claim that the features are installed or live-tested.
The target integration branch is `RemixCat/ohmygame:studio`.

## Intended user workflow

Add a fixed **SpriteCook** provider card under **Settings → Providers & Models →
Images**. The connection needs an API key; its default address is
`https://api.spritecook.ai`. Animation and slicing remain distinct operations,
not extra parameters hidden inside ordinary image generation.

Proposed canvas operations:

| Operation           | Inputs                                                                                  | Results                                                   |
| ------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Sprite / UI art     | Prompt, reference, pixel or detailed mode, theme, palette                               | Local image assets with generation metadata               |
| 2D sprite animation | Existing image, motion prompt, supported model and frame count, cleanup options         | Native animation preview, sprite sheet and frame metadata |
| Automatic slicing   | Transparent component sheet, detection threshold, minimum area, padding, merge distance | Reviewable rectangles and separate local images           |
| Tileset             | Terrain prompt, perspective, layout, supported tile size, palette                       | Local tile atlas and layout metadata                      |

Users can connect existing image nodes to animation or slicing; they do not need
to regenerate the source image with SpriteCook. Remote asset import precedes
operations that require a provider-owned asset ID. Keep local sources intact.

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

## Implementation sequence

1. **Provider connection:** isolated daemon adapter and secret store, fixed card
   in the Images category, connection/catalog/credit checks, disconnect support,
   and English/Chinese UI strings. Read endpoints return connection state, never
   the key. Require `generate` and `read_assets`; request `read_credits` only for
   balance display. Keep credentials local and exclude them from project JSON.
2. **Animation and slicing:** source import, supported parameter controls,
   durable job polling/cancellation, native output download, local Library
   records and canvas nodes. Persist remote job and source asset IDs. After an
   ambiguous submit timeout, reconcile the job instead of silently issuing a
   second paid generation. Recovery should resume known jobs after app restart.
3. **Asset review:** frame and loop preview, adjustable local playback rate,
   shared anchor/canvas settings, editable cut rectangles, and clear naming.
   Preview speed is a local setting unless a provider endpoint supports it.
4. **Tilesets and character batches:** discover supported options and actions
   instead of hardcoding all combinations. Preserve partial successes and retry
   only failed operations whose remote state has been reconciled.
5. **UI production tools:** local 9-slice editing, image/atlas/manifest export,
   followed by Unity/Godot import helpers. These are separate implementation
   work, not promised SpriteCook API features.

Reuse existing local media jobs, Library references, project standards, history,
and error presentation where their contracts fit. Keep generic node behavior
independent of SpriteCook so another adapter can be selected later. Download
temporary cleanup results before their links expire. A successful remote status
is insufficient until expected files and metadata have been validated locally.

Show provider-reported prices and credit use where available. Mark unavailable
estimates as unknown; do not infer animation prices from ordinary image costs.
Provider account restrictions and quotas must remain visible as errors, including
the task ID when one exists. Do not send provider Authorization headers to
unrelated result-download hosts or include keys in diagnostics.

## Verification before marking available

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
