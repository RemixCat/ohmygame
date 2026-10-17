# Upstream beta.4.9 integration — 2026-10-17

Merged released tag `v0.0.0-beta.4.9` (`313281f2`) into the local
`feat/studio-workflow` customizations, based on snapshot `d66bc1ba`.
Development commits after that release are outside this integration.

## Compatibility

Eleven files required conflict resolution. Both upstream behavior and local
extensions are retained, including nested groups, standards, reviews, Library
organization, workflow templates, generation receipts, image quick actions,
advanced Tripo settings and whole-card connection targets.

- Audio prompt links and speech text variables participate in group duplication
  and workflow capture/insertion. Captured templates discard previous audio results.
- Option/Alt-drag copies individual nodes without retaining group membership.
  Dragging a group frame with Option/Alt still moves its members together.
- Project production saves and bulk project reviews honor upstream checkpoint
  locks and workspace versions, preventing stale saves after a restore.
- Speech receipts preserve the spoken text. Visual standards are not appended
  to audio generation inputs.

Upstream adds audio nodes, Option/Alt-drag duplication, canvas gesture fixes,
agent file checkpoint diffs/undo, workspace Git views and video timeline changes.
Audio generation requires a configured compatible provider; sound effects and
music still require provider adapters. See [audio providers](audio-providers.md).
The Pi dependencies and matching patch move from 0.99.2 to 1.2.0.

## Validation

- Frozen dependency install and pinned plugin preparation: passed.
- Changelog check and TypeScript typecheck: passed.
- Full suite: 272 files passed, one skipped; 2867 tests passed, 23 skipped.
  Fixture tests ran with ambient model credentials unset. Skipped cloud/live
  contracts do not establish hosted service or paid provider compatibility.
- Renderer/sandbox builds: passed (Vite reports the existing large chunk warning).
- Node 26.8.1: host/player build, daemon startup, authenticated API, native MCP
  runtime and graceful shutdown passed.
- Browser: advanced Tripo controls open, adaptive face count updates, fit-view
  works, and dragging an image output onto the middle of a 3D card creates
  one connection. Used the isolated `.runtime/tripo-qa` fixture on port 43121;
  no paid generation request was made.
- Regression tests cover audio template links/variables, grouped Alt-drag and
  stale/busy production and bulk review writes.

## Backup and activation

The sibling `backups/pre-upstream-beta49-20261017-164153/` directory holds the
pre-merge Git bundle, working-tree patch, untracked source archive, manifest
and desktop data copy. The data copy was taken while the app was running;
it is a precautionary live copy, not a quiescent database snapshot.
The local `backup/pre-upstream-beta49-20261017-164153` branch preserves the
custom source snapshot.

The running desktop process was not restarted. Restart it to load the updated
backend and dependencies after source integration. Real paid generation and
cloud publishing were not exercised.
