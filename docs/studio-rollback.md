# Studio workflow rollback

## Saved code baseline

- Quick-actions baseline: `37abd31` (`feat/canvas-quick-actions`).
- Backup tag: `backup/pre-studio-workflow-2026-10-14`, pushed to `RemixCat/ohmygame`.
- Development branch: `feat/studio-workflow`, based on `upstream/dev` with the quick-actions branch merged. The original branch remains available. No force push is required.

Before switching code, stop OhMyGame and preserve current uncommitted work. Use a separate checkout (`git worktree add <new-checkout> backup/pre-studio-workflow-2026-10-14`) to inspect the baseline without resetting the working checkout. To run the old version, use that checkout after restoring compatible data below.

## Saved data baseline

The pre-development data backup is outside Git:

`../backups/pre-studio-workflow-20261014-153133/manifest.json`

Its manifest maps each original directory to a complete clone backup. This includes the desktop application data and referenced external project workspace. Keep that folder private; it may contain provider settings. Git does not contain or restore these files.

1. Stop all OhMyGame instances so no process can write while recovering.
2. Move each **current** original directory to a dated safety copy; do not delete it.
3. Copy its corresponding backup directory to the original source path recorded in the manifest, preserving file metadata (`cp -a <backup> <source>` when the source has been moved).
4. Run the baseline checkout. Check the Library and project boards before continuing work.
5. To return to the new version, stop it again, move restored baseline data aside and put the dated safety copies back at their original paths.

A code-only rollback is insufficient after writing format 2 grouped boards. The first upgrade also preserves `<board-id>.v1-backup.json` under both `canvas/boards` and `canvas/editor`; these permit a board-level recovery but do not restore the entire Library or project history. Preserve both semantic board and editor layout versions together. Restore global metadata and project metadata from the same recovery point.

Local browser drafts are a separate recovery layer. A draft retains its original revision; stale drafts fail with 409. After a deliberate disk recovery, use **Reload from disk** to discard an obsolete draft before saving again.

The automated compatibility suite creates format 1 data, upgrades it, checks format 2 plus the saved backup, restores both semantic board and layout from their format 1 backups, and validates reference integrity. Manual UI verification uses `/tmp/ohmygame-studio-ui`, keeping actual application data unchanged during development.
