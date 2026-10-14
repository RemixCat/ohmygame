# Studio workflow validation — 2026-10-14

Implementation branch: `feat/studio-workflow`. Code baseline: `37abd31`,
backup tag: `backup/pre-studio-workflow-2026-10-14`. See
[rollback steps](studio-rollback.md) for the independent data backup.

## Automated checks

- Preinstalled plugin preparation: passed, existing pinned plugin reused.
- TypeScript typecheck: passed.
- Full suite: 234 test files passed, one file skipped; 2261 tests passed,
  21 skipped. Model environment keys were unset for these fixture-based checks
  to prevent unrelated provider discovery calls.
- Renderer and sandbox builds: passed.
- Node.js 26.8.1 startup, authenticated API, native MCP runtime and graceful
  shutdown: passed.
- New file formatting and `git diff --check`: passed.

New coverage verifies project isolation, atomic version conflicts, immutable
standard and template history, generation retry snapshots, reference handling
for legacy image sizes and 3D operations, nested groups, copying, merging,
format 1 migration and backup restoration, workflow input ordering, and
cross-project document/table/Markdown media materialization. A simulated
character workflow generates a candidate, marks it reviewed and selected,
instantiates and runs three views, produces a fixture GLB, and verifies that
this does not establish game integration.

## Browser checks

Used isolated `/tmp/ohmygame-studio-ui` data. Actual desktop Library and external
game workspace were not changed. Verified:

- Activated default project standards persist after daemon restart.
- Create folders, tags and a version series through application dialogs; bulk
  organization and project review save; local drafts recover after reload.
- A project-selected candidate retains its badge after reload. Smart filters
  retain the project review context and recompute results.
- Image comparison uses paired images with synchronized zoom; wide three-column
  Library and narrow classification/details drawers are accessible.
- Create and switch a second asset board, retaining the original board contents.
- Expand/collapse groups, duplicate and undo, display inherited standards, save
  a group as a workflow after dependency review, and insert it into another
  board without starting generation.

Screenshots are saved outside Git in `../ohmygame-studio-evidence/`: Library,
comparison, standards, groups and templates. The fox pictures are local UI
fixtures, not AI quality evidence.

## Remaining live acceptance

Real image/3D generation and the final role-to-gameplay screenshot review have
not been performed with a paid provider or the user's game. Specification
checks are recorded manually and remain separate from visual acceptance;
standards are textual constraints, while provider parameters follow the
existing supported generation controls. Ordinary node clipboard operations
detach group membership; use **Duplicate group** or workflow templates to
preserve nested hierarchy. The full private-data recovery procedure is
documented; automated recovery was exercised on temporary boards rather than
restoring the user's actual backup over their working data.
