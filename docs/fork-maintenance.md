# Community Studio fork

[中文](fork-maintenance.zh-CN.md)

This is the community-maintained [RemixCat/ohmygame](https://github.com/RemixCat/ohmygame)
fork of [WhiteTowerAI/ohmygame](https://github.com/WhiteTowerAI/ohmygame).
It keeps game-production extensions available while following upstream releases.
It is not an official WhiteTowerAI release or a SpriteCook-endorsed product.
The existing [Apache-2.0 license](../LICENSE) and upstream attribution are retained.
External services require your own account and credentials; their charges and
terms are separate from this repository.

## Available and planned features

Status describes this fork's source code, not the upstream installer.

| Area                                                                                                                             | Status                                                                                                | Guide                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Library organization, project art/UI standards, nested canvas groups, reusable workflow templates, version comparison and review | Available                                                                                             | [Studio workflow](studio-workflow.md) ([中文](studio-workflow.zh-CN.md))                |
| Image shortcuts, object extraction by regeneration, and three-view workflows                                                     | Available; object extraction is not a lossless crop                                                   | [Canvas quick actions](canvas-quick-actions.md) ([中文](canvas-quick-actions.zh-CN.md)) |
| Extended Tripo controls and larger canvas connection targets                                                                     | Available                                                                                             | [3D workflows](3d-providers.md)                                                         |
| Standalone MuMu Suno connection, music nodes, and native MP3/M4A results                                                         | Available; requires your own MuMu key                                                                 | [Audio providers](audio-providers.md#standalone-suno--mumu-connection)                  |
| Native mind maps and topology diagrams | Implemented on `feat/canvas-diagrams`; local editing, relationship labels, layout and Mermaid/Markdown export | [Guide](canvas-diagrams.md) ([中文](canvas-diagrams.zh-CN.md)) |
| SpriteCook sprites, 2D animation, automatic slicing and tilesets                                                                 | Experimental implementation on `feat/spritecook-2d`; live-provider acceptance pending                 | [Development branch](https://github.com/RemixCat/ohmygame/tree/feat/spritecook-2d)      |
| Local animation editing, 9-slice UI editing and Unity/Godot asset export                                                         | Experimental workbench and export helpers on `feat/spritecook-2d`; engine-version acceptance required | Track scope in the SpriteCook development branch                                        |

The Studio extensions currently include upstream **beta.4.9**, merged through
`91ec65f`. This is a recorded integration baseline, not a claim that every newer
upstream commit has been incorporated. Existing upstream and fork changes remain
in Git history; synchronization does not replace the repository with a source dump.

## Run this version from source

There is no separate Studio installer published by this change. The official
download buttons in the README install upstream OhMyGame without these additions.
Use Git, Node.js 22.19 or newer, and Bun 1.4.2 or newer:

```bash
git clone --branch studio https://github.com/RemixCat/ohmygame.git
cd ohmygame
bun install --frozen-lockfile
bun run start:desktop
```

For daily use, `start:desktop` builds and loads the local interface without a Vite server.
On macOS, you can also double-click [scripts/start-desktop.command](../scripts/start-desktop.command).
Use `bun run dev:desktop` only when developing with hot reload; it reserves port 43120.
If that port is occupied, stop the previous development session or use `start:desktop`;
do not terminate an unrelated process just to free the port.

First startup prepares plugins and examples and needs network access. See
[local setup](../CONTRIBUTING.md#start-local-development) for troubleshooting.
Local development does not require private cloud credentials. Hosted publishing
and third-party generation still require their corresponding configuration.

Configure your own model keys in the application. Do not place keys in source
files or commit application data. Current Suno setup is documented in the
[audio guide](audio-providers.md#standalone-suno--mumu-connection).
SpriteCook configuration and local tools are available experimentally on
`feat/spritecook-2d`; see [setup and limits](spritecook.md).

## Branches and contributions

| Branch                                     | Purpose                                                                                            |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `main`, `dev`                              | Retained for upstream release/development tracking; not the Studio extension distribution branches |
| `studio`                                   | Default public integration branch for this fork's available extensions                             |
| `feat/<name>`, `fix/<name>`, `docs/<name>` | Focused changes based on `studio`, reviewed through PRs back to this fork's `studio`               |
| `feat/spritecook-2d`                       | SpriteCook integration work; features remain experimental until implemented and verified           |
| `chore/sync-upstream-<version>`            | Temporary branch to review an upstream merge before integration                                    |

Start a fork contribution with:

```bash
git fetch origin
git switch --no-track -c feat/your-feature origin/studio
```

Open PRs against **`RemixCat/ohmygame:studio`**. Include what changed, why,
verification results, provider prerequisites, and screenshots for UI changes.
Use [this fork's issues](https://github.com/RemixCat/ohmygame/issues) for extension
bugs and proposals. Keep unfinished integrations in draft PRs and mark roadmap
items as planned until they work. No live provider key is needed for public tests.
Use fixtures for automated provider tests and redact secrets from manual evidence.

If proposing a change to upstream, create a separate focused branch from
`upstream/dev` and target `WhiteTowerAI/ohmygame:dev`, following the upstream
instructions in [CONTRIBUTING.md](../CONTRIBUTING.md). Do not submit all Studio
extensions as one unrelated upstream PR.

## Bring in upstream updates

Prefer a selected upstream release for the Studio integration baseline. Fetch
first, inspect its changes, and merge on a temporary branch. For example, with
the already-integrated release tag:

```bash
git remote add upstream https://github.com/WhiteTowerAI/ohmygame.git
git fetch upstream --tags
git switch --no-track -c chore/sync-upstream-beta49 origin/studio
git merge --no-ff v0.0.0-beta.4.9
```

Add the remote only once. The example release is already integrated and will
normally report no changes; replace its tag and branch suffix with the release
you have reviewed. Do not merge an unreviewed upstream development branch simply
because it is newer. Resolve conflicts on the temporary branch, run the public
checks, exercise affected canvas/provider flows, and open a PR to `studio`.
GitHub's [fork synchronization guide](https://docs.github.com/en/pull-requests/how-tos/work-with-forks/syncing-a-fork)
explains fetch and merge; do not force-sync the customized `studio` branch.

Shared areas such as settings, canvas schemas and media job handling can still
conflict. Separate modules reduce the scope of conflicts but do not eliminate them.

## When upstream adds equivalent functionality

1. Compare actual behavior, parameters, output formats, job recovery and saved
   project compatibility. An identical feature name does not establish parity.
2. Keep provider adapters separate from general sprite/slicing tools. Persist
   provider IDs, task IDs and asset metadata so existing work remains identifiable.
3. Add an explicit migration for settings, nodes and assets before removing an
   adapter. Preserve existing media, pending tasks and saved workflow references.
4. Verify migration and rollback on copies of real projects. Document remaining
   differences before deprecating the fork implementation.

Upstream updates and migration remain deliberate reviewed changes; there is no
automatic job that overwrites this fork's code or user projects.

## Releases and verification

Code and documentation can be used from `studio` without a packaged release.
CI is configured for PRs and pushes to `studio`, `dev` and `main` using the existing
public check sequence in [CONTRIBUTING.md](../CONTRIBUTING.md#make-and-check-your-change).
GitHub may require enabling workflows in the fork's Actions tab first. An absent
check result does not mean remote CI passed; local results must be identified as local.
Some hosted publishing tests require private cloud access and can be skipped by
the public suite; passed tests do not establish live provider quality.

Future Studio installers need their own release identity, distribution and update
feed. Follow [desktop releases](desktop-releases.md); do not advertise official
download links as Studio builds or reuse upstream publishing credentials.
