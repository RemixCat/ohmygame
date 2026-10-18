# 社区 Studio 增强版

[English](fork-maintenance.md)

这里是 [RemixCat/ohmygame](https://github.com/RemixCat/ohmygame)，基于
[WhiteTowerAI/ohmygame](https://github.com/WhiteTowerAI/ohmygame) 的社区 Fork。
我们在跟进上游版本的同时维护游戏制作扩展。这不是 WhiteTowerAI 官方发行版，
也不代表 SpriteCook 对本项目的背书。保留原有 [Apache-2.0 许可证](../LICENSE)
及上游署名。第三方服务需要使用者自己的账号和密钥，其费用与条款独立于本仓库。

## 已有功能与计划

这里的状态指本 Fork 源码，不代表官方安装包已包含这些功能。

| 范围                                                                       | 状态                                                                | 文档                                                                                |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 素材库管理、项目美术/UI 规范、画板嵌套分组、可复用流程模板、版本对比与审阅 | 已有                                                                | [制作工作流](studio-workflow.zh-CN.md)（[English](studio-workflow.md)）             |
| 图片快捷操作、参考原图重新生成独立物体、三视图流程                         | 已有；物体拆分不是保留原像素的无损切图                              | [画板快捷操作](canvas-quick-actions.zh-CN.md)（[English](canvas-quick-actions.md)） |
| Tripo 扩展参数与更大的画板连线目标区域                                     | 已有                                                                | [3D 工作流](3d-providers.md)                                                        |
| MuMu Suno 独立连接、音乐节点、原生 MP3/M4A 结果                            | 已有；需要自己的 MuMu 密钥                                          | [音频服务商](audio-providers.md#standalone-suno--mumu-connection)                   |
| 原生思维导图与拓扑图 | `feat/canvas-diagrams` 已实现；本地编辑、关系说明、自动整理、Mermaid/Markdown 导出 | [使用说明](canvas-diagrams.zh-CN.md)（[English](canvas-diagrams.md)） |
| SpriteCook 精灵、2D 动画、自动切图、地形瓦片                               | `feat/spritecook-2d` 已有实验性实现；真实服务商验收待完成           | [开发分支](https://github.com/RemixCat/ohmygame/tree/feat/spritecook-2d)            |
| 本地帧动画编辑、UI 九宫格编辑、Unity/Godot 素材导出                        | `feat/spritecook-2d` 已有实验性工作台和导出辅助；需验证目标引擎版本 | 具体范围见 SpriteCook 开发分支                                                      |

目前增强版包含上游 **beta.4.9**，通过 `91ec65f` 合并。这是已确认的集成基线，
不代表已经包含此后上游的每个提交。上游与 Fork 的修改都保留在 Git 历史里，
同步更新不会用一份源码压缩包覆盖已有开发历史。

## 从源码运行增强版

本次没有发布单独的 Studio 安装包。README 的官方下载按钮安装的是上游版本，
不包含这些扩展。准备 Git、Node.js 22.19 或更新版本、Bun 1.4.2 或更新版本：

```bash
git clone --branch studio https://github.com/RemixCat/ohmygame.git
cd ohmygame
bun install --frozen-lockfile
bun run start:desktop
```

日常使用 `start:desktop` 构建并加载本地界面，不需要 Vite 开发服务器。
macOS 也可以双击 [scripts/start-desktop.command](../scripts/start-desktop.command)。
需要热更新开发时再使用 `bun run dev:desktop`，它会占用 43120 端口。
如果端口已被占用，先关闭之前的开发会话或改用 `start:desktop`，不要直接结束不相关的进程。

首次运行会准备插件和示例，需要网络。故障排查见
[本地开发说明](../CONTRIBUTING.md#start-local-development)。本地开发不要求私有云凭据；
实际云发布和第三方生成仍需要各自的配置。

在应用内填写自己的模型密钥，不要把密钥写入源码或提交应用数据。
已有 Suno 连接方法见[音频指南](audio-providers.md#standalone-suno--mumu-connection)。
SpriteCook 配置与本地工具在 `feat/spritecook-2d` 上提供实验性实现，见[使用与限制](spritecook.zh-CN.md)。

## 分支与贡献方式

| 分支                                       | 用途                                                        |
| ------------------------------------------ | ----------------------------------------------------------- |
| `main`、`dev`                              | 保留用于跟踪上游发布版与开发线，不作为 Studio 扩展分发分支  |
| `studio`                                   | 本 Fork 的默认公开集成分支，包含已有扩展                    |
| `feat/<名称>`、`fix/<名称>`、`docs/<名称>` | 从 `studio` 创建的独立修改，通过 PR 合回本 Fork 的 `studio` |
| `feat/spritecook-2d`                       | SpriteCook 接入开发；实现并验证前不视为已可用功能           |
| `chore/sync-upstream-<版本>`               | 临时上游合并分支，审查并验证后再集成                        |

参与本 Fork 开发：

```bash
git fetch origin
git switch --no-track -c feat/your-feature origin/studio
```

PR 的目标选 **`RemixCat/ohmygame:studio`**，写清修改内容、原因、验证结果、
服务商前提条件；界面修改附截图。扩展的缺陷和提案提交到
[本 Fork 的 Issues](https://github.com/RemixCat/ohmygame/issues)。
未完成接入使用草稿 PR，路线图在功能可用前保持“计划”状态。
公共测试不需要真实服务商密钥；自动测试使用样例响应，手工验证记录去除敏感信息。

如果向官方贡献，另外从 `upstream/dev` 创建聚焦分支，按
[CONTRIBUTING.md](../CONTRIBUTING.md) 向 `WhiteTowerAI/ohmygame:dev` 发 PR，
不要把所有 Studio 扩展打包成一个不相关的大 PR。

## 合并官方更新

增强版优先选择经过审查的上游发布版。先获取代码、查看差异，再到临时分支合并。
以下以已经集成的版本标签为例：

```bash
git remote add upstream https://github.com/WhiteTowerAI/ohmygame.git
git fetch upstream --tags
git switch --no-track -c chore/sync-upstream-beta49 origin/studio
git merge --no-ff v0.0.0-beta.4.9
```

上游远程只需添加一次。示例版本已经合并，通常不会产生新修改；后续请换成已审查的
版本标签及分支后缀。不要仅因为开发线更新就直接混入增强版。在临时分支处理冲突、
运行公共检查、验证受影响的画板与服务商功能，再向 `studio` 发 PR。
获取与合并的原理见 [GitHub Fork 同步指南](https://docs.github.com/en/pull-requests/how-tos/work-with-forks/syncing-a-fork)，
不要对包含定制功能的 `studio` 分支执行强制同步覆盖。

设置页、画板格式、媒体任务等公共位置仍可能冲突。模块独立可以缩小冲突范围，
不能保证零冲突。

## 官方以后也增加同类功能时

1. 对比实际行为、参数、输出格式、任务恢复和存档兼容性，不能只看功能名称相同。
2. 服务商适配与通用精灵、切图工具分开，保存服务商 ID、任务 ID 和素材元数据。
3. 删除适配前，先为配置、节点和素材提供明确迁移，保留已有媒体、未完成任务和流程引用。
4. 在真实项目副本上验证迁移和回退，说明剩余差异后再停用旧实现。

上游更新与迁移都经过审查；没有自动任务覆盖本 Fork 代码或用户项目。

## 发布与验证

没有独立安装包也可以从 `studio` 运行源码。CI 配置覆盖 PR 以及 `studio`、`dev`、`main`
分支推送，检查命令见
[CONTRIBUTING.md](../CONTRIBUTING.md#make-and-check-your-change)。
GitHub 可能要求先在 Fork 的 Actions 页面启用工作流。没有检查结果不代表远端 CI 已通过，
本地验证结果需要明确标注为本地。
部分云发布测试需要私有云权限，公共测试可能跳过；测试通过不代表真实服务商生成质量已经验证。

后续 Studio 安装包需要独立的发行标识、下载渠道和更新源，见
[桌面发布说明](desktop-releases.md)。不能把官方安装包宣传为增强版，也不能复用上游发布凭据。
